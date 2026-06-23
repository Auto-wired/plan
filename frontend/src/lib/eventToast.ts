import type { ToastContent } from '../contexts/ToastContext'

export const EVENT_TOAST = {
  createFailure: (reason: string): ToastContent => ({
    title: '일정 추가 실패',
    description: reason,
  }),
  createSuccess: {
    title: '일정 추가 성공',
  },
  updateFailure: (reason: string): ToastContent => ({
    title: '일정 수정 실패',
    description: reason,
  }),
  updateSuccess: {
    title: '일정 수정 성공',
  },
  deleteFailure: (reason: string): ToastContent => ({
    title: '일정 삭제 실패',
    description: reason,
  }),
  deleteSuccess: {
    title: '일정 삭제 성공',
  },
} as const
