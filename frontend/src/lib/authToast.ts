import type { ToastContent } from '../contexts/ToastContext'

export const AUTH_TOAST = {
  signUpFailure: (reason: string): ToastContent => ({
    title: '회원가입 실패',
    description: reason,
  }),
  signUpSuccess: {
    title: '회원가입 성공',
    description: '가입하신 이메일로 인증 링크를 보냈습니다. 인증 후 로그인해주세요.',
  },
  loginFailure: (reason: string): ToastContent => ({
    title: '로그인 실패',
    description: reason,
  }),
  loginSuccess: {
    title: '로그인 성공',
  },
  logoutFailure: (reason: string): ToastContent => ({
    title: '로그아웃 실패',
    description: reason,
  }),
} as const
