import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz'
import { addDays, format } from 'date-fns'
import type { EventFormData } from '../types'

export function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function getTimezoneLabel(timezone = getBrowserTimezone()): string {
  try {
    const parts = new Intl.DateTimeFormat('ko-KR', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? timezone
  } catch {
    return timezone
  }
}

export function parseUtcIso(iso: string): Date {
  const trimmed = iso.trim()
  if (!trimmed) throw new Error(`잘못된 날짜 형식: ${iso}`)
  return new Date(trimmed)
}

export function normalizeDbTimestamp(iso: string): string {
  return parseUtcIso(iso).toISOString()
}

/** UTC ISO → 폼/표시용 로컬 입력값 */
export function utcToLocalFormInput(iso: string, allDay: boolean, tz = getBrowserTimezone()): string {
  const date = parseUtcIso(iso)
  if (allDay) {
    return formatInTimeZone(date, tz, 'yyyy-MM-dd')
  }
  return formatInTimeZone(date, tz, "yyyy-MM-dd'T'HH:mm")
}

/** 폼 로컬 입력 → UTC ISO */
export function localToUtc(value: string, allDay: boolean, tz = getBrowserTimezone()): string {
  if (allDay) {
    const dateOnly = value.slice(0, 10)
    return fromZonedTime(`${dateOnly}T00:00:00`, tz).toISOString()
  }

  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/)
  if (!match) {
    throw new Error(`잘못된 날짜 형식: ${value}`)
  }

  return fromZonedTime(`${match[1]}:00`, tz).toISOString()
}

/** UTC → FullCalendar 표시값 (timeZone prop과 함께 사용) */
export function utcToFullCalendarValue(iso: string, allDay: boolean, tz = getBrowserTimezone()): string {
  const date = parseUtcIso(iso)
  if (allDay) {
    return formatInTimeZone(date, tz, 'yyyy-MM-dd')
  }
  return formatInTimeZone(date, tz, "yyyy-MM-dd'T'HH:mm:ss")
}

/** FullCalendar Date → UTC ISO */
export function calendarDateToUtcIso(date: Date, tz = getBrowserTimezone()): string {
  const wallClock = formatInTimeZone(date, tz, "yyyy-MM-dd'T'HH:mm:ss")
  return fromZonedTime(wallClock, tz).toISOString()
}

export function nowUtcIso(): string {
  return new Date().toISOString()
}

export function getTodayLocalDateString(tz = getBrowserTimezone()): string {
  return formatInTimeZone(new Date(), tz, 'yyyy-MM-dd')
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const base = parseUtcIso(`${dateStr}T00:00:00.000Z`)
  return format(addDays(base, days), 'yyyy-MM-dd')
}

export function defaultAllDayEventUtcIso(tz = getBrowserTimezone()): string {
  return localToUtc(getTodayLocalDateString(tz), true, tz)
}

export function defaultTimedEventStartUtcIso(tz = getBrowserTimezone()): string {
  return localToUtc(`${getTodayLocalDateString(tz)}T09:00`, false, tz)
}

export function defaultTimedEventEndUtcIso(tz = getBrowserTimezone()): string {
  return localToUtc(`${getTodayLocalDateString(tz)}T18:00`, false, tz)
}

/** 종일 일정 폼 값을 inclusive 범위로 정규화 */
export function normalizeAllDayRangeForSave(
  startAt: string,
  endAt: string,
  tz = getBrowserTimezone(),
): { start_at: string; end_at: string } {
  let start_at = localToUtc(utcToLocalFormInput(startAt, true, tz), true, tz)
  let end_at = localToUtc(utcToLocalFormInput(endAt, true, tz), true, tz)
  if (end_at < start_at) {
    end_at = start_at
  }
  return { start_at, end_at }
}

/** FullCalendar exclusive end → 종일 일정 inclusive 마지막 날 */
export function fcExclusiveEndToInclusiveAllDayDate(
  exclusiveEndIso: string,
  tz = getBrowserTimezone(),
): string {
  const exclusiveDate = utcToLocalFormInput(exclusiveEndIso, true, tz)
  return addDaysToDateString(exclusiveDate, -1)
}

