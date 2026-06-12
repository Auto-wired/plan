import type { AIProvider, Message, ToolCall, ToolDefinition } from './types.ts'

interface GeminiFunctionCall {
  name: string
  args: Record<string, unknown>
}

interface GeminiPart {
  text?: string
  functionCall?: GeminiFunctionCall
  functionResponse?: { name: string; response: unknown }
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

function toGeminiRole(role: Message['role']): 'user' | 'model' {
  if (role === 'assistant' || role === 'tool') return 'model'
  return 'user'
}

function toGeminiTools(tools: ToolDefinition[]) {
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    },
  ]
}

export function createGeminiProvider(): AIProvider {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set')
  }

  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.0-flash'

  return {
    async chat({ systemPrompt, messages, tools }) {
      const contents: GeminiContent[] = messages.map((message) => {
        if (message.role === 'tool') {
          return {
            role: 'model',
            parts: [
              {
                functionResponse: {
                  name: message.toolCallId ?? 'tool',
                  response: { result: message.content },
                },
              },
            ],
          }
        }

        return {
          role: toGeminiRole(message.role),
          parts: [{ text: message.content }],
        }
      })

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            tools: toGeminiTools(tools),
            toolConfig: {
              functionCallingConfig: { mode: 'AUTO' },
            },
          }),
        },
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Gemini API error: ${errorText}`)
      }

      const data = await response.json()
      const candidate = data.candidates?.[0]
      const parts: GeminiPart[] = candidate?.content?.parts ?? []

      const toolCalls: ToolCall[] = []
      let content = ''

      for (const part of parts) {
        if (part.text) {
          content += part.text
        }
        if (part.functionCall) {
          toolCalls.push({
            id: crypto.randomUUID(),
            name: part.functionCall.name,
            arguments: part.functionCall.args ?? {},
          })
        }
      }

      return { content: content.trim(), toolCalls }
    },
  }
}
