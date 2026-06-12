import type { AIProvider, ProviderName } from './types.ts'
import { createGeminiProvider } from './gemini.ts'
import { createOpenAIProvider } from './openai.ts'
import { createOllamaProvider } from './ollama.ts'

export function createProvider(name?: string): AIProvider {
  const provider = (name ?? Deno.env.get('AI_PROVIDER') ?? 'gemini') as ProviderName

  switch (provider) {
    case 'openai':
      return createOpenAIProvider()
    case 'ollama':
      return createOllamaProvider()
    case 'gemini':
    default:
      return createGeminiProvider()
  }
}

export type { AIProvider, Message, ToolCall, ToolDefinition } from './types.ts'