/** FullCalendar 드래그/리사이즈 결과 → UTC 저장값 */
export function calendarRangeToUtcIso(
  start: Date,
  end: Date | null,
  allDay: boolean,
  tz = getBrowserTimezone(),
): { start_at: string; end_at: string } {
  const startRaw = calendarDateToUtcIso(start, tz)

  if (allDay) {
    const start_at = localToUtc(utcToLocalFormInput(startRaw, true, tz), true, tz)
    if (!end) {
      return { start_at, end_at: start_at }
    }
    const inclusiveEnd = fcExclusiveEndToInclusiveAllDayDate(calendarDateToUtcIso(end, tz), tz)
    const end_at = localToUtc(inclusiveEnd, true, tz)
    return normalizeAllDayRangeForSave(start_at, end_at, tz)
  }

  const end_at = end ? calendarDateToUtcIso(end, tz) : startRaw
  return { start_at: startRaw, end_at }
}

/** 종일 일정으로 저장 가능한 자정 타임스탬프인지 확인 (로컬 TZ 기준) */
export function isAllDayTimestamps(startAt: string, endAt: string, tz = getBrowserTimezone()): boolean {
  const start = toZonedTime(parseUtcIso(startAt), tz)
  const end = toZonedTime(parseUtcIso(endAt), tz)
  const isMidnight = (d: Date) =>
    d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0
  return isMidnight(start) && isMidnight(end)
}

export function resolveEventAllDay(
  allDay: boolean,
  startAt: string,
  endAt: string,
  tz = getBrowserTimezone(),
): boolean {
  return allDay && isAllDayTimestamps(startAt, endAt, tz)
}

/** 종일 일정의 FC exclusive end (DB inclusive 마지막 날 + 1일) */
export function toFullCalendarAllDayEnd(
  startIso: string,
  endIso: string,
  tz = getBrowserTimezone(),
): string {
  const start = utcToLocalFormInput(startIso, true, tz)
  const end = utcToLocalFormInput(endIso, true, tz)
  const inclusiveEnd = end >= start ? end : start
  return addDaysToDateString(inclusiveEnd, 1)
}

/** 반복 종료일(로컬 날짜) → 해당 로컬 날짜의 끝(23:59:59)을 UTC ISO로 저장 */
export function recurrenceUntilLocalToUtc(
  localDate: string,
  tz = getBrowserTimezone(),
): string {
  const dateOnly = localDate.slice(0, 10)
  return fromZonedTime(`${dateOnly}T23:59:59`, tz).toISOString()
}

/** 저장된 반복 종료일(UTC) → 폼 표시용 로컬 날짜 */
export function recurrenceUntilUtcToLocal(
  iso: string,
  tz = getBrowserTimezone(),
): string {
  return formatInTimeZone(parseUtcIso(iso), tz, 'yyyy-MM-dd')
}

export function formatLocalDateTime(
  iso: string,
  style: 'date' | 'time' | 'datetime' = 'datetime',
  tz = getBrowserTimezone(),
): string {
  const date = parseUtcIso(iso)
  if (style === 'date') {
    return formatInTimeZone(date, tz, 'M월 d일')
  }
  if (style === 'time') {
    return formatInTimeZone(date, tz, 'HH:mm')
  }
  return formatInTimeZone(date, tz, 'M월 d일 HH:mm')
}

export function prepareEventFormForSave(form: EventFormData, tz = getBrowserTimezone()): EventFormData {
  if (form.all_day) {
    const { start_at, end_at } = normalizeAllDayRangeForSave(form.start_at, form.end_at, tz)
    return { ...form, start_at, end_at }
  }

  return {
    ...form,
    start_at: localToUtc(utcToLocalFormInput(form.start_at, false, tz), false, tz),
    end_at: localToUtc(utcToLocalFormInput(form.end_at, false, tz), false, tz),
  }
}

// 하위 호환 alias
export const APP_TIMEZONE = getBrowserTimezone()
export const dbToKstFormInput = utcToLocalFormInput
export const kstFormToDb = localToUtc
export const dbToFullCalendarValue = utcToFullCalendarValue
export const calendarDateToDbIso = calendarDateToUtcIso
export const toKstFormInput = utcToLocalFormInput
export const fromKstFormInput = localToUtc
export const formatKstDateTime = formatLocalDateTime
