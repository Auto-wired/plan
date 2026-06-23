import { useState, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../contexts/ToastContext'
import { AUTH_TOAST } from '../../lib/authToast'
import {
  mapLoginError,
  mapSignUpError,
  validateLoginForm,
  validateSignUpForm,
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
  const [loading, setLoading] = useState(false)

  const switchToLogin = () => {
    setIsSignUp(false)
    setPassword('')
    setConfirmPassword('')
    setNickname('')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const values = { email, password, confirmPassword, nickname }

    try {
      if (isSignUp) {
        const validationError = validateSignUpForm(values)
        if (validationError) {
          showToast(AUTH_TOAST.signUpFailure(validationError), { variant: 'error' })
          return
        }

        try {
          await signUp(email, password, { nickname: nickname.trim() })
        } catch (err) {
          const raw = err instanceof Error ? err.message : ''
          showToast(AUTH_TOAST.signUpFailure(mapSignUpError(raw)), { variant: 'error' })
          return
        }

        showToast(AUTH_TOAST.signUpSuccess, { variant: 'success' })
        switchToLogin()
      } else {
        const loginValidationError = validateLoginForm(email, password)
        if (loginValidationError) {
          showToast(AUTH_TOAST.loginFailure(loginValidationError), { variant: 'error' })
          return
        }

        try {
          await signIn(email, password)
          showToast(AUTH_TOAST.loginSuccess, { variant: 'success' })
        } catch (err) {
          const raw = err instanceof Error ? err.message : ''
          showToast(AUTH_TOAST.loginFailure(mapLoginError(raw)), { variant: 'error' })
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const resetFormState = () => {
    setIsSignUp(!isSignUp)
    setConfirmPassword('')
    setNickname('')
    setPassword('')
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo-wrap">
          <AppLogo size={44} />
        </div>
        <h1 className="auth-title">Plan</h1>
        <p className="auth-subtitle">AI와 함께하는 스마트 일정 관리</p>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <label>
            이메일
            <input
              type="text"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
                autoComplete="new-password"
                placeholder="비밀번호 재입력"
              />
            </label>
          )}

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
