import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getCategoryColor } from '../../lib/categories'
import { formatKstDateTime } from '../../lib/datetime'
import { useAIChat } from '../../hooks/useAIChat'
import type { CalendarEvent } from '../../types'
import { AIAssistantIcon } from '../common/AIAssistantIcon'
import { ChatMessage } from './ChatMessage'
import { VoiceButton } from './VoiceButton'
import './AIAssistantPanel.css'

interface AIAssistantPanelProps {
  userInitial: string
}

function EventResultList({ events }: { events: CalendarEvent[] }) {
  if (!events.length) return null

  return (
    <div className="ai-event-results">
      <p className="ai-event-results-title">조회된 일정 {events.length}건</p>
      <ul>
        {events.map((event) => (
          <li key={event.id}>
            <span
              className="ai-event-dot"
              style={{ background: getCategoryColor(event.category) }}
            />
            <div className="ai-event-info">
              <strong>{event.title}</strong>
              <span>
                {formatKstDateTime(event.start_at, 'datetime')}
                {event.end_at && ` ~ ${formatKstDateTime(event.end_at, 'time')}`}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

const SUGGESTIONS = [
  '이번 주 일정 보여줘',
  '내일 9시에 미팅 일정 추가해줘',
  '오늘 저녁 약속 일정 삭제해줘',
]

export function AIAssistantPanel({ userInitial }: AIAssistantPanelProps) {
  const { messages, isLoading, lastEvents, sendMessage, clearChat } = useAIChat()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

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

  const handleVoiceTranscript = async (text: string) => {
    await sendMessage(text)
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
          <ChatMessage key={msg.id} message={msg} userInitial={userInitial} />
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

        <EventResultList events={lastEvents} />
        <div ref={messagesEndRef} />
      </div>

      <form className="ai-input-form" onSubmit={handleSubmit}>
        <VoiceButton onTranscript={handleVoiceTranscript} disabled={isLoading} />
        <input
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
    </div>
  )
}
