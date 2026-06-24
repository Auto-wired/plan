import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createProvider } from './providers/index.ts'
import type { Message } from './providers/types.ts'
import {
  buildSystemPrompt,
  buildUpdateFields,
  type CalendarEvent,
  executeTool,
  QUERY_DEFAULT_LIMIT,
  TOOL_DEFINITIONS,
} from './tools.ts'
import {
  canonicalQueryArgsForPagination,
  occurrenceTimeSnapshot,
  resolvedToSessionLastQuery,
  resolveQuerySchedule,
} from './resolveSchedule.ts'
import type { SessionContext } from './scheduleSpec.ts'
import { prepareAmbiguousPending } from './confirmProposal.ts'
import {
  enrichToolArgs,
  isFrozenPendingArgs,
  stripPendingInternalFields,
} from './enrichToolArgs.ts'
import type { IdentifyCandidate } from './identifyEvents.ts'
import { continueAfterPickTarget, gateMutationTarget } from './mutationGate.ts'
import {
  deleteRecurringByScope,
  updateRecurringByScope,
} from './recurrenceActions.ts'
import {
  isBlockedRecurringMutation,
  isRecurringCreateArgs,
  isRecurringMaster,
  RECURRING_MUTATION_BLOCKED_MESSAGE,
} from './recurringPolicy.ts'

const APP_TIMEZONE = 'Asia/Seoul'

type ResultKind = 'create' | 'update' | 'delete' | 'query'

const TOOL_RESULT_KIND: Record<string, ResultKind> = {
  create_event: 'create',
  update_event: 'update',
  delete_event: 'delete',
  query_events: 'query',
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  message: string
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  currentDate?: string
  timezone?: string
  sessionContext?: SessionContext
  /** 'paginate' = 더보기, 'confirm' = 맞다/아니다·삭제 승인, 'pick-target' = 목록 선택 후속. */
  mode?: 'paginate' | 'confirm' | 'pick-target'
  queryArgs?: Record<string, unknown>
  offset?: number
  /** mode='confirm'일 때 실행할 구조화 액션. */
  pendingAction?: { tool: string; arguments: Record<string, unknown> }
  /** mode='pick-target'일 때 선택한 일정 id. */
  selectedEventId?: string
  /** mode='pick-target'일 때 보류 중인 mutation 의도. */
  pendingIntent?: { tool: string; arguments: Record<string, unknown> }
  /** pick-target 직전이 propose_action 경로였는지. */
  fromPropose?: boolean
  /** confirm 시 원래 사용자 메시지 (되묻기 트리거). */
  triggerUserMessage?: string
  /** 반복 수정·삭제 확인에서 선택한 범위. */
  scope?: 'this' | 'all'
}

interface PendingConfirmation {
  kind: 'delete' | 'recurring-delete' | 'recurring-update' | 'ambiguous' | 'pick-target'
  message: string
  pendingAction?: { tool: string; arguments: Record<string, unknown> }
  /** pick-target: 후보 목록 */
  candidates?: IdentifyCandidate[]
  /** pick-target: 선택 후 이어갈 mutation */
  pendingIntent?: { tool: string; arguments: Record<string, unknown> }
  /** pick-target: propose 경유 여부 */
  fromPropose?: boolean
  target?: { title: string; start_at: string; end_at: string; all_day: boolean } | null
  /** recurring-delete: 유한 반복의 마지막 1회차 → 「전체 삭제」만 */
  lastOne?: boolean
  /** 되묻기를 트리거한 사용자 메시지 (confirm/pick 시 재전달). */
  triggerUserMessage?: string
}

function confirmReply(tool: string): string {
  switch (tool) {
    case 'delete_event':
      return '일정을 삭제했습니다.'
    case 'create_event':
      return '일정을 추가했습니다.'
    case 'update_event':
      return '일정을 수정했습니다.'
    default:
      return '요청을 처리했습니다.'
  }
}

interface QueryInfo {
  args: Record<string, unknown>
  total: number
  offset: number
  limit: number
  hasMore: boolean
  resolved?: ReturnType<typeof resolvedToSessionLastQuery> | null
}

