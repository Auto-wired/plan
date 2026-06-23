import { describe, expect, it } from 'vitest'
import type { EventFormData } from '../types'
import { validateEventForm } from './eventValidation'

const baseForm = (): EventFormData => ({
  title: '회의',
  description: '',
  start_at: '2026-06-22T09:00:00.000Z',
  end_at: '2026-06-22T10:00:00.000Z',
  all_day: false,
  category: 'work',
  recurrence: null,
})

describe('validateEventForm', () => {
  it('유효한 입력', () => {
    expect(validateEventForm(baseForm())).toBeNull()
  })

  it('제목 없음', () => {
    expect(validateEventForm({ ...baseForm(), title: '  ' })).toBe('제목을 입력해주세요.')
  })

  it('종료일이 시작일보다 이전', () => {
    expect(
      validateEventForm({
        ...baseForm(),
        start_at: '2026-06-22T10:00:00.000Z',
        end_at: '2026-06-22T09:00:00.000Z',
      }),
    ).toBe('종료일은 시작일 이후여야 합니다.')
  })

  it('반복 종료 날짜 비어 있음', () => {
    expect(
      validateEventForm({
        ...baseForm(),
        recurrence: { freq: 'daily', interval: 1, until: '   ' },
      }),
    ).toBe('반복 종료 날짜를 입력해주세요.')
  })

  it('반복 횟수 1 미만', () => {
    expect(
      validateEventForm({
        ...baseForm(),
        recurrence: { freq: 'weekly', interval: 1, count: 0 },
      }),
    ).toBe('반복 횟수를 입력해주세요.')
  })

  it('종일 일정은 종료일이 시작일과 같아도 유효', () => {
    expect(
      validateEventForm({
        ...baseForm(),
        all_day: true,
        start_at: '2026-06-22T00:00:00.000Z',
        end_at: '2026-06-22T00:00:00.000Z',
      }),
    ).toBeNull()
  })
})
