import { describe, expect, it } from 'vitest'
import {
  hasRescheduleIntent,
  hasScheduleFieldChanges,
  sanitizeUpdateArgs,
} from './mutationSafety.ts'

describe('mutationSafety', () => {
  it('metadata-only: 이번 주 + 제목 변경 → schedule strip', () => {
    const raw = {
      id: 'e1',
      title: '주간회의',
      schedule_spec: { date: { kind: 'week', week_offset: 0 } },
    }
    const safe = sanitizeUpdateArgs(raw, '이번주 팀회의 제목을 주간회의로 바꿔줘')
    expect(safe.title).toBe('주간회의')
    expect(safe.schedule_spec).toBeUndefined()
    expect(safe.start_at).toBeUndefined()
    expect(hasRescheduleIntent('이번주 팀회의 제목을 주간회의로 바꿔줘', raw)).toBe(false)
  })

  it('reschedule: 다음 주 금요일 3시로 옮겨', () => {
    const msg = '다음 주 금요일 3시로 옮겨줘'
    const raw = {
      id: 'e1',
      schedule_spec: { date: { kind: 'week', week_offset: 1, weekday: 'fri' } },
    }
    expect(hasRescheduleIntent(msg, raw)).toBe(true)
    const safe = sanitizeUpdateArgs(raw, msg)
    expect(safe.schedule_spec).toBeDefined()
  })

  it('reschedule: schedule_spec with time.clock', () => {
    const raw = {
      id: 'e1',
      schedule_spec: {
        date: { kind: 'week', week_offset: 1, weekday: 'fri' },
        time: { kind: 'clock', hour: 15 },
      },
    }
    expect(hasRescheduleIntent('일정 수정', raw)).toBe(true)
  })

  it('legacy start_at → reschedule', () => {
    expect(
      hasRescheduleIntent('제목 바꿔', { id: 'e1', start_at: '2026-07-03T15:00:00.000Z' }),
    ).toBe(true)
  })

  it('hasScheduleFieldChanges', () => {
    expect(hasScheduleFieldChanges({})).toBe(false)
    expect(hasScheduleFieldChanges({ start_at: 'x' })).toBe(true)
  })
})
