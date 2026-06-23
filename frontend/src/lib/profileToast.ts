import type { ToastContent } from '../contexts/ToastContext'

export const PROFILE_TOAST = {
  saveFailure: (reason: string): ToastContent => ({
    title: '프로필 저장 실패',
    description: reason,
  }),
} as const
