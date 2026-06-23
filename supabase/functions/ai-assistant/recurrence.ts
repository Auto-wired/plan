import type { CalendarEvent } from './tools.ts'

export interface RecurrenceExceptionRow {
  original_start_at: string
}

/** 저장 포맷(KST 벽시계를 Z로 저장)과 동일한 ISO 문자열. */
function toStoredIso(date: Date): string {
  return date.toISOString()
}

function addDaysUtc(base: Date, days: number): Date {
  const d = new Date(base.getTime())
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

/** date-fns addMonths와 동일하게 말일 클램프(예: 1/31 +1개월 = 2/28). */
function addMonthsClamped(base: Date, months: number): Date {
  const day = base.getUTCDate()
  const d = new Date(base.getTime())
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d
}

export function advanceOccurrence(start: Date, freq: string, steps: number): Date {
  switch (freq) {
    case 'daily':
      return addDaysUtc(start, steps)
    case 'weekly':
      return addDaysUtc(start, steps * 7)
    case 'monthly':
      return addMonthsClamped(start, steps)
    case 'yearly':
      return addMonthsClamped(start, steps * 12)
    default:
      return addDaysUtc(start, steps)
  }
}

/**
 * 마스터 반복 일정을 [rangeStart, rangeEndExclusive) 안의 회차로 전개한다.
 * 제외 목록(original_start_at)에 해당하는 회차는 건너뛴다.
 * 비반복 일정은 빈 배열을 반환한다(호출부에서 별도 처리).
 */
export function expandOccurrences(
  master: CalendarEvent,
  exceptions: RecurrenceExceptionRow[],
  rangeStart: Date,
  rangeEndExclusive: Date,
  hardCap = 1000,
): CalendarEvent[] {
  if (!master.recurrence_freq) return []

  const excluded = new Set(
    exceptions.map((ex) => new Date(ex.original_start_at).toISOString()),
  )

  const start = new Date(master.start_at)
  const end = new Date(master.end_at)
  const duration = end.getTime() - start.getTime()
  const until = master.recurrence_until ? new Date(master.recurrence_until) : null
  const maxCount = master.recurrence_count ?? Infinity
  const interval = master.recurrence_interval || 1

  const out: CalendarEvent[] = []

  for (let i = 0; i < maxCount && i < hardCap; i++) {
    const occStart = advanceOccurrence(start, master.recurrence_freq, interval * i)

    if (until && occStart.getTime() > until.getTime()) break
    if (occStart.getTime() >= rangeEndExclusive.getTime()) break

    const occEnd = new Date(occStart.getTime() + duration)
    if (occEnd.getTime() <= rangeStart.getTime()) continue

    const key = occStart.toISOString()
    if (excluded.has(key)) continue

    out.push({
      ...master,
      start_at: toStoredIso(occStart),
      end_at: toStoredIso(occEnd),
    })
  }

  return out
}
