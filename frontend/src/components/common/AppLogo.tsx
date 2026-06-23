import { CalendarDays } from 'lucide-react'

interface AppLogoProps {
  size?: number
  className?: string
  /** 설정 시 로고 호버·포커스에 빌드 버전 표시 */
  versionLabel?: string
}

export function AppLogo({ size = 28, className, versionLabel }: AppLogoProps) {
  const iconSize = Math.round(size * 0.57)

  const mark = (
    <div
      className={className ? `app-logo-mark ${className}` : 'app-logo-mark'}
      style={{ width: size, height: size }}
      aria-hidden={versionLabel ? undefined : true}
    >
      <CalendarDays size={iconSize} strokeWidth={2.25} />
    </div>
  )

  if (!versionLabel) return mark

  return (
    <span
      className="app-logo-version-wrap"
      tabIndex={0}
      aria-label={`앱 버전 ${versionLabel}`}
    >
      {mark}
      <span className="app-logo-version-tooltip" role="tooltip">
        {versionLabel}
      </span>
    </span>
  )
}
