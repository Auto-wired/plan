import { parseUtcIso, recurrenceUntilLocalToUtc } from './datetime'
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

export async function deleteRecurringEvent(
  master: CalendarEvent,
  originalStartAt: string,
  scope: RecurrenceScope,
): Promise<void> {
  if (scope === 'all') {
    await supabase.from('event_recurrence_exceptions').delete().eq('event_id', master.id)
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
    // 시리즈의 기준 시작점(마스터 start_at)은 유지하고, 편집한 인스턴스의
    // 시간 이동분(delta)과 길이만 전체에 적용한다. (시간 변경이 없으면 기준점 그대로)
    const deltaMs =
      parseUtcIso(form.start_at).getTime() - parseUtcIso(originalStartAt).getTime()
    const durationMs =
      parseUtcIso(form.end_at).getTime() - parseUtcIso(form.start_at).getTime()
    const newStart = new Date(parseUtcIso(master.start_at).getTime() + deltaMs)
    const newEnd = new Date(newStart.getTime() + durationMs)

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
