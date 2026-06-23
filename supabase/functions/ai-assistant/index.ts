import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createProvider } from './providers/index.ts'
import type { Message } from './providers/types.ts'
import { type QueryPeriod } from './dateRanges.ts'
import {
  buildSystemPrompt,
  buildUpdateFields,
  type CalendarEvent,
  executeTool,
  QUERY_DEFAULT_LIMIT,
  TOOL_DEFINITIONS,
} from './tools.ts'
import {
  countRemaining,
  deleteRecurringByScope,
  fetchExceptions,
  updateRecurringByScope,
} from './recurrenceActions.ts'

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
  /** 'paginate' = 더보기(LLM 미호출), 'confirm' = 되묻기 승인 후 실행(LLM 미호출). */
  mode?: 'paginate' | 'confirm'
  queryArgs?: Record<string, unknown>
  offset?: number
  /** mode='confirm'일 때 실행할 구조화 액션. */
  pendingAction?: { tool: string; arguments: Record<string, unknown> }
  /** 반복 수정·삭제 확인에서 선택한 범위. */
  scope?: 'this' | 'all'
}

interface PendingConfirmation {
  kind: 'delete' | 'recurring-delete' | 'recurring-update' | 'ambiguous'
  message: string
  pendingAction: { tool: string; arguments: Record<string, unknown> }
  target?: { title: string; start_at: string; end_at: string; all_day: boolean } | null
  /** recurring-delete: 유한 반복의 마지막 1회차 → 「전체 삭제」만 */
  lastOne?: boolean
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
}

interface AIAction {
  tool: string
  result: unknown
}

const MESSAGE_PERIOD_PATTERNS: Array<{ pattern: RegExp; period: QueryPeriod }> = [
  { pattern: /이번\s*주|this\s*week/i, period: 'this_week' },
  { pattern: /다음\s*주|next\s*week/i, period: 'next_week' },
  { pattern: /지난\s*주|last\s*week/i, period: 'last_week' },
  { pattern: /이번\s*달|this\s*month/i, period: 'this_month' },
  { pattern: /다음\s*달|next\s*month/i, period: 'next_month' },
  { pattern: /지난\s*달|last\s*month/i, period: 'last_month' },
  { pattern: /올해|금년|this\s*year/i, period: 'this_year' },
  { pattern: /\b오늘\b|\btoday\b/i, period: 'today' },
  { pattern: /\b내일\b|\btomorrow\b/i, period: 'tomorrow' },
  { pattern: /\b어제\b|\byesterday\b/i, period: 'yesterday' },
]

function inferQueryPeriodFromMessage(message: string): QueryPeriod | null {
  for (const { pattern, period } of MESSAGE_PERIOD_PATTERNS) {
    if (pattern.test(message)) return period
  }
  return null
}

