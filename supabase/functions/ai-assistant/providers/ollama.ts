import type { AIProvider, ToolDefinition } from './types.ts'

export function createOllamaProvider(): AIProvider {
  const baseUrl = Deno.env.get('OLLAMA_BASE_URL') ?? 'http://localhost:11434'
  const model = Deno.env.get('OLLAMA_MODEL') ?? 'llama3.1'

  return {
    async chat({ systemPrompt, messages, tools }) {
      const ollamaTools = tools.map((tool: ToolDefinition) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }))

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          tools: ollamaTools,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Ollama API error: ${errorText}`)
      }

      const data = await response.json()
      const message = data.message

      const toolCalls = (message?.tool_calls ?? []).map(
        (call: { function: { name: string; arguments: Record<string, unknown> } }) => ({
          id: crypto.randomUUID(),
          name: call.function.name,
          arguments: call.function.arguments ?? {},
        }),
      )

      return {
        content: message?.content?.trim() ?? '',
        toolCalls,
      }
    },
  }
}
