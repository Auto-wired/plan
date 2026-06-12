import { addDays, addMonths, addWeeks, addYears, isAfter, isBefore } from 'date-fns'
import { normalizeDbTimestamp, parseUtcIso } from './datetime'
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
  return parseUtcIso(event.end_at).getTime() - parseUtcIso(event.start_at).getTime()
}

function buildInstance(
  master: CalendarEvent,
  originalStart: Date,
): ExpandedCalendarEvent {
  const duration = getDurationMs(master)
  const end = new Date(originalStart.getTime() + duration)
  const originalStartAt = originalStart.toISOString()

  return {
    ...master,
    start_at: originalStartAt,
    end_at: end.toISOString(),
    instanceId: `${master.id}_${originalStartAt}`,
    masterId: master.id,
    originalStartAt,
    isRecurringInstance: true,
  }
}

function applyException(
  instance: ExpandedCalendarEvent,
  exception: RecurrenceException,
): ExpandedCalendarEvent | null {
  if (exception.type === 'deleted') return null

  return {
    ...instance,
    title: exception.override_title ?? instance.title,
    description: exception.override_description ?? instance.description,
    start_at: exception.override_start_at ?? instance.start_at,
    end_at: exception.override_end_at ?? instance.end_at,
    all_day: exception.override_all_day ?? instance.all_day,
    category: exception.override_category ?? instance.category,
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
  let current = parseUtcIso(master.start_at)
  const masterStart = parseUtcIso(master.start_at)
  const until = master.recurrence_until ? parseUtcIso(master.recurrence_until) : null
  const maxCount = master.recurrence_count ?? Infinity
  let count = 0
  const interval = master.recurrence_interval || 1
  const exceptionMap = new Map(
    exceptions.map((ex) => [normalizeDbTimestamp(ex.original_start_at), ex]),
  )

  while (count < maxCount) {
    if (until && isAfter(current, until)) break

    const duration = getDurationMs(master)
    const instanceEnd = new Date(current.getTime() + duration)

    if (isAfter(current, rangeEnd)) break

    if (!isBefore(instanceEnd, rangeStart)) {
      const base = buildInstance(master, current)
      const exception = exceptionMap.get(base.originalStartAt)
      const resolved = exception ? applyException(base, exception) : base
      if (resolved) instances.push(resolved)
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

export function overlapsRange(event: CalendarEvent, range: DateRange): boolean {
  const start = parseUtcIso(event.start_at)
  const end = parseUtcIso(event.end_at)
  return start < range.end && end > range.start
}
