import { useProfileContext } from '../../contexts/ProfileContext'
import type { ChatMessage as ChatMessageType } from '../../types'
import { AIAssistantIcon } from '../common/AIAssistantIcon'
import './ChatMessage.css'

interface ChatMessageProps {
  message: ChatMessageType
}

function UserAvatar() {
  const { profile } = useProfileContext()
  const nickname = profile?.nickname ?? '사용자'
  const initial = nickname.charAt(0).toUpperCase()

  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt=""
        className="chat-avatar chat-avatar--user chat-avatar-image"
      />
    )
  }

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

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`chat-message chat-message--${message.role}`}>
      {!isUser && <AIAvatar />}
      <div className="chat-message-bubble">
        <p>{message.content}</p>
        <time className="chat-message-time">
          {message.timestamp.toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
      </div>
      {isUser && <UserAvatar />}
    </div>
  )
}
