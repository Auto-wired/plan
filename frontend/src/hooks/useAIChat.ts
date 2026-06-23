import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type {
  AIPendingConfirmation,
  AIQueryInfo,
  AIResponse,
  AIResultKind,
  ChatMessage,
  SessionContext,
} from '../types'

const AI_TIMEZONE = 'Asia/Seoul'

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
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastEvents, setLastEvents] = useState<AIResponse['events']>([])
  const [lastResultKind, setLastResultKind] = useState<AIResultKind | null>(null)
  const [lastQuery, setLastQuery] = useState<AIQueryInfo | null>(null)
  const [sessionContext, setSessionContext] = useState<SessionContext | undefined>(undefined)
  const [pendingConfirmation, setPendingConfirmation] =
    useState<AIPendingConfirmation | null>(null)

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isLoading) return

      const userMessage = createMessage('user', trimmed)
      setMessages((prev) => [...prev, userMessage])
      setIsLoading(true)
      setError(null)
      setPendingConfirmation(null)

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
              timezone: AI_TIMEZONE,
              sessionContext,
            },
          },
        )

        if (invokeError) throw invokeError
        if (!data) throw new Error('AI 응답이 없습니다.')

        const assistantMessage = createMessage('assistant', data.reply)
        setMessages((prev) => [...prev, assistantMessage])

        if (data.pendingConfirmation) {
          // 되묻기: 실행 보류, 상단 목록은 유지
          setPendingConfirmation(data.pendingConfirmation)
        } else {
          setLastEvents(data.events ?? [])
          setLastResultKind(data.resultKind ?? null)
          setLastQuery(data.query ?? null)
          if (
            data.resultKind === 'query' &&
            data.query?.resolved &&
            (data.events?.length ?? 0) >= 0
          ) {
            setSessionContext({
              lastQuery: {
                resolved: data.query.resolved,
                events: (data.events ?? []).map((e) => ({
                  id: e.id,
                  title: e.title,
                  start_at: e.start_at,
                })),
              },
            })
          }
        }

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
    [isLoading, messages, queryClient, sessionContext],
  )

  /** 동일 조회 조건으로 다음 페이지를 LLM 호출 없이 불러온다. */
  const loadMore = useCallback(async () => {
    if (!lastQuery || !lastQuery.hasMore || isLoadingMore) return

    setIsLoadingMore(true)
    setError(null)

    try {
      const nextOffset = lastQuery.offset + lastQuery.limit
      const { data, error: invokeError } = await supabase.functions.invoke<AIResponse>(
        'ai-assistant',
        {
          body: {
            mode: 'paginate',
            queryArgs: lastQuery.args,
            offset: nextOffset,
            currentDate: new Date().toISOString(),
            timezone: AI_TIMEZONE,
          },
        },
      )

      if (invokeError) throw invokeError
      if (!data) throw new Error('AI 응답이 없습니다.')

      setLastEvents((prev) => [...prev, ...(data.events ?? [])])
      if (data.query) setLastQuery(data.query)
    } catch (err) {
      const message = err instanceof Error ? err.message : '추가 조회에 실패했습니다.'
      setError(message)
    } finally {
      setIsLoadingMore(false)
    }
  }, [lastQuery, isLoadingMore])

  /** 되묻기 승인: LLM 없이 보류된 액션을 실행한다. 반복은 scope 전달. */
  const confirmPending = useCallback(
    async (scope?: 'this' | 'all') => {
    if (!pendingConfirmation || isLoading) return

    setIsLoading(true)
    setError(null)

    try {
      const { data, error: invokeError } = await supabase.functions.invoke<AIResponse>(
        'ai-assistant',
        {
          body: {
            mode: 'confirm',
            pendingAction: pendingConfirmation.pendingAction,
            scope,
            currentDate: new Date().toISOString(),
            timezone: AI_TIMEZONE,
          },
        },
      )

      if (invokeError) throw invokeError
      if (!data) throw new Error('AI 응답이 없습니다.')

      setMessages((prev) => [...prev, createMessage('assistant', data.reply)])
      setLastEvents(data.events ?? [])
      setLastResultKind(data.resultKind ?? null)
      setLastQuery(data.query ?? null)

      if (data.actions?.length) {
        await queryClient.invalidateQueries({ queryKey: ['events'] })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '요청 처리에 실패했습니다.'
      setError(message)
      setMessages((prev) => [...prev, createMessage('assistant', `오류: ${message}`)])
    } finally {
      setPendingConfirmation(null)
      setIsLoading(false)
    }
    },
    [pendingConfirmation, isLoading, queryClient],
  )

  /** 되묻기 거부: 보류를 취소하고 사용자가 다시 입력하도록 한다. */
  const rejectPending = useCallback(() => {
    setPendingConfirmation(null)
  }, [])

  const clearChat = useCallback(() => {
    setMessages([])
    setLastEvents([])
    setLastResultKind(null)
    setLastQuery(null)
    setSessionContext(undefined)
    setPendingConfirmation(null)
    setError(null)
  }, [])

  return {
    messages,
    isLoading,
    isLoadingMore,
    error,
    lastEvents,
    lastResultKind,
    hasMore: lastQuery?.hasMore ?? false,
    pendingConfirmation,
    sendMessage,
    loadMore,
    confirmPending,
    rejectPending,
    clearChat,
  }
}
