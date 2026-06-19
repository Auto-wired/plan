import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useProfileContext } from '../../contexts/ProfileContext'
import { isValidNickname } from '../../lib/authValidation'
import type { ThemeMode } from '../../types'
import './UserSettingsModal.css'

interface UserSettingsModalProps {
  email?: string | null
  onClose: () => void
}

export function UserSettingsModal({ email, onClose }: UserSettingsModalProps) {
  const { profile, uploadAvatar, updateProfile, setTheme } = useProfileContext()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nicknameInput, setNicknameInput] = useState(profile?.nickname ?? '')

  const nickname = profile?.nickname ?? '사용자'
  const initial = nickname.charAt(0).toUpperCase()

  useEffect(() => {
    setNicknameInput(profile?.nickname ?? '')
  }, [profile?.nickname])

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)
    try {
      await uploadAvatar(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지 업로드에 실패했습니다.')
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  const handleNicknameSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const trimmed = nicknameInput.trim()
    if (!isValidNickname(trimmed)) {
      setError('닉네임은 2~20자로 입력해주세요.')
      return
    }

    if (trimmed === profile?.nickname) return

    setLoading(true)
    setError(null)
    try {
      await updateProfile({ nickname: trimmed })
    } catch (err) {
      setError(err instanceof Error ? err.message : '닉네임 변경에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleThemeChange = async (theme: ThemeMode) => {
    setLoading(true)
    setError(null)
    try {
      await setTheme(theme)
    } catch (err) {
      setError(err instanceof Error ? err.message : '테마 변경에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>개인 설정</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="settings-profile">
          <button
            type="button"
            className="settings-avatar-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            aria-label="프로필 이미지 변경"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="settings-avatar-image" />
            ) : (
              <span className="settings-avatar-fallback">{initial}</span>
            )}
          </button>
          <div>
            <p className="settings-nickname">{nickname}</p>
            {email && <p className="settings-email">{email}</p>}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            onChange={handleAvatarChange}
          />
        </div>

        <section className="settings-section">
          <h3>닉네임</h3>
          <form className="settings-nickname-form" onSubmit={handleNicknameSubmit}>
            <input
              type="text"
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              maxLength={20}
              disabled={loading}
              autoComplete="nickname"
              placeholder="닉네임 입력"
            />
            <button
              type="submit"
              className="btn-secondary"
              disabled={loading || nicknameInput.trim() === profile?.nickname}
            >
              저장
            </button>
          </form>
        </section>

        <section className="settings-section">
          <h3>다크 모드</h3>
          <div className="theme-toggle">
            <button
              type="button"
              className={profile?.theme === 'light' ? 'active' : ''}
              onClick={() => handleThemeChange('light')}
              disabled={loading}
            >
              라이트
            </button>
            <button
              type="button"
              className={profile?.theme === 'dark' ? 'active' : ''}
              onClick={() => handleThemeChange('dark')}
              disabled={loading}
            >
              다크
            </button>
          </div>
        </section>

        {error && <p className="settings-error">{error}</p>}
      </div>
    </div>
  )
}
