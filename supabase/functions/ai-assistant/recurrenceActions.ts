import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { advanceOccurrence } from './recurrence.ts'
import type { CalendarEvent } from './tools.ts'
import { hasScheduleFieldChanges } from './mutationSafety.ts'

interface ExceptionRow {
  id: string
  event_id: string
  original_start_at: string
}

/** 저장 포맷과 비교 가능하도록 정규화. */
function normalizeStamp(iso: string): string {
  return new Date(iso).toISOString()
}

export function isFiniteSeries(master: CalendarEvent): boolean {
  return master.recurrence_count !== null || master.recurrence_until !== null
}

/** 유한 반복의 남은 표시 회차 수(제외 목록 반영). 무한이면 Infinity. */
export function countRemaining(master: CalendarEvent, exceptions: ExceptionRow[]): number {
  if (!master.recurrence_freq) return 0
  if (!isFiniteSeries(master)) return Number.POSITIVE_INFINITY

  const excluded = new Set(exceptions.map((ex) => normalizeStamp(ex.original_start_at)))
  const start = new Date(master.start_at)
  const until = master.recurrence_until ? new Date(master.recurrence_until) : null
  const maxCount = master.recurrence_count ?? Infinity
  const interval = master.recurrence_interval || 1

  let remaining = 0
  for (let i = 0; i < maxCount && i < 5000; i++) {
    const occ = advanceOccurrence(start, master.recurrence_freq, interval * i)
    if (until && occ.getTime() > until.getTime()) break
    if (!excluded.has(occ.toISOString())) remaining += 1
  }
  return remaining
}

export async function fetchExceptions(
  supabase: SupabaseClient,
  eventId: string,
): Promise<ExceptionRow[]> {
  const { data, error } = await supabase
    .from('event_recurrence_exceptions')
    .select('*')
    .eq('event_id', eventId)
  if (error) throw error
  return (data ?? []) as ExceptionRow[]
}

async function excludeOccurrence(
  supabase: SupabaseClient,
  eventId: string,
  originalStartAt: string,
): Promise<void> {
  const { error } = await supabase.from('event_recurrence_exceptions').upsert(
    { event_id: eventId, original_start_at: originalStartAt },
    { onConflict: 'event_id,original_start_at' },
  )
  if (error) throw error
}

async function wipeExceptions(supabase: SupabaseClient, eventId: string): Promise<void> {
  const { error } = await supabase
    .from('event_recurrence_exceptions')
    .delete()
    .eq('event_id', eventId)
  if (error) throw error
}

async function migrateExceptions(
  supabase: SupabaseClient,
  eventId: string,
  deltaMs: number,
): Promise<void> {
  if (deltaMs === 0) return
  const exceptions = await fetchExceptions(supabase, eventId)
  for (const ex of exceptions) {
    const shifted = new Date(new Date(ex.original_start_at).getTime() + deltaMs).toISOString()
    const { error: delErr } = await supabase
      .from('event_recurrence_exceptions')
      .delete()
      .eq('id', ex.id)
    if (delErr) throw delErr
    const { error: insErr } = await supabase
      .from('event_recurrence_exceptions')
      .insert({ event_id: ex.event_id, original_start_at: shifted })
    if (insErr) throw insErr
  }
}

export interface RecurringUpdateFields {
  title?: string
  description?: string | null
  category?: string
  all_day?: boolean
  start_at?: string
  end_at?: string
}

/**
 * 반복 일정 삭제(범위별). 달력 `deleteRecurringEvent`와 동일한 정책.
 * 반환: 표시용 스냅샷 이벤트.
 */
