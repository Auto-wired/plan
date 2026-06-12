import type { EventInput } from '@fullcalendar/core'
import { getBrowserTimezone } from './datetime'
import {
  normalizeDbTimestamp,
  recurrenceUntilLocalToUtc,
  recurrenceUntilUtcToLocal,
  resolveEventAllDay,
  toFullCalendarAllDayEnd,
  utcToFullCalendarValue,
} from './datetime'
import { DEFAULT_EVENT_CATEGORY, getCategoryColor } from './categories'
import type {
  CalendarEvent,
  EventFormData,
  ExpandedCalendarEvent,
  RecurrenceRule,
} from '../types'

export function toFullCalendarEvent(
  event: ExpandedCalendarEvent,
  tz = getBrowserTimezone(),
): EventInput {
  const startDb = normalizeDbTimestamp(event.start_at)
  const endDb = normalizeDbTimestamp(event.end_at)
  const color = getCategoryColor(event.category)
  const allDay = resolveEventAllDay(event.all_day, event.start_at, event.end_at, tz)

  return {
    id: event.instanceId,
    title: event.title,
    start: utcToFullCalendarValue(event.start_at, allDay, tz),
    end: allDay
      ? toFullCalendarAllDayEnd(event.start_at, event.end_at, tz)
      : utcToFullCalendarValue(event.end_at, allDay, tz),
    allDay,
    backgroundColor: color,
    borderColor: color,
    extendedProps: {
      description: event.description,
      category: event.category,
      start_at: startDb,
      end_at: endDb,
      masterId: event.masterId,
      originalStartAt: event.originalStartAt,
      isRecurringInstance: event.isRecurringInstance,
      dbEventId: event.id,
    },
  }
}

export function toFullCalendarEvents(
  events: ExpandedCalendarEvent[],
  tz = getBrowserTimezone(),
): EventInput[] {
  return events.map((event) => toFullCalendarEvent(event, tz))
}

export function formDataToInsert(
  form: EventFormData,
  userId: string,
): Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'> {
  const recurrence = form.recurrence
  return {
    user_id: userId,
    title: form.title,
    description: form.description || null,
    start_at: form.start_at,
    end_at: form.end_at,
    all_day: form.all_day,
    category: form.category,
    recurrence_freq: recurrence?.freq ?? null,
    recurrence_interval: recurrence?.interval ?? 1,
    recurrence_count: recurrence?.count ?? null,
    recurrence_until: recurrence?.until
      ? recurrenceUntilLocalToUtc(recurrence.until)
      : null,
  }
}

export function eventToRecurrenceRule(
  event: CalendarEvent,
  tz = getBrowserTimezone(),
): RecurrenceRule | null {
  if (!event.recurrence_freq) return null
  return {
    freq: event.recurrence_freq,
    interval: event.recurrence_interval || 1,
    count: event.recurrence_count ?? undefined,
    until: event.recurrence_until
      ? recurrenceUntilUtcToLocal(event.recurrence_until, tz)
      : undefined,
  }
}

export function eventToFormData(event: CalendarEvent, tz = getBrowserTimezone()): EventFormData {
  const all_day = resolveEventAllDay(event.all_day, event.start_at, event.end_at, tz)
  return {
    title: event.title,
    description: event.description ?? '',
    start_at: normalizeDbTimestamp(event.start_at),
    end_at: normalizeDbTimestamp(event.end_at),
    all_day,
    category: event.category ?? DEFAULT_EVENT_CATEGORY,
    recurrence: eventToRecurrenceRule(event, tz),
  }
}
