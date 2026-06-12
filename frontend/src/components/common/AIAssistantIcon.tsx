import { BotMessageSquare } from 'lucide-react'

interface AIAssistantIconProps {
  size?: number
  className?: string
}

export function AIAssistantIcon({ size = 20, className }: AIAssistantIconProps) {
  return (
    <BotMessageSquare
      size={size}
      strokeWidth={2}
      className={className ? `ai-assistant-icon ${className}` : 'ai-assistant-icon'}
      aria-hidden="true"
    />
  )
}
