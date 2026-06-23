import { addDays, addMonths, addWeeks, addYears, isAfter, isBefore } from 'date-fns'
import { calendarDateToUtcIso, normalizeDbTimestamp, parseWallClockDate } from './datetime'
import type {
  CalendarEvent,
  DateRange,
  ExpandedCalendarEvent,
  RecurrenceException,
  RecurrenceFreq,
} from '../types'

function advanceDate(date: Date, freq: RecurrenceFreq, interval: number): Date {
  switch (freq) {
    case 'daily':
      return addDays(date, interval)
    case 'weekly':
      return addWeeks(date, interval)
    case 'monthly':
      return addMonths(date, interval)
    case 'yearly':
      return addYears(date, interval)
  }
}

function getDurationMs(event: CalendarEvent): number {
  return parseWallClockDate(event.end_at).getTime() - parseWallClockDate(event.start_at).getTime()
}

function buildInstance(
  master: CalendarEvent,
  originalStart: Date,
): ExpandedCalendarEvent {
  const duration = getDurationMs(master)
  const end = new Date(originalStart.getTime() + duration)
  const originalStartAt = calendarDateToUtcIso(originalStart)

  return {
    ...master,
    start_at: originalStartAt,
    end_at: calendarDateToUtcIso(end),
    instanceId: `${master.id}_${originalStartAt}`,
    masterId: master.id,
    originalStartAt,
    isRecurringInstance: true,
  }
}

export function expandRecurringEvent(
  master: CalendarEvent,
  range: DateRange,
  exceptions: RecurrenceException[] = [],
): ExpandedCalendarEvent[] {
  if (!master.recurrence_freq) return []

  const instances: ExpandedCalendarEvent[] = []
  const rangeStart = range.start
  const rangeEnd = range.end
  let current = parseWallClockDate(master.start_at)
  const masterStart = parseWallClockDate(master.start_at)
  const until = master.recurrence_until ? parseWallClockDate(master.recurrence_until) : null
  const maxCount = master.recurrence_count ?? Infinity
  let count = 0
  const interval = master.recurrence_interval || 1
  const excluded = new Set(exceptions.map((ex) => normalizeDbTimestamp(ex.original_start_at)))

  while (count < maxCount) {
    if (until && isAfter(current, until)) break

    const duration = getDurationMs(master)
    const instanceEnd = new Date(current.getTime() + duration)

    if (isAfter(current, rangeEnd)) break

    if (!isBefore(instanceEnd, rangeStart)) {
      const base = buildInstance(master, current)
      if (!excluded.has(base.originalStartAt)) {
        instances.push(base)
      }
    }

    count += 1
    current = advanceDate(masterStart, master.recurrence_freq, interval * count)
  }

  return instances
}

export function expandEventsForRange(
  events: CalendarEvent[],
  exceptionsByEventId: Record<string, RecurrenceException[]>,
  range: DateRange,
): ExpandedCalendarEvent[] {
  const expanded: ExpandedCalendarEvent[] = []

  for (const event of events) {
    if (event.recurrence_freq) {
      expanded.push(
        ...expandRecurringEvent(
          event,
          range,
          exceptionsByEventId[event.id] ?? [],
        ),
      )
      continue
    }

    expanded.push({
      ...event,
      instanceId: event.id,
      masterId: event.id,
      originalStartAt: event.start_at,
      isRecurringInstance: false,
    })
  }

  return expanded
}

export function isRecurringMaster(event: CalendarEvent): boolean {
  return !!event.recurrence_freq
}

export function isFiniteRecurringSeries(master: CalendarEvent): boolean {
  return master.recurrence_count !== null || master.recurrence_until !== null
}

/** 달력 range 없이 유한 반복의 남은 표시 회차 수 (제외 목록 반영) */
export function countRemainingOccurrences(
  master: CalendarEvent,
  exceptions: RecurrenceException[] = [],
): number {
  if (!master.recurrence_freq) return 0

  const excluded = new Set(exceptions.map((ex) => normalizeDbTimestamp(ex.original_start_at)))
  const until = master.recurrence_until ? parseWallClockDate(master.recurrence_until) : null
  const maxCount = master.recurrence_count ?? Infinity
  const interval = master.recurrence_interval || 1

  const masterStart = parseWallClockDate(master.start_at)
  let current = masterStart
  let count = 0
  let remaining = 0

  while (count < maxCount) {
    if (until && isAfter(current, until)) break

    const originalStartAt = calendarDateToUtcIso(current)
    if (!excluded.has(originalStartAt)) {
      remaining += 1
    }

    count += 1
    current = advanceDate(masterStart, master.recurrence_freq, interval * count)
  }

  return remaining
}

export function overlapsRange(event: CalendarEvent, range: DateRange): boolean {
  const start = parseWallClockDate(event.start_at)
  const end = parseWallClockDate(event.end_at)
  return start < range.end && end > range.start
}
