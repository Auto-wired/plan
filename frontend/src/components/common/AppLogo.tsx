import { CalendarDays } from 'lucide-react'

interface AppLogoProps {
  size?: number
  className?: string
}

export function AppLogo({ size = 28, className }: AppLogoProps) {
  const iconSize = Math.round(size * 0.57)

  return (
    <div
      className={className ? `app-logo-mark ${className}` : 'app-logo-mark'}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <CalendarDays size={iconSize} strokeWidth={2.25} />
    </div>
  )
}
