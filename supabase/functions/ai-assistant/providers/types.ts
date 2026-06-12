export interface Message {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface AIProvider {
  chat(params: {
    systemPrompt: string
    messages: Message[]
    tools: ToolDefinition[]
  }): Promise<{ content: string; toolCalls: ToolCall[] }>
}

export type ProviderName = 'gemini' | 'openai' | 'ollama'