function enrichQueryEventArgs(
  toolName: string,
  args: Record<string, unknown>,
  userMessage: string,
): Record<string, unknown> {
  if (toolName !== 'query_events') return args

  const inferred = inferQueryPeriodFromMessage(userMessage)
  if (!inferred) return args

  return {
    ...args,
    period: inferred,
    start_date: undefined,
    end_date: undefined,
  }
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
    const { message, conversationHistory = [], currentDate, mode, queryArgs } = body
    const effectiveDate = currentDate ?? new Date().toISOString()

    // 더보기: LLM 없이 동일 조건으로 추가 페이지만 조회
    if (mode === 'paginate') {
      const offset = typeof body.offset === 'number' ? body.offset : 0
      const { result, events } = await executeTool(
        supabase,
        user.id,
        'query_events',
        { ...(queryArgs ?? {}), offset },
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
        args: queryArgs ?? {},
        total: r.total ?? events.length,
        offset: r.offset ?? offset,
        limit: r.limit ?? QUERY_DEFAULT_LIMIT,
        hasMore: r.hasMore ?? false,
      }
      return new Response(
        JSON.stringify({ reply: '', actions: [], events, resultKind: 'query', query }),
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

      const scope = body.scope
      let result: unknown = { success: true }
      let events: Awaited<ReturnType<typeof executeTool>>['events'] = []
      let resultKind: ResultKind | null = TOOL_RESULT_KIND[pending.tool] ?? null

      if (scope && (pending.tool === 'delete_event' || pending.tool === 'update_event')) {
        // 반복 일정 범위 처리(달력과 동일)
        const masterId = String(pending.arguments.id ?? '')
        const originalStartAt =
          String(pending.arguments.original_start_at ?? '') || undefined
        const { data: master } = await supabase
          .from('events')
          .select('*')
          .eq('id', masterId)
          .maybeSingle()
        if (!master) throw new Error('대상 일정을 찾을 수 없습니다.')

        const occStart = originalStartAt ?? master.start_at

        if (pending.tool === 'delete_event') {
          events = await deleteRecurringByScope(supabase, master, occStart, scope)
          resultKind = 'delete'
        } else {
          const fields = buildUpdateFields(pending.arguments, APP_TIMEZONE)
          events = await updateRecurringByScope(supabase, master, occStart, scope, fields)
          resultKind = 'update'
        }
      } else {
        const r = await executeTool(
          supabase,
          user.id,
          pending.tool,
          pending.arguments ?? {},
          APP_TIMEZONE,
          effectiveDate,
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
    const systemPrompt = buildSystemPrompt(effectiveDate, APP_TIMEZONE)

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
          const targetId = String(toolCall.arguments.id ?? '')
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
          const args = { ...toolCall.arguments }

          if (masterRow?.recurrence_freq) {
            if (!args.original_start_at) args.original_start_at = masterRow.start_at
            const exceptions = await fetchExceptions(supabase, masterRow.id)
            const remaining = countRemaining(masterRow, exceptions)
            pendingConfirmation = {
              kind: 'recurring-delete',
              message: `반복 일정 '${target?.title ?? ''}'을(를) 어떻게 삭제할까요?`,
              pendingAction: { tool: 'delete_event', arguments: args },
              target,
              lastOne: Number.isFinite(remaining) && remaining === 1,
            }
          } else {
            pendingConfirmation = {
              kind: 'delete',
              message: target ? `'${target.title}' 일정을 삭제할까요?` : '이 일정을 삭제할까요?',
              pendingAction: { tool: 'delete_event', arguments: args },
              target,
            }
          }
          break
        }

        // 반복 일정 수정은 범위 선택 확인을 받는다(비반복은 즉시 실행)
        if (toolCall.name === 'update_event') {
          const targetId = String(toolCall.arguments.id ?? '')
          let target: PendingConfirmation['target'] = null
          let isRecurring = false
          let masterStart = ''
          if (targetId) {
            const { data } = await supabase
              .from('events')
              .select('*')
              .eq('id', targetId)
              .maybeSingle()
            if (data) {
              isRecurring = !!data.recurrence_freq
              masterStart = data.start_at
              target = {
                title: data.title,
                start_at: data.start_at,
                end_at: data.end_at,
                all_day: data.all_day,
              }
            }
          }

          if (isRecurring) {
            const args = { ...toolCall.arguments }
            if (!args.original_start_at) args.original_start_at = masterStart
            pendingConfirmation = {
              kind: 'recurring-update',
              message: `반복 일정 '${target?.title ?? ''}'을(를) 어떻게 수정할까요?`,
              pendingAction: { tool: 'update_event', arguments: args },
              target,
            }
            break
          }
          // 비반복: 아래 일반 실행 경로로 진행
        }

        // 모호한 요청: 추측 해석을 제안하고 확인을 받는다
        if (toolCall.name === 'propose_action') {
          const question = String(toolCall.arguments.question ?? '요청을 이렇게 처리할까요?')
          const action = toolCall.arguments.action as
            | { name?: string; arguments?: Record<string, unknown> }
            | undefined
          pendingConfirmation = {
            kind: 'ambiguous',
            message: question,
            pendingAction: {
              tool: action?.name ?? '',
              arguments: action?.arguments ?? {},
            },
          }
          break
        }

        try {
          const toolArgs = enrichQueryEventArgs(
            toolCall.name,
            toolCall.arguments,
            message,
          )

          const { result, events } = await executeTool(
            supabase,
            user.id,
            toolCall.name,
            toolArgs,
            APP_TIMEZONE,
            effectiveDate,
          )
          actions.push({ tool: toolCall.name, result })
          if (events.length) {
            collectedEvents = [...collectedEvents, ...events]
          }

          resultKind = TOOL_RESULT_KIND[toolCall.name] ?? resultKind
          if (toolCall.name === 'query_events' && result && typeof result === 'object') {
            const r = result as { total?: number; offset?: number; limit?: number; hasMore?: boolean }
            queryInfo = {
              args: toolArgs,
              total: r.total ?? events.length,
              offset: r.offset ?? 0,
              limit: r.limit ?? QUERY_DEFAULT_LIMIT,
              hasMore: r.hasMore ?? false,
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

      if (pendingConfirmation) break

      if (turn === maxTurns - 1) {
        reply = response.content || '요청을 처리했습니다.'
      }
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
