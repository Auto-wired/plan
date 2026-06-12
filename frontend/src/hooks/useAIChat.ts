import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getBrowserTimezone } from '../lib/datetime'
import { supabase } from '../lib/supabase'
import type { AIResponse, ChatMessage } from '../types'

function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: new Date(),
  }
}

export function useAIChat() {
  const queryClient = useQueryClient()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastEvents, setLastEvents] = useState<AIResponse['events']>([])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isLoading) return

      const userMessage = createMessage('user', trimmed)
      setMessages((prev) => [...prev, userMessage])
      setIsLoading(true)
      setError(null)

      try {
        const conversationHistory = [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }))

        const { data, error: invokeError } = await supabase.functions.invoke<AIResponse>(
          'ai-assistant',
          {
            body: {
              message: trimmed,
              conversationHistory,
              currentDate: new Date().toISOString(),
              timezone: getBrowserTimezone(),
            },
          },
        )

        if (invokeError) throw invokeError
        if (!data) throw new Error('AI 응답이 없습니다.')

        const assistantMessage = createMessage('assistant', data.reply)
        setMessages((prev) => [...prev, assistantMessage])
        setLastEvents(data.events ?? [])

        if (data.actions?.length) {
          await queryClient.invalidateQueries({ queryKey: ['events'] })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'AI 요청에 실패했습니다.'
        setError(message)
        setMessages((prev) => [...prev, createMessage('assistant', `오류: ${message}`)])
      } finally {
        setIsLoading(false)
      }
    },
    [isLoading, messages, queryClient],
  )

  const clearChat = useCallback(() => {
    setMessages([])
    setLastEvents([])
    setError(null)
  }, [])

  return {
    messages,
    isLoading,
    error,
    lastEvents,
    sendMessage,
    clearChat,
  }
}
