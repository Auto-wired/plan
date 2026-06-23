import { describe, expect, it } from 'vitest'
import {
  countRemainingOccurrences,
  expandRecurringEvent,
  isFiniteRecurringSeries,
} from './recurrence'
import type { CalendarEvent, RecurrenceException } from '../types'

function weeklyMaster(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'master-1',
    user_id: 'user-1',
    title: '주간 회의',
    description: null,
    start_at: '2026-06-01T09:00:00.000Z',
    end_at: '2026-06-01T10:00:00.000Z',
    all_day: false,
    category: 'work',
    recurrence_freq: 'weekly',
    recurrence_interval: 1,
    recurrence_count: 3,
    recurrence_until: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function exclusion(originalStartAt: string): RecurrenceException {
  return {
    id: `ex-${originalStartAt}`,
    event_id: 'master-1',
    original_start_at: originalStartAt,
  }
}

describe('isFiniteRecurringSeries', () => {
  it('횟수 또는 종료일이 있으면 유한', () => {
    expect(isFiniteRecurringSeries(weeklyMaster())).toBe(true)
    expect(
      isFiniteRecurringSeries(
        weeklyMaster({ recurrence_count: null, recurrence_until: '2026-12-31T23:59:59.000Z' }),
      ),
    ).toBe(true)
  })

  it('계속 반복이면 유한 아님', () => {
    expect(
      isFiniteRecurringSeries(weeklyMaster({ recurrence_count: null, recurrence_until: null })),
    ).toBe(false)
  })
})

describe('countRemainingOccurrences', () => {
  it('제외 없이 전체 회차', () => {
    expect(countRemainingOccurrences(weeklyMaster(), [])).toBe(3)
  })

  it('제외된 회차는 개수에서 빠짐', () => {
    expect(
      countRemainingOccurrences(weeklyMaster(), [exclusion('2026-06-08T09:00:00.000Z')]),
    ).toBe(2)
  })

  it('마지막 1개만 남음', () => {
    expect(
      countRemainingOccurrences(weeklyMaster(), [
        exclusion('2026-06-01T09:00:00.000Z'),
        exclusion('2026-06-08T09:00:00.000Z'),
      ]),
    ).toBe(1)
  })
})

describe('expandRecurringEvent', () => {
  it('deleted 예외 회차는 전개하지 않음', () => {
    const range = {
      start: new Date('2026-06-01T00:00:00.000Z'),
      end: new Date('2026-06-30T23:59:59.000Z'),
    }
    const instances = expandRecurringEvent(
      weeklyMaster(),
      range,
      [exclusion('2026-06-08T09:00:00.000Z')],
    )
    expect(instances).toHaveLength(2)
    expect(instances.map((i) => i.originalStartAt)).toEqual([
      '2026-06-01T09:00:00.000Z',
      '2026-06-15T09:00:00.000Z',
    ])
  })
})
