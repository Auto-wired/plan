import { APP_TIMEZONE } from '../../lib/datetime'
import type { ChatMessage as ChatMessageType } from '../../types'
import { AIAssistantIcon } from '../common/AIAssistantIcon'
import './ChatMessage.css'

interface ChatMessageProps {
  message: ChatMessageType
  userInitial: string
}

function UserAvatar({ initial }: { initial: string }) {
  return (
    <span className="chat-avatar chat-avatar--user" aria-hidden="true">
      {initial}
    </span>
  )
}

function AIAvatar() {
  return (
    <span className="chat-avatar chat-avatar--assistant" aria-hidden="true">
      <AIAssistantIcon size={18} />
    </span>
  )
}

export function ChatMessage({ message, userInitial }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`chat-message chat-message--${message.role}`}>
      {!isUser && <AIAvatar />}
      <div className="chat-message-bubble">
        <p>{message.content}</p>
        <time className="chat-message-time">
          {message.timestamp.toLocaleTimeString('ko-KR', {
            timeZone: APP_TIMEZONE,
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
      </div>
      {isUser && <UserAvatar initial={userInitial} />}
    </div>
  )
}
