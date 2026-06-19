import { parseWallClockDate, recurrenceUntilLocalToUtc } from './datetime'
import { recurrenceRuleChanged } from './eventMapper'
import { supabase } from './supabase'
import type {
  CalendarEvent,
  EventFormData,
  RecurrenceException,
  RecurrenceScope,
} from '../types'

function recurrencePayload(form: EventFormData) {
  if (!form.recurrence) {
    return {
      recurrence_freq: null,
      recurrence_interval: 1,
      recurrence_count: null,
      recurrence_until: null,
    }
  }

  return {
    recurrence_freq: form.recurrence.freq,
    recurrence_interval: form.recurrence.interval || 1,
    recurrence_count: form.recurrence.count ?? null,
    recurrence_until: form.recurrence.until
      ? recurrenceUntilLocalToUtc(form.recurrence.until)
      : null,
  }
}

function shiftTimestamp(iso: string, deltaMs: number): string {
  return new Date(parseWallClockDate(iso).getTime() + deltaMs).toISOString()
}

async function excludeOccurrence(
  eventId: string,
  originalStartAt: string,
): Promise<void> {
  const { error } = await supabase.from('event_recurrence_exceptions').upsert(
    {
      event_id: eventId,
      original_start_at: originalStartAt,
      type: 'deleted',
    },
    { onConflict: 'event_id,original_start_at' },
  )
  if (error) throw error
}

async function wipeRecurrenceExceptions(eventId: string): Promise<void> {
  const { error } = await supabase
    .from('event_recurrence_exceptions')
    .delete()
    .eq('event_id', eventId)
  if (error) throw error
}

async function migrateRecurrenceExceptions(
  eventId: string,
  deltaMs: number,
): Promise<void> {
  const exceptions = await fetchRecurrenceExceptions([eventId])

  for (const ex of exceptions) {
    const { error: deleteError } = await supabase
      .from('event_recurrence_exceptions')
      .delete()
      .eq('id', ex.id)
    if (deleteError) throw deleteError

    const { error: insertError } = await supabase.from('event_recurrence_exceptions').insert({
      event_id: ex.event_id,
      original_start_at: shiftTimestamp(ex.original_start_at, deltaMs),
      type: ex.type,
      override_title: ex.override_title,
      override_description: ex.override_description,
      override_start_at: ex.override_start_at
        ? shiftTimestamp(ex.override_start_at, deltaMs)
        : null,
      override_end_at: ex.override_end_at ? shiftTimestamp(ex.override_end_at, deltaMs) : null,
      override_all_day: ex.override_all_day,
      override_category: ex.override_category,
    })
    if (insertError) throw insertError
  }
}

export async function deleteRecurringEvent(
  master: CalendarEvent,
  originalStartAt: string,
  scope: RecurrenceScope,
): Promise<void> {
  if (scope === 'all') {
    await wipeRecurrenceExceptions(master.id)
    await supabase.from('events').delete().eq('id', master.id)
    return
  }

  // scope === 'this': 이 occurrence만 반복에서 제외
  await excludeOccurrence(master.id, originalStartAt)
}

export async function editRecurringEvent(
  master: CalendarEvent,
  originalStartAt: string,
  scope: RecurrenceScope,
  form: EventFormData,
): Promise<void> {
  if (scope === 'all') {
    const deltaMs =
      parseWallClockDate(form.start_at).getTime() - parseWallClockDate(originalStartAt).getTime()
    const durationMs =
      parseWallClockDate(form.end_at).getTime() - parseWallClockDate(form.start_at).getTime()
    const newStart = new Date(parseWallClockDate(master.start_at).getTime() + deltaMs)
    const newEnd = new Date(newStart.getTime() + durationMs)

    if (recurrenceRuleChanged(master, form)) {
      await wipeRecurrenceExceptions(master.id)
    } else if (deltaMs !== 0) {
      await migrateRecurrenceExceptions(master.id, deltaMs)
    }

    const { error } = await supabase
      .from('events')
      .update({
        title: form.title,
        description: form.description || null,
        start_at: newStart.toISOString(),
        end_at: newEnd.toISOString(),
        all_day: form.all_day,
        category: form.category,
        ...recurrencePayload(form),
      })
      .eq('id', master.id)
    if (error) throw error
    return
  }

  // scope === 'this': 반복에서 제외한 뒤 독립된 단일 일정으로 분리
  await excludeOccurrence(master.id, originalStartAt)

  const { error } = await supabase.from('events').insert({
    user_id: master.user_id,
    title: form.title,
    description: form.description || null,
    start_at: form.start_at,
    end_at: form.end_at,
    all_day: form.all_day,
    category: form.category,
    recurrence_freq: null,
    recurrence_interval: 1,
    recurrence_count: null,
    recurrence_until: null,
  })
  if (error) throw error
}

export async function fetchRecurrenceExceptions(
  eventIds: string[],
): Promise<RecurrenceException[]> {
  if (eventIds.length === 0) return []

  const { data, error } = await supabase
    .from('event_recurrence_exceptions')
    .select('*')
    .in('event_id', eventIds)

  if (error) throw error
  return (data ?? []) as RecurrenceException[]
}
