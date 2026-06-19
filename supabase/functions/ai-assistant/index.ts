import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createProvider } from './providers/index.ts'
import type { Message } from './providers/types.ts'
import { type QueryPeriod } from './dateRanges.ts'
import { buildSystemPrompt, executeTool, TOOL_DEFINITIONS } from './tools.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  message: string
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  currentDate?: string
  timezone?: string
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
    const { message, conversationHistory = [], currentDate, timezone } = body

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const provider = createProvider()
    const systemPrompt = buildSystemPrompt(
      currentDate ?? new Date().toISOString(),
      timezone ?? 'Asia/Seoul',
    )

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
            timezone ?? 'Asia/Seoul',
            currentDate ?? new Date().toISOString(),
          )
          actions.push({ tool: toolCall.name, result })
          if (events.length) {
            collectedEvents = [...collectedEvents, ...events]
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

      if (turn === maxTurns - 1) {
        reply = response.content || '요청을 처리했습니다.'
      }
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
      (event, index, self) => self.findIndex((e) => e.id === event.id) === index,
    )

    return new Response(
      JSON.stringify({
        reply,
        actions,
        events: uniqueEvents,
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
