import type { EventFormData } from '../types'

interface WallClockParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Supabase ISO에서 표시/저장용 시각 부분만 추출 (타임존 변환 없음) */
export function extractWallClockParts(iso: string): WallClockParts {
  const match = iso
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/)

  if (!match) {
    throw new Error(`잘못된 날짜 형식: ${iso}`)
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? '0'),
    minute: Number(match[5] ?? '0'),
    second: Number(match[6] ?? '0'),
  }
}

function formatWallClockIso(parts: WallClockParts): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}.000Z`
}

export function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function normalizeDbTimestamp(iso: string): string {
  return formatWallClockIso(extractWallClockParts(iso))
}

/** 비교/반복 계산용 Date (Supabase 문자열의 UTC 필드를 그대로 사용) */
export function parseWallClockDate(iso: string): Date {
  return new Date(normalizeDbTimestamp(iso))
}

/** @deprecated parseWallClockDate 사용 */
export function parseUtcIso(iso: string): Date {
  return parseWallClockDate(iso)
}

/** DB ISO → 폼/표시용 입력값 */
export function utcToLocalFormInput(iso: string, allDay: boolean): string {
  const parts = extractWallClockParts(iso)
  const date = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
  if (allDay) return date
  return `${date}T${pad2(parts.hour)}:${pad2(parts.minute)}`
}

/** 폼 입력 → DB ISO */
export function localToUtc(value: string, allDay: boolean): string {
  if (allDay) {
    const dateOnly = value.slice(0, 10)
    return `${dateOnly}T00:00:00.000Z`
  }

  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/)
  if (!match) {
    throw new Error(`잘못된 날짜 형식: ${value}`)
  }

  return `${match[1]}:00.000Z`
}

/** DB ISO → FullCalendar 입력값 */
export function utcToFullCalendarValue(iso: string, allDay: boolean): string {
  if (allDay) {
    const parts = extractWallClockParts(iso)
    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
  }
  return normalizeDbTimestamp(iso)
}

/** FullCalendar Date → DB ISO (UTC 필드 = Supabase 벽시계) */
export function calendarDateToUtcIso(date: Date): string {
  return formatWallClockIso({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  })
}

export function nowUtcIso(): string {
  return calendarDateToUtcIso(new Date())
}

export function getTodayLocalDateString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

/** FullCalendar(timeZone=UTC)에서 로컬 날짜 기준 "오늘" 표시용 */
export function getCalendarNow(): Date {
  const now = new Date()
  return new Date(
    Date.UTC(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds(),
    ),
  )
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const { year, month, day } = extractWallClockParts(`${dateStr.slice(0, 10)}T00:00:00.000Z`)
  const base = new Date(Date.UTC(year, month - 1, day + days))
  return `${base.getUTCFullYear()}-${pad2(base.getUTCMonth() + 1)}-${pad2(base.getUTCDate())}`
}

export function defaultAllDayEventUtcIso(): string {
  return localToUtc(getTodayLocalDateString(), true)
}

export function defaultTimedEventStartUtcIso(): string {
  return localToUtc(`${getTodayLocalDateString()}T09:00`, false)
}

export function defaultTimedEventEndUtcIso(): string {
  return localToUtc(`${getTodayLocalDateString()}T18:00`, false)
}

export function normalizeAllDayRangeForSave(
  startAt: string,
  endAt: string,
): { start_at: string; end_at: string } {
  let start_at = localToUtc(utcToLocalFormInput(startAt, true), true)
  let end_at = localToUtc(utcToLocalFormInput(endAt, true), true)
  if (end_at < start_at) {
    end_at = start_at
  }
  return { start_at, end_at }
}

export function fcExclusiveEndToInclusiveAllDayDate(exclusiveEndIso: string): string {
  const exclusiveDate = utcToLocalFormInput(exclusiveEndIso, true)
  return addDaysToDateString(exclusiveDate, -1)
}

export function calendarRangeToUtcIso(
  start: Date,
  end: Date | null,
  allDay: boolean,
): { start_at: string; end_at: string } {
  const start_at = calendarDateToUtcIso(start)

  if (allDay) {
    if (!end) {
      return { start_at: localToUtc(utcToLocalFormInput(start_at, true), true), end_at: localToUtc(utcToLocalFormInput(start_at, true), true) }
    }
    const inclusiveEnd = fcExclusiveEndToInclusiveAllDayDate(calendarDateToUtcIso(end))
    const end_at = localToUtc(inclusiveEnd, true)
    return normalizeAllDayRangeForSave(start_at, end_at)
  }

  const end_at = end ? calendarDateToUtcIso(end) : start_at
  return { start_at, end_at }
}

export function isAllDayTimestamps(startAt: string, endAt: string): boolean {
  const start = extractWallClockParts(startAt)
  const end = extractWallClockParts(endAt)
  const isMidnight = (parts: WallClockParts) =>
    parts.hour === 0 && parts.minute === 0 && parts.second === 0
  return isMidnight(start) && isMidnight(end)
}

export function resolveEventAllDay(
  allDay: boolean,
  startAt: string,
  endAt: string,
): boolean {
  return allDay && isAllDayTimestamps(startAt, endAt)
}

export function toFullCalendarAllDayEnd(startIso: string, endIso: string): string {
  const start = utcToLocalFormInput(startIso, true)
  const end = utcToLocalFormInput(endIso, true)
  const inclusiveEnd = end >= start ? end : start
  return addDaysToDateString(inclusiveEnd, 1)
}

export function recurrenceUntilLocalToUtc(localDate: string): string {
  const dateOnly = localDate.slice(0, 10)
  return `${dateOnly}T23:59:59.000Z`
}

export function recurrenceUntilUtcToLocal(iso: string): string {
  return utcToLocalFormInput(iso, true)
}

function formatWallClockParts(parts: WallClockParts, style: 'date' | 'time' | 'datetime'): string {
  const dateLabel = `${parts.month}월 ${parts.day}일`
  const timeLabel = `${pad2(parts.hour)}:${pad2(parts.minute)}`

  if (style === 'date') return dateLabel
  if (style === 'time') return timeLabel
  return `${dateLabel} ${timeLabel}`
}

export function formatLocalDateTime(
  iso: string,
  style: 'date' | 'time' | 'datetime' = 'datetime',
): string {
  return formatWallClockParts(extractWallClockParts(iso), style)
}

export function formatEventScheduleRange(
  startAt: string,
  endAt: string,
  allDay: boolean,
): string {
  if (allDay) {
    const startDate = utcToLocalFormInput(startAt, true)
    const endDate = utcToLocalFormInput(endAt, true)
    const startLabel = formatLocalDateTime(startAt, 'date')

    if (startDate === endDate) {
      return startLabel
    }

    return `${startLabel} ~ ${formatLocalDateTime(endAt, 'date')}`
  }

  const startDate = utcToLocalFormInput(startAt, false).slice(0, 10)
  const endDate = utcToLocalFormInput(endAt, false).slice(0, 10)

  if (startDate === endDate) {
    return `${formatLocalDateTime(startAt, 'datetime')} ~ ${formatLocalDateTime(endAt, 'time')}`
  }

  return `${formatLocalDateTime(startAt, 'datetime')} ~ ${formatLocalDateTime(endAt, 'datetime')}`
}

export function prepareEventFormForSave(form: EventFormData): EventFormData {
  if (form.all_day) {
    const { start_at, end_at } = normalizeAllDayRangeForSave(form.start_at, form.end_at)
    return { ...form, start_at, end_at }
  }

  return {
    ...form,
    start_at: localToUtc(utcToLocalFormInput(form.start_at, false), false),
    end_at: localToUtc(utcToLocalFormInput(form.end_at, false), false),
  }
}

// 하위 호환 alias
export const APP_TIMEZONE = 'UTC'
export const dbToKstFormInput = utcToLocalFormInput
export const kstFormToDb = localToUtc
export const dbToFullCalendarValue = utcToFullCalendarValue
export const calendarDateToDbIso = calendarDateToUtcIso
export const toKstFormInput = utcToLocalFormInput
export const fromKstFormInput = localToUtc
export const formatKstDateTime = formatLocalDateTime
