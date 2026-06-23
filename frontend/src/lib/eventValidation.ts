import { isValidCategory } from './categories'
import { parseWallClockDate } from './datetime'
import type { EventFormData } from '../types'

export function validateEventForm(form: EventFormData): string | null {
  if (!form.title.trim()) {
    return '제목을 입력해주세요.'
  }

  if (!form.start_at?.trim()) {
    return '시작일을 입력해주세요.'
  }

  if (!form.end_at?.trim()) {
    return '종료일을 입력해주세요.'
  }

  try {
    const start = parseWallClockDate(form.start_at)
    const end = parseWallClockDate(form.end_at)
    if (end.getTime() < start.getTime()) {
      return '종료일은 시작일 이후여야 합니다.'
    }
  } catch {
    return '올바른 날짜를 입력해주세요.'
  }

  if (!isValidCategory(form.category)) {
    return '카테고리를 선택해주세요.'
  }

  if (form.recurrence) {
    if (form.recurrence.count != null && form.recurrence.count < 1) {
      return '반복 횟수를 입력해주세요.'
    }
    if (form.recurrence.until != null && !form.recurrence.until.trim()) {
      return '반복 종료 날짜를 입력해주세요.'
    }
  }

  return null
}

export function mapEventError(message: string): string {
  if (!message.trim()) {
    return '잠시 후 다시 시도해주세요.'
  }
  return message
}
