import type { AIProvider, Message, ToolCall, ToolDefinition } from './types.ts'

interface OpenAIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export function createOpenAIProvider(): AIProvider {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set')
  }

  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini'

  return {
    async chat({ systemPrompt, messages, tools }) {
      const openaiMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map((message) => {
          if (message.role === 'tool') {
            return {
              role: 'tool',
              tool_call_id: message.toolCallId,
              content: message.content,
            }
          }
          return {
            role: message.role,
            content: message.content,
          }
        }),
      ]

      const openaiTools = tools.map((tool: ToolDefinition) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }))

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: openaiMessages,
          tools: openaiTools,
          tool_choice: 'auto',
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI API error: ${errorText}`)
      }

      const data = await response.json()
      const choice = data.choices?.[0]?.message

      const toolCalls: ToolCall[] = (choice?.tool_calls ?? []).map(
        (call: OpenAIToolCall) => ({
          id: call.id,
          name: call.function.name,
          arguments: JSON.parse(call.function.arguments || '{}'),
        }),
      )

      return {
        content: choice?.content?.trim() ?? '',
        toolCalls,
      }
    },
  }
}
