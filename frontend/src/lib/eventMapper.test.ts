import { describe, expect, it } from 'vitest'
import { eventToFormData, eventToRecurrenceRule, recurrenceRuleChanged } from './eventMapper'
import type { CalendarEvent, EventFormData } from '../types'

function masterEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    user_id: 'user-1',
    title: '회의',
    description: '설명',
    start_at: '2026-06-01T09:00:00.000Z',
    end_at: '2026-06-01T10:00:00.000Z',
    all_day: false,
    category: 'work',
    recurrence_freq: 'weekly',
    recurrence_interval: 1,
    recurrence_count: 5,
    recurrence_until: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function formData(overrides: Partial<EventFormData> = {}): EventFormData {
  return {
    title: '회의',
    description: '설명',
    start_at: '2026-06-01T09:00:00.000Z',
    end_at: '2026-06-01T10:00:00.000Z',
    all_day: false,
    category: 'work',
    recurrence: {
      freq: 'weekly',
      interval: 1,
      count: 5,
    },
    ...overrides,
  }
}

describe('eventToRecurrenceRule', () => {
  it('반복 없으면 null', () => {
    expect(eventToRecurrenceRule(masterEvent({ recurrence_freq: null }))).toBeNull()
  })

  it('until은 날짜만 반환', () => {
    expect(
      eventToRecurrenceRule(
        masterEvent({
          recurrence_count: null,
          recurrence_until: '2026-12-31T23:59:59.000Z',
        }),
      ),
    ).toEqual({
      freq: 'weekly',
      interval: 1,
      count: undefined,
      until: '2026-12-31',
    })
  })
})

describe('recurrenceRuleChanged', () => {
  it('둘 다 반복 없으면 false', () => {
    const master = masterEvent({ recurrence_freq: null })
    expect(recurrenceRuleChanged(master, formData({ recurrence: null }))).toBe(false)
  })

  it('한쪽만 반복이면 true', () => {
    expect(recurrenceRuleChanged(masterEvent(), formData({ recurrence: null }))).toBe(true)
    expect(
      recurrenceRuleChanged(
        masterEvent({ recurrence_freq: null }),
        formData({ recurrence: { freq: 'daily', interval: 1 } }),
      ),
    ).toBe(true)
  })

  it('freq·interval·count·until 비교', () => {
    expect(recurrenceRuleChanged(masterEvent(), formData())).toBe(false)
    expect(
      recurrenceRuleChanged(
        masterEvent(),
        formData({ recurrence: { freq: 'daily', interval: 1, count: 5 } }),
      ),
    ).toBe(true)
    expect(
      recurrenceRuleChanged(
        masterEvent(),
        formData({ recurrence: { freq: 'weekly', interval: 2, count: 5 } }),
      ),
    ).toBe(true)
    expect(
      recurrenceRuleChanged(
        masterEvent(),
        formData({ recurrence: { freq: 'weekly', interval: 1, count: 3 } }),
      ),
    ).toBe(true)
    expect(
      recurrenceRuleChanged(
        masterEvent({ recurrence_count: null, recurrence_until: '2026-12-31T23:59:59.000Z' }),
        formData({
          recurrence: { freq: 'weekly', interval: 1, until: '2026-12-31' },
        }),
      ),
    ).toBe(false)
    expect(
      recurrenceRuleChanged(
        masterEvent({ recurrence_count: null, recurrence_until: '2026-12-31T23:59:59.000Z' }),
        formData({
          recurrence: { freq: 'weekly', interval: 1, until: '2027-01-01' },
        }),
      ),
    ).toBe(true)
  })
})

describe('eventToFormData', () => {
  it('DB 이벤트를 폼 데이터로 변환', () => {
    expect(eventToFormData(masterEvent())).toEqual({
      title: '회의',
      description: '설명',
      start_at: '2026-06-01T09:00:00.000Z',
      end_at: '2026-06-01T10:00:00.000Z',
      all_day: false,
      category: 'work',
      recurrence: {
        freq: 'weekly',
        interval: 1,
        count: 5,
      },
    })
  })

  it('종일 플래그는 자정 타임스탬프와 함께일 때만 true', () => {
    expect(
      eventToFormData(
        masterEvent({
          all_day: true,
          start_at: '2026-06-01T00:00:00.000Z',
          end_at: '2026-06-01T00:00:00.000Z',
        }),
      ).all_day,
    ).toBe(true)
    expect(
      eventToFormData(
        masterEvent({
          all_day: true,
          start_at: '2026-06-01T09:00:00.000Z',
          end_at: '2026-06-01T10:00:00.000Z',
        }),
      ).all_day,
    ).toBe(false)
  })
})
