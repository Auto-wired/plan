import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createProvider } from './providers/index.ts'
import type { Message } from './providers/types.ts'
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
          const { result, events } = await executeTool(
            supabase,
            user.id,
            toolCall.name,
            toolCall.arguments,
            timezone ?? 'Asia/Seoul',
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
