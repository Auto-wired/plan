import { useState, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../contexts/ToastContext'
import {
  mapSignUpError,
  validateSignUpStep,
} from '../../lib/authValidation'
import { AppLogo } from '../common/AppLogo'
import './Auth.css'

export function LoginForm() {
  const { signIn, signUp } = useAuth()
  const { showToast } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    const values = { email, password, confirmPassword, nickname }

    try {
      if (isSignUp) {
        const steps = ['email', 'password', 'passwordConfirm'] as const
        for (const step of steps) {
          const stepError = validateSignUpStep(step, values)
          if (stepError) {
            setError(stepError)
            showToast('회원가입에 실패했습니다.')
            return
          }
        }

        try {
          await signUp(email, password, { nickname: nickname.trim() })
        } catch (err) {
          const raw = err instanceof Error ? err.message : '회원가입에 실패했습니다.'
          setError(mapSignUpError(raw))
          showToast('회원가입에 실패했습니다.')
          return
        }

        setMessage('회원가입이 완료되었습니다. 이메일 확인 후 로그인하세요.')
      } else {
        await signIn(email, password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '인증에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const resetFormState = () => {
    setIsSignUp(!isSignUp)
    setError(null)
    setMessage(null)
    setConfirmPassword('')
    setNickname('')
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo-wrap">
          <AppLogo size={44} />
        </div>
        <h1 className="auth-title">Plan</h1>
        <p className="auth-subtitle">AI와 함께하는 스마트 일정 관리</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            이메일
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="name@example.com"
            />
          </label>

          {isSignUp && (
            <label>
              닉네임
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                required
                minLength={2}
                maxLength={20}
                autoComplete="nickname"
                placeholder="2~20자"
              />
            </label>
          )}

          <label>
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={isSignUp ? 8 : undefined}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              placeholder={isSignUp ? '8자 이상, 특수문자 1개 이상' : undefined}
            />
          </label>

          {isSignUp && (
            <label>
              비밀번호 확인
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="비밀번호 재입력"
              />
            </label>
          )}

          {error && <p className="auth-error">{error}</p>}
          {message && <p className="auth-message">{message}</p>}

          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? '처리 중...' : isSignUp ? '가입하기' : '로그인'}
          </button>
        </form>

        <button type="button" className="auth-toggle" onClick={resetFormState}>
          {isSignUp ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 가입하기'}
        </button>
      </div>
    </div>
  )
}
