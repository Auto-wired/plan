import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  calendarDateToUtcIso,
  normalizeDbTimestamp,
  prepareEventFormForSave,
  recurrenceUntilLocalToUtc,
} from '../lib/datetime'
import { formDataToInsert, toFullCalendarEvents } from '../lib/eventMapper'
import { expandEventsForRange } from '../lib/recurrence'
import {
  deleteRecurringEvent,
  editRecurringEvent,
  fetchRecurrenceExceptions,
} from '../lib/recurrenceActions'
import { supabase } from '../lib/supabase'
import type {
  CalendarEvent,
  DateRange,
  EventFormData,
  ExpandedCalendarEvent,
  RecurrenceScope,
} from '../types'

function normalizeEvent(event: CalendarEvent): CalendarEvent {
  return {
    ...event,
    start_at: normalizeDbTimestamp(event.start_at),
    end_at: normalizeDbTimestamp(event.end_at),
    recurrence_freq: event.recurrence_freq ?? null,
    recurrence_interval: event.recurrence_interval ?? 1,
    recurrence_count: event.recurrence_count ?? null,
    recurrence_until: event.recurrence_until
      ? normalizeDbTimestamp(event.recurrence_until)
      : null,
  }
}

async function fetchEvents(range: DateRange): Promise<ExpandedCalendarEvent[]> {
  const rangeStartIso = calendarDateToUtcIso(range.start)
  const rangeEndIso = calendarDateToUtcIso(range.end)

  const { data: rawEvents, error } = await supabase
    .from('events')
    .select('*')
    .order('start_at', { ascending: true })

  if (error) throw error

  const events = (rawEvents ?? [])
    .map((event) => normalizeEvent(event as CalendarEvent))
    .filter((event) => {
      if (event.recurrence_freq) {
        if (event.start_at >= rangeEndIso) return false
        if (event.recurrence_until && event.recurrence_until <= rangeStartIso) return false
        return true
      }
      return event.start_at < rangeEndIso && event.end_at > rangeStartIso
    })
  const recurringIds = events
    .filter((event) => event.recurrence_freq)
    .map((event) => event.id)
  const exceptions = await fetchRecurrenceExceptions(recurringIds)
  const exceptionsByEventId = exceptions.reduce<Record<string, typeof exceptions>>(
    (acc, item) => {
      acc[item.event_id] = [...(acc[item.event_id] ?? []), item]
      return acc
    },
    {},
  )

  return expandEventsForRange(events, exceptionsByEventId, range)
}

export function useEvents(range: DateRange | null) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['events', range?.start.toISOString(), range?.end.toISOString()],
    queryFn: () => fetchEvents(range!),
    enabled: !!range,
  })

  const createEvent = useCallback(
    async (form: EventFormData, userId: string) => {
      const prepared = prepareEventFormForSave(form)
      const { data, error } = await supabase
        .from('events')
        .insert(formDataToInsert(prepared, userId))
        .select()
        .single()

      if (error) throw error
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      return normalizeEvent(data as CalendarEvent)
    },
    [queryClient],
  )

  const updateEvent = useCallback(
    async (id: string, form: Partial<EventFormData>) => {
      const payload: Record<string, unknown> = {}
      if (form.title !== undefined) payload.title = form.title
      if (form.description !== undefined) payload.description = form.description || null
      if (form.all_day !== undefined) payload.all_day = form.all_day
      if (form.category !== undefined) payload.category = form.category

      if (form.start_at !== undefined) {
        payload.start_at = normalizeDbTimestamp(form.start_at)
      }
      if (form.end_at !== undefined) {
        payload.end_at = normalizeDbTimestamp(form.end_at)
      }

      if (form.recurrence !== undefined) {
        if (form.recurrence) {
          payload.recurrence_freq = form.recurrence.freq
          payload.recurrence_interval = form.recurrence.interval || 1
          payload.recurrence_count = form.recurrence.count ?? null
          payload.recurrence_until = form.recurrence.until
            ? recurrenceUntilLocalToUtc(form.recurrence.until)
            : null
        } else {
          payload.recurrence_freq = null
          payload.recurrence_interval = 1
          payload.recurrence_count = null
          payload.recurrence_until = null
        }
      }

      const { data, error } = await supabase
        .from('events')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      return normalizeEvent(data as CalendarEvent)
    },
    [queryClient],
  )

  const updateRecurringEvent = useCallback(
    async (
      master: CalendarEvent,
      originalStartAt: string,
      scope: RecurrenceScope,
      form: EventFormData,
    ) => {
      const prepared = prepareEventFormForSave(form)
      await editRecurringEvent(master, originalStartAt, scope, prepared)
      await queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    [queryClient],
  )

  const deleteEvent = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('events').delete().eq('id', id)
      if (error) throw error
      await queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    [queryClient],
  )

  const deleteRecurringEventByScope = useCallback(
    async (master: CalendarEvent, originalStartAt: string, scope: RecurrenceScope) => {
      await deleteRecurringEvent(master, originalStartAt, scope)
      await queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    [queryClient],
  )

  const fetchMasterEvent = useCallback(async (masterId: string) => {
    const { data, error } = await supabase.from('events').select('*').eq('id', masterId).single()
    if (error) throw error
    return normalizeEvent(data as CalendarEvent)
  }, [])

  return {
    events: query.data ?? [],
    calendarEvents: toFullCalendarEvents(query.data ?? []),
    isLoading: query.isLoading,
    error: query.error,
    createEvent,
    updateEvent,
    updateRecurringEvent,
    deleteEvent,
    deleteRecurringEventByScope,
    fetchMasterEvent,
    invalidate: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
  }
}