interface AIAction {
  tool: string
  result: unknown
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body: RequestBody = await req.json()
    const { message, conversationHistory = [], currentDate, mode, queryArgs, sessionContext } =
      body
    const effectiveDate = currentDate ?? new Date().toISOString()

    // 더보기: LLM 없이 동일 조건으로 추가 페이지만 조회
    if (mode === 'paginate') {
      const offset = typeof body.offset === 'number' ? body.offset : 0
      const paginateArgs = { ...(queryArgs ?? {}), offset }
      const resolvedSchedule = resolveQuerySchedule(paginateArgs, effectiveDate, APP_TIMEZONE)
      const { result, events } = await executeTool(
        supabase,
        user.id,
        'query_events',
        paginateArgs,
        APP_TIMEZONE,
        effectiveDate,
      )
      const r = result as {
        total?: number
        offset?: number
        limit?: number
        hasMore?: boolean
      }
      const query: QueryInfo = {
        args: canonicalQueryArgsForPagination(paginateArgs, resolvedSchedule),
        total: r.total ?? events.length,
        offset: r.offset ?? offset,
        limit: r.limit ?? QUERY_DEFAULT_LIMIT,
        hasMore: r.hasMore ?? false,
        resolved: resolvedSchedule ? resolvedToSessionLastQuery(resolvedSchedule) : null,
      }
      return new Response(
        JSON.stringify({ reply: '', actions: [], events, resultKind: 'query', query }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // pick-target: 목록에서 일정 선택 후 후속 mutation (V3)
    if (mode === 'pick-target') {
      const intent = body.pendingIntent
      const selectedId = String(body.selectedEventId ?? '').trim()
      if (!intent?.tool || !selectedId) {
        return new Response(
          JSON.stringify({ error: 'pendingIntent and selectedEventId are required' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      const triggerUserMessage = body.triggerUserMessage ?? ''
      const merged = { ...intent.arguments, id: selectedId }

      if (await isBlockedRecurringMutation(supabase, intent.tool, merged)) {
        return new Response(
          JSON.stringify({
            reply: RECURRING_MUTATION_BLOCKED_MESSAGE,
            actions: [],
            events: [],
            resultKind: null,
            query: null,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const continuation = await continueAfterPickTarget(
        supabase,
        user.id,
        intent.tool,
        merged,
        triggerUserMessage,
        body.sessionContext,
        effectiveDate,
        APP_TIMEZONE,
        { fromPropose: body.fromPropose ?? false },
        async (tool, args, userMessage) => {
          const execArgs = isFrozenPendingArgs(args)
            ? stripPendingInternalFields(args)
            : enrichToolArgs(tool, args, userMessage, body.sessionContext)
          return executeTool(
            supabase,
            user.id,
            tool,
            execArgs,
            APP_TIMEZONE,
            effectiveDate,
            { userMessage },
          )
        },
      )

      if (continuation.kind === 'pending') {
        return new Response(
          JSON.stringify({
            reply: continuation.pendingConfirmation.message,
            actions: [],
            events: [],
            resultKind: null,
            query: null,
            pendingConfirmation: continuation.pendingConfirmation,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const resultKind = TOOL_RESULT_KIND[continuation.tool] ?? null
      return new Response(
        JSON.stringify({
          reply: confirmReply(continuation.tool),
          actions: [{ tool: continuation.tool, result: continuation.result }],
          events: continuation.events,
          resultKind,
          query: null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 되묻기 승인: LLM 없이 보류된 구조화 액션을 그대로 실행
    if (mode === 'confirm') {
      const pending = body.pendingAction
      if (!pending?.tool) {
        return new Response(JSON.stringify({ error: 'pendingAction is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (await isBlockedRecurringMutation(supabase, pending.tool, pending.arguments ?? {})) {
        return new Response(
          JSON.stringify({
            reply: RECURRING_MUTATION_BLOCKED_MESSAGE,
            actions: [],
            events: [],
            resultKind: null,
            query: null,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const scope = body.scope
      const confirmUserMessage = body.triggerUserMessage ?? ''
      const confirmSessionContext = body.sessionContext

      let execArgs = pending.arguments ?? {}
      if (isFrozenPendingArgs(execArgs)) {
        execArgs = stripPendingInternalFields(execArgs)
      } else {
        execArgs = enrichToolArgs(
          pending.tool,
          execArgs,
          confirmUserMessage,
          confirmSessionContext,
        )
      }

      let result: unknown = { success: true }
      let events: Awaited<ReturnType<typeof executeTool>>['events'] = []
      let resultKind: ResultKind | null = TOOL_RESULT_KIND[pending.tool] ?? null

      if (scope && (pending.tool === 'delete_event' || pending.tool === 'update_event')) {
        // 반복 일정 범위 처리(달력과 동일)
        const masterId = String(execArgs.id ?? '')
        const originalStartAt =
          String(execArgs.original_start_at ?? '').trim() || undefined
        const { data: master } = await supabase
          .from('events')
          .select('*')
          .eq('id', masterId)
          .maybeSingle()
        if (!master) throw new Error('대상 일정을 찾을 수 없습니다.')

        if (master.recurrence_freq && scope === 'this' && !originalStartAt) {
          throw new Error(
            '반복 일정의 해당 회차를 특정할 수 없습니다. 날짜를 알려 주거나 먼저 조회해 주세요.',
          )
        }

        const occStart = originalStartAt ?? master.start_at

        if (pending.tool === 'delete_event') {
          events = await deleteRecurringByScope(supabase, master, occStart, scope)
          resultKind = 'delete'
        } else {
          const snapshot = occurrenceTimeSnapshot(
            {
              start_at: master.start_at,
              end_at: master.end_at,
              all_day: master.all_day,
            },
            originalStartAt,
          )
          const fields = buildUpdateFields(
            execArgs,
            APP_TIMEZONE,
            effectiveDate,
            snapshot,
            confirmUserMessage,
          )
          events = await updateRecurringByScope(supabase, master, occStart, scope, fields)
          resultKind = 'update'
        }
      } else {
        const r = await executeTool(
          supabase,
          user.id,
          pending.tool,
          execArgs,
          APP_TIMEZONE,
          effectiveDate,
          { userMessage: confirmUserMessage },
        )
        result = r.result
        events = r.events
      }

      const uniqueEvents = events.filter(
        (event, index, self) =>
          self.findIndex((e) => e.id === event.id && e.start_at === event.start_at) === index,
      )

      return new Response(
        JSON.stringify({
          reply: confirmReply(pending.tool),
          actions: [{ tool: pending.tool, result }],
          events: uniqueEvents,
          resultKind,
          query: null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const provider = createProvider()
    const systemPrompt = buildSystemPrompt(effectiveDate, APP_TIMEZONE, sessionContext)

    const messages: Message[] = [
      ...conversationHistory.map((m) => ({
        role: m.role as Message['role'],
        content: m.content,
      })),
      { role: 'user' as const, content: message },
    ]

    const actions: AIAction[] = []
    let collectedEvents: Awaited<ReturnType<typeof executeTool>>['events'] = []
    let reply = ''
    let blockedReply: string | null = null
    let resultKind: ResultKind | null = null
    let queryInfo: QueryInfo | null = null
    let pendingConfirmation: PendingConfirmation | null = null
    const maxTurns = 5

    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await provider.chat({
        systemPrompt,
        messages,
        tools: TOOL_DEFINITIONS,
      })

      if (response.toolCalls.length === 0) {
        reply = response.content || '요청을 처리했습니다.'
        break
      }

      for (const toolCall of response.toolCalls) {
        // 삭제는 즉시 실행하지 않고 사용자 확인을 받는다(되묻기)
        if (toolCall.name === 'delete_event') {
          let args = enrichToolArgs(
            'delete_event',
            { ...toolCall.arguments },
            message,
            sessionContext,
          )

          const gate = await gateMutationTarget(
            supabase,
            'delete_event',
            args,
            message,
            effectiveDate,
            APP_TIMEZONE,
            sessionContext,
          )
          if (gate.kind === 'chat') {
            blockedReply = gate.message
            break
          }
          if (gate.kind === 'pick-target') {
            pendingConfirmation = {
              kind: 'pick-target',
              message: gate.message,
              candidates: gate.candidates,
              pendingIntent: gate.pendingIntent,
              fromPropose: false,
              triggerUserMessage: message,
            }
            break
          }
          args = gate.args

          const targetId = String(args.id ?? '')
          let masterRow: CalendarEvent | null = null
          if (targetId) {
            const { data } = await supabase
              .from('events')
              .select('*')
              .eq('id', targetId)
              .maybeSingle()
            if (data) masterRow = data as CalendarEvent
          }

          const target: PendingConfirmation['target'] = masterRow
            ? {
                title: masterRow.title,
                start_at: masterRow.start_at,
                end_at: masterRow.end_at,
                all_day: masterRow.all_day,
              }
            : null

          if (isRecurringMaster(masterRow)) {
            blockedReply = RECURRING_MUTATION_BLOCKED_MESSAGE
            break
          }

          pendingConfirmation = {
            kind: 'delete',
            message: target ? `'${target.title}' 일정을 삭제할까요?` : '이 일정을 삭제할까요?',
            pendingAction: { tool: 'delete_event', arguments: args },
            target,
            triggerUserMessage: message,
          }
          break
        }

        // 반복 일정 수정은 차단 (비반복은 V3 gate 후 실행)
        if (toolCall.name === 'update_event') {
          let args = enrichToolArgs(
            'update_event',
            { ...toolCall.arguments },
            message,
            sessionContext,
          )

          const gate = await gateMutationTarget(
            supabase,
            'update_event',
            args,
            message,
            effectiveDate,
            APP_TIMEZONE,
            sessionContext,
          )
          if (gate.kind === 'chat') {
            blockedReply = gate.message
            break
          }
          if (gate.kind === 'pick-target') {
            pendingConfirmation = {
              kind: 'pick-target',
              message: gate.message,
              candidates: gate.candidates,
              pendingIntent: gate.pendingIntent,
              fromPropose: false,
              triggerUserMessage: message,
            }
            break
          }
          args = gate.args
          toolCall.arguments = args

          const targetId = String(args.id ?? '')
          if (targetId) {
            const { data } = await supabase
              .from('events')
              .select('recurrence_freq')
              .eq('id', targetId)
              .maybeSingle()
            if (data?.recurrence_freq) {
              blockedReply = RECURRING_MUTATION_BLOCKED_MESSAGE
              break
            }
          }
          // 비반복: 아래 일반 실행 경로로 진행
        }

        // 모호한 요청: V3 gate → 해석 확인(propose)
        if (toolCall.name === 'propose_action') {
          const action = toolCall.arguments.action as
            | { name?: string; arguments?: Record<string, unknown> }
            | undefined
          const nestedTool = action?.name ?? ''
          const nestedArgs = action?.arguments ?? {}
          if (
            nestedTool &&
            (isRecurringCreateArgs(nestedArgs) ||
              (await isBlockedRecurringMutation(supabase, nestedTool, nestedArgs)))
          ) {
            blockedReply = RECURRING_MUTATION_BLOCKED_MESSAGE
            break
          }

          if (nestedTool === 'update_event' || nestedTool === 'delete_event') {
            const gate = await gateMutationTarget(
              supabase,
              nestedTool,
              nestedArgs,
              message,
              effectiveDate,
              APP_TIMEZONE,
              sessionContext,
            )
            if (gate.kind === 'chat') {
              blockedReply = gate.message
              break
            }
            if (gate.kind === 'pick-target') {
              pendingConfirmation = {
                kind: 'pick-target',
                message: gate.message,
                candidates: gate.candidates,
                pendingIntent: gate.pendingIntent,
                fromPropose: true,
                triggerUserMessage: message,
              }
              break
            }
            const prepared = await prepareAmbiguousPending(
              supabase,
              nestedTool,
              gate.args,
              message,
              sessionContext,
              effectiveDate,
              APP_TIMEZONE,
            )
            pendingConfirmation = {
              kind: 'ambiguous',
              message: prepared.message,
              pendingAction: prepared.pendingAction,
              target: prepared.target,
              triggerUserMessage: message,
            }
            break
          }

          const prepared = await prepareAmbiguousPending(
            supabase,
            nestedTool,
            nestedArgs,
            message,
            sessionContext,
            effectiveDate,
            APP_TIMEZONE,
          )
          pendingConfirmation = {
            kind: 'ambiguous',
            message: prepared.message,
            pendingAction: prepared.pendingAction,
            target: prepared.target,
            triggerUserMessage: message,
          }
          break
        }

        if (toolCall.name === 'create_event' && isRecurringCreateArgs(toolCall.arguments)) {
          blockedReply = RECURRING_MUTATION_BLOCKED_MESSAGE
          break
        }

        try {
          const toolArgs = enrichToolArgs(
            toolCall.name,
            toolCall.arguments,
            message,
            sessionContext,
          )

          const { result, events } = await executeTool(
            supabase,
            user.id,
            toolCall.name,
            toolArgs,
            APP_TIMEZONE,
            effectiveDate,
            { userMessage: message },
          )
          actions.push({ tool: toolCall.name, result })
          if (events.length) {
            collectedEvents = [...collectedEvents, ...events]
          }

          resultKind = TOOL_RESULT_KIND[toolCall.name] ?? resultKind
          if (toolCall.name === 'query_events' && result && typeof result === 'object') {
            const r = result as {
              total?: number
              offset?: number
              limit?: number
              hasMore?: boolean
              resolved?: Record<string, unknown> | null
            }
            const resolvedSchedule = resolveQuerySchedule(toolArgs, effectiveDate, APP_TIMEZONE)
            queryInfo = {
              args: canonicalQueryArgsForPagination(toolArgs, resolvedSchedule),
              total: r.total ?? events.length,
              offset: r.offset ?? 0,
              limit: r.limit ?? QUERY_DEFAULT_LIMIT,
              hasMore: r.hasMore ?? false,
              resolved: resolvedSchedule
                ? resolvedToSessionLastQuery(resolvedSchedule)
                : null,
            }
          }

          messages.push({
            role: 'assistant',
            content: `Called tool ${toolCall.name}`,
          })
          messages.push({
            role: 'tool',
            content: JSON.stringify(result),
            toolCallId: toolCall.name,
          })
        } catch (toolError) {
          const errorMessage = toolError instanceof Error ? toolError.message : 'Tool execution failed'
          messages.push({
            role: 'tool',
            content: JSON.stringify({ error: errorMessage }),
            toolCallId: toolCall.name,
          })
        }
      }

      if (pendingConfirmation || blockedReply) break

      if (turn === maxTurns - 1) {
        reply = response.content || '요청을 처리했습니다.'
      }
    }

    if (blockedReply) {
      return new Response(
        JSON.stringify({
          reply: blockedReply,
          actions: [],
          events: [],
          resultKind: null,
          query: null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 되묻기: 확인 UI만 반환하고 실행은 보류
    if (pendingConfirmation) {
      return new Response(
        JSON.stringify({
          reply: pendingConfirmation.message,
          actions: [],
          events: [],
          resultKind: null,
          query: null,
          pendingConfirmation,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!reply && actions.length > 0) {
      const finalResponse = await provider.chat({
        systemPrompt,
        messages: [
          ...messages,
          {
            role: 'user',
            content: 'Summarize the tool results above in natural Korean for the user.',
          },
        ],
        tools: [],
      })
      reply = finalResponse.content || '요청을 처리했습니다.'
    }

    const uniqueEvents = collectedEvents.filter(
      (event, index, self) =>
        self.findIndex((e) => e.id === event.id && e.start_at === event.start_at) === index,
    )

    return new Response(
      JSON.stringify({
        reply,
        actions,
        events: uniqueEvents,
        resultKind,
        query: queryInfo,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
