import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getCategoryColor } from '../../lib/categories'
import { formatEventScheduleRange } from '../../lib/datetime'
import { useAIChat } from '../../hooks/useAIChat'
import type { AIPendingConfirmation, AIResultKind, CalendarEvent } from '../../types'
import { AIAssistantIcon } from '../common/AIAssistantIcon'
import { ConfirmDialog, type ConfirmAction } from '../common/ConfirmDialog'
import { ChatMessage } from './ChatMessage'
import { VoiceButton } from './VoiceButton'
import './AIAssistantPanel.css'

function buildConfirmActions(
  pc: AIPendingConfirmation,
  confirm: (scope?: 'this' | 'all') => void,
): ConfirmAction[] {
  if (!pc.pendingAction) return []
  switch (pc.kind) {
    case 'delete':
      return [{ label: '삭제', variant: 'danger', onClick: () => confirm() }]
    case 'recurring-delete':
      return pc.lastOne
        ? [{ label: '전체 삭제', variant: 'danger', onClick: () => confirm('all') }]
        : [
            { label: '해당 일정만', variant: 'danger', onClick: () => confirm('this') },
            { label: '전체 일정', variant: 'danger', onClick: () => confirm('all') },
          ]
    case 'recurring-update':
      return [
        { label: '해당 일정만', onClick: () => confirm('this') },
        { label: '전체 일정', onClick: () => confirm('all') },
      ]
    default:
      return []
  }
}

interface AIAssistantPanelProps {
  onEventClick?: (event: CalendarEvent) => void
}

const RESULT_LABEL: Record<AIResultKind, string> = {
  query: '조회된 일정',
  create: '추가된 일정',
  update: '수정된 일정',
  delete: '삭제된 일정',
}

function EventResultList({
  events,
  resultKind,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onEventClick,
}: {
  events: CalendarEvent[]
  resultKind: AIResultKind | null
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  onEventClick?: (event: CalendarEvent) => void
}) {
  if (!events.length) return null

  const label = RESULT_LABEL[resultKind ?? 'query']
  const isDeleted = resultKind === 'delete'

  return (
    <div className="ai-event-results">
      <p className="ai-event-results-title">
        {label} {events.length}건
      </p>
      <ul>
        {events.map((event, index) => {
          const dot = (
            <span
              className="ai-event-dot"
              style={{ background: getCategoryColor(event.category) }}
            />
          )
          const info = (
            <div className="ai-event-info">
              <strong>{event.title}</strong>
              <span>
                {formatEventScheduleRange(event.start_at, event.end_at, event.all_day)}
              </span>
            </div>
          )

          return (
            <li key={`${event.id}-${event.start_at}-${index}`}>
              {isDeleted ? (
                <div className="ai-event-item ai-event-item--deleted">
                  {dot}
                  {info}
                </div>
              ) : (
                <button
                  type="button"
                  className="ai-event-item"
                  onClick={() => onEventClick?.(event)}
                >
                  {dot}
                  {info}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {resultKind === 'query' && hasMore && (
        <button
          type="button"
          className="ai-event-more-btn"
          onClick={onLoadMore}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? '불러오는 중…' : '더보기'}
        </button>
      )}
    </div>
  )
}

const SUGGESTIONS = [
  '이번 주 일정 보여줘',
  '내일 9시에 미팅 일정 추가해줘',
  '오늘 저녁 약속 일정 삭제해줘',
]

export function AIAssistantPanel({ onEventClick }: AIAssistantPanelProps) {
  const {
    messages,
    isLoading,
    isLoadingMore,
    lastEvents,
    lastResultKind,
    hasMore,
    pendingConfirmation,
    sendMessage,
    loadMore,
    confirmPending,
    rejectPending,
    pickTarget,
    clearChat,
  } = useAIChat()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    const text = input
    setInput('')
    await sendMessage(text)
  }

  // 음성 인식 결과는 바로 전송하지 않고 입력창에 채워 사용자가 확인 후 전송
  const handleVoiceTranscript = (text: string) => {
    setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))
    inputRef.current?.focus()
  }

  const handleSuggestion = async (text: string) => {
    if (isLoading) return
    await sendMessage(text)
  }

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <div className="ai-panel-title">
          <span className="ai-panel-icon" aria-hidden="true">
            <AIAssistantIcon size={18} />
          </span>
          <h2>AI 어시스턴트</h2>
        </div>
        {messages.length > 0 && (
          <button type="button" className="ai-clear-btn" onClick={clearChat}>
            초기화
          </button>
        )}
      </div>

      <EventResultList
        events={lastEvents}
        resultKind={lastResultKind}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
        onEventClick={onEventClick}
      />

      <div className="ai-messages">
        {messages.length === 0 && (
          <div className="ai-empty">
            <div className="ai-empty-icon" aria-hidden="true">
              <AIAssistantIcon size={36} />
            </div>
            <p className="ai-empty-title">AI 어시스턴트를 통해 일정을 관리하세요</p>
            <p className="ai-empty-desc">텍스트나 음성으로 일정을 관리할 수 있어요</p>
            <div className="ai-suggestions">
              {SUGGESTIONS.map((text) => (
                <button
                  key={text}
                  type="button"
                  className="ai-suggestion-chip"
                  onClick={() => handleSuggestion(text)}
                  disabled={isLoading}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {isLoading && (
          <div className="ai-typing">
            <span className="ai-typing-avatar" aria-hidden="true">
              <AIAssistantIcon size={18} />
            </span>
            <div className="ai-typing-dots">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {pendingConfirmation?.kind === 'pick-target' && !isLoading && (
          <div className="ai-pick-target">
            <ul>
              {(pendingConfirmation.candidates ?? []).map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    className="ai-event-item"
                    onClick={() => void pickTarget(event.id)}
                  >
                    <span
                      className="ai-event-dot"
                      style={{ background: 'var(--color-primary, #6366f1)' }}
                    />
                    <div className="ai-event-info">
                      <strong>{event.title}</strong>
                      <span>
                        {formatEventScheduleRange(event.start_at, event.end_at, event.all_day)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="ai-confirm-no ai-pick-cancel"
              onClick={() => {
                rejectPending()
                inputRef.current?.focus()
              }}
            >
              취소
            </button>
          </div>
        )}

        {pendingConfirmation?.kind === 'ambiguous' && !isLoading && (
          <div className="ai-confirm-inline">
            <button
              type="button"
              className="ai-confirm-yes"
              onClick={() => void confirmPending()}
            >
              맞다
            </button>
            <button
              type="button"
              className="ai-confirm-no"
              onClick={() => {
                rejectPending()
                inputRef.current?.focus()
              }}
            >
              아니다
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="ai-input-form" onSubmit={handleSubmit}>
        <VoiceButton onTranscript={handleVoiceTranscript} disabled={isLoading} />
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="메시지 입력..."
          disabled={isLoading}
        />
        <button
          type="submit"
          className="ai-send-btn"
          disabled={isLoading || !input.trim()}
        >
          보내기
        </button>
      </form>

      {pendingConfirmation &&
        pendingConfirmation.kind !== 'ambiguous' &&
        pendingConfirmation.kind !== 'pick-target' &&
        pendingConfirmation.pendingAction && (
        <ConfirmDialog
          title={pendingConfirmation.message}
          actions={buildConfirmActions(pendingConfirmation, (scope) =>
            void confirmPending(scope),
          )}
          onClose={() => rejectPending()}
        />
      )}
    </div>
  )
}