export async function deleteRecurringByScope(
  supabase: SupabaseClient,
  master: CalendarEvent,
  originalStartAt: string,
  scope: 'this' | 'all',
): Promise<CalendarEvent[]> {
  if (scope === 'all') {
    await wipeExceptions(supabase, master.id)
    const { error } = await supabase.from('events').delete().eq('id', master.id)
    if (error) throw error
    return [master]
  }

  // scope === 'this': 해당 회차만 제외. 유한 반복에서 남은 회차가 1개면 전체 삭제.
  if (master.recurrence_freq && isFiniteSeries(master)) {
    const exceptions = await fetchExceptions(supabase, master.id)
    const target = normalizeStamp(originalStartAt)
    const alreadyExcluded = exceptions.some(
      (ex) => normalizeStamp(ex.original_start_at) === target,
    )
    if (!alreadyExcluded && countRemaining(master, exceptions) === 1) {
      await wipeExceptions(supabase, master.id)
      const { error } = await supabase.from('events').delete().eq('id', master.id)
      if (error) throw error
      return [master]
    }
  }

  await excludeOccurrence(supabase, master.id, originalStartAt)
  const duration = new Date(master.end_at).getTime() - new Date(master.start_at).getTime()
  const occEnd = new Date(new Date(originalStartAt).getTime() + duration).toISOString()
  return [{ ...master, start_at: normalizeStamp(originalStartAt), end_at: occEnd }]
}

/**
 * 반복 일정 수정(범위별). 달력 `editRecurringEvent`와 동일한 정책.
 * 반환: 수정 결과 이벤트.
 */
export async function updateRecurringByScope(
  supabase: SupabaseClient,
  master: CalendarEvent,
  originalStartAt: string,
  scope: 'this' | 'all',
  fields: RecurringUpdateFields,
): Promise<CalendarEvent[]> {
  const masterDuration =
    new Date(master.end_at).getTime() - new Date(master.start_at).getTime()

  if (scope === 'all') {
    const deltaMs = fields.start_at
      ? new Date(fields.start_at).getTime() - new Date(originalStartAt).getTime()
      : 0
    const newStart = new Date(new Date(master.start_at).getTime() + deltaMs)
    const duration =
      fields.start_at && fields.end_at
        ? new Date(fields.end_at).getTime() - new Date(fields.start_at).getTime()
        : masterDuration
    const newEnd = new Date(newStart.getTime() + duration)

    await migrateExceptions(supabase, master.id, deltaMs)

    const payload: Record<string, unknown> = {
      start_at: newStart.toISOString(),
      end_at: newEnd.toISOString(),
    }
    if (fields.title !== undefined) payload.title = fields.title
    if (fields.description !== undefined) payload.description = fields.description
    if (fields.category !== undefined) payload.category = fields.category
    if (fields.all_day !== undefined) payload.all_day = fields.all_day

    const { data, error } = await supabase
      .from('events')
      .update(payload)
      .eq('id', master.id)
      .select()
      .single()
    if (error) throw error
    return [data as CalendarEvent]
  }

  // scope === 'this': 제외 후 독립 단일 일정으로 분리
  await excludeOccurrence(supabase, master.id, originalStartAt)

  const scheduleChanged = hasScheduleFieldChanges(fields)
  const start_at = scheduleChanged
    ? (fields.start_at ?? normalizeStamp(originalStartAt))
    : normalizeStamp(originalStartAt)
  const end_at = scheduleChanged
    ? (fields.end_at ??
      new Date(new Date(start_at).getTime() + masterDuration).toISOString())
    : new Date(new Date(originalStartAt).getTime() + masterDuration).toISOString()
  const all_day = scheduleChanged ? (fields.all_day ?? master.all_day) : master.all_day

  const { data, error } = await supabase
    .from('events')
    .insert({
      user_id: master.user_id,
      title: fields.title ?? master.title,
      description: fields.description !== undefined ? fields.description : master.description,
      start_at,
      end_at,
      all_day,
      category: fields.category ?? master.category,
      recurrence_freq: null,
      recurrence_interval: 1,
      recurrence_count: null,
      recurrence_until: null,
    })
    .select()
    .single()
  if (error) throw error
  return [data as CalendarEvent]
}
