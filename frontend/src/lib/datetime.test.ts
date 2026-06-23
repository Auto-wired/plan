import { describe, expect, it } from 'vitest'
import {
  calendarDateToUtcIso,
  calendarRangeToUtcIso,
  fcExclusiveEndToInclusiveAllDayDate,
  formatLocalDateTime,
  isAllDayTimestamps,
  localToUtc,
  normalizeAllDayRangeForSave,
  normalizeDbTimestamp,
  parseWallClockDate,
  recurrenceUntilLocalToUtc,
  recurrenceUntilUtcToLocal,
  resolveEventAllDay,
  utcToFullCalendarValue,
  utcToLocalFormInput,
} from './datetime'

describe('normalizeDbTimestamp', () => {
  it('밀리초·초 없는 ISO를 정규화', () => {
    expect(normalizeDbTimestamp('2026-06-22T09:00')).toBe('2026-06-22T09:00:00.000Z')
  })

  it('공백 구분 ISO도 처리', () => {
    expect(normalizeDbTimestamp('2026-06-22 09:00:00')).toBe('2026-06-22T09:00:00.000Z')
  })
})

describe('localToUtc / utcToLocalFormInput', () => {
  it('시간 일정: 타임존 변환 없이 필드만 유지', () => {
    const db = localToUtc('2026-06-22T14:30', false)
    expect(db).toBe('2026-06-22T14:30:00.000Z')
    expect(utcToLocalFormInput(db, false)).toBe('2026-06-22T14:30')
  })

  it('종일 일정: 자정 UTC', () => {
    const db = localToUtc('2026-06-22', true)
    expect(db).toBe('2026-06-22T00:00:00.000Z')
    expect(utcToLocalFormInput(db, true)).toBe('2026-06-22')
  })
})

describe('parseWallClockDate', () => {
  it('UTC 필드를 그대로 Date로 사용', () => {
    const date = parseWallClockDate('2026-06-22T09:00:00.000Z')
    expect(date.getUTCFullYear()).toBe(2026)
    expect(date.getUTCMonth()).toBe(5)
    expect(date.getUTCDate()).toBe(22)
    expect(date.getUTCHours()).toBe(9)
  })
})

describe('recurrenceUntil 변환', () => {
  it('로컬 날짜 → 해당일 23:59:59 UTC 필드', () => {
    expect(recurrenceUntilLocalToUtc('2026-12-31')).toBe('2026-12-31T23:59:59.000Z')
  })

  it('UTC → 로컬 날짜만', () => {
    expect(recurrenceUntilUtcToLocal('2026-12-31T23:59:59.000Z')).toBe('2026-12-31')
  })
})

describe('종일 일정', () => {
  it('자정 타임스탬프면 종일로 판별', () => {
    expect(isAllDayTimestamps('2026-06-22T00:00:00.000Z', '2026-06-23T00:00:00.000Z')).toBe(true)
    expect(isAllDayTimestamps('2026-06-22T09:00:00.000Z', '2026-06-22T10:00:00.000Z')).toBe(false)
  })

  it('all_day 플래그와 자정이 맞을 때만 resolve', () => {
    expect(
      resolveEventAllDay(true, '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
    ).toBe(true)
    expect(
      resolveEventAllDay(true, '2026-06-22T09:00:00.000Z', '2026-06-22T10:00:00.000Z'),
    ).toBe(false)
  })

  it('종료일이 시작일보다 이전이면 시작일로 맞춤', () => {
    expect(
      normalizeAllDayRangeForSave('2026-06-25T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
    ).toEqual({
      start_at: '2026-06-25T00:00:00.000Z',
      end_at: '2026-06-25T00:00:00.000Z',
    })
  })

  it('FullCalendar exclusive end → inclusive 날짜', () => {
    expect(fcExclusiveEndToInclusiveAllDayDate('2026-06-24T00:00:00.000Z')).toBe('2026-06-23')
  })
})

describe('calendarDateToUtcIso', () => {
  it('Date의 UTC 필드를 DB ISO로', () => {
    const date = new Date(Date.UTC(2026, 5, 22, 15, 45, 30))
    expect(calendarDateToUtcIso(date)).toBe('2026-06-22T15:45:30.000Z')
  })
})

describe('calendarRangeToUtcIso', () => {
  it('시간 일정 드래그 범위', () => {
    const start = new Date(Date.UTC(2026, 5, 22, 9, 0, 0))
    const end = new Date(Date.UTC(2026, 5, 22, 10, 0, 0))
    expect(calendarRangeToUtcIso(start, end, false)).toEqual({
      start_at: '2026-06-22T09:00:00.000Z',
      end_at: '2026-06-22T10:00:00.000Z',
    })
  })
})

describe('formatLocalDateTime', () => {
  it('벽시계 기준 한국어 포맷', () => {
    expect(formatLocalDateTime('2026-06-22T09:30:00.000Z', 'datetime')).toBe('6월 22일 09:30')
    expect(formatLocalDateTime('2026-06-22T09:30:00.000Z', 'date')).toBe('6월 22일')
    expect(formatLocalDateTime('2026-06-22T09:30:00.000Z', 'time')).toBe('09:30')
  })
})

describe('utcToFullCalendarValue', () => {
  it('종일은 날짜만, 시간 일정은 ISO', () => {
    expect(utcToFullCalendarValue('2026-06-22T00:00:00.000Z', true)).toBe('2026-06-22')
    expect(utcToFullCalendarValue('2026-06-22T09:00:00.000Z', false)).toBe(
      '2026-06-22T09:00:00.000Z',
    )
  })
})
