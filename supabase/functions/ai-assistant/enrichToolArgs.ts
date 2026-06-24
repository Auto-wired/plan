import { enrichMutationScheduleArgs } from './resolveSchedule.ts'
import type { SessionContext } from './scheduleSpec.ts'
import { enrichRecurringOccurrenceArgs } from './sessionEnrich.ts'
import { hasRescheduleIntent, sanitizeUpdateArgs } from './mutationSafety.ts'

const MESSAGE_SCHEDULE_PATTERNS: Array<{
  pattern: RegExp
  date: Record<string, unknown>
}> = [
  { pattern: /다다음\s*주/, date: { kind: 'week', week_offset: 2 } },
  { pattern: /다음\s*주|next\s*week/i, date: { kind: 'week', week_offset: 1 } },
  { pattern: /지난\s*주|last\s*week/i, date: { kind: 'week', week_offset: -1 } },
  { pattern: /이번\s*주|this\s*week/i, date: { kind: 'week', week_offset: 0 } },
  { pattern: /이번\s*달|this\s*month/i, date: { kind: 'month_span', month_offset: 0 } },
  { pattern: /다음\s*달|next\s*month/i, date: { kind: 'month_span', month_offset: 1 } },
  { pattern: /지난\s*달|last\s*month/i, date: { kind: 'month_span', month_offset: -1 } },
  { pattern: /올해|금년|this\s*year/i, date: { kind: 'year', year_offset: 0 } },
  { pattern: /\b모레\b/, date: { kind: 'day', day_offset: 2 } },
  { pattern: /\b글피\b/, date: { kind: 'day', day_offset: 3 } },
  { pattern: /\b내일\b|\btomorrow\b/i, date: { kind: 'day', day_offset: 1 } },
  { pattern: /\b어제\b|\byesterday\b/i, date: { kind: 'day', day_offset: -1 } },
  { pattern: /\b오늘\b|\btoday\b/i, date: { kind: 'day', day_offset: 0 } },
]

function inferWeekdayFromMessage(message: string): string | null {
  const map: Record<string, string> = {
    일요일: 'sun',
    월요일: 'mon',
    화요일: 'tue',
    수요일: 'wed',
    목요일: 'thu',
    금요일: 'fri',
    토요일: 'sat',
  }
  for (const [ko, en] of Object.entries(map)) {
    if (message.includes(ko)) return en
  }
  return null
}

export function inferScheduleSpecFromMessage(message: string): Record<string, unknown> | null {
  for (const { pattern, date } of MESSAGE_SCHEDULE_PATTERNS) {
    if (pattern.test(message)) {
      const weekday = inferWeekdayFromMessage(message)
      const dateSpec = { ...date } as Record<string, unknown>
      if (weekday && dateSpec.kind === 'week') {
        dateSpec.weekday = weekday
      }
      return { date: dateSpec }
    }
  }
  const weekday = inferWeekdayFromMessage(message)
  if (weekday) {
    return { date: { kind: 'week', week_offset: 0, weekday } }
  }
  return null
}

export function enrichToolArgs(
  toolName: string,
  args: Record<string, unknown>,
  userMessage: string,
  sessionContext?: SessionContext,
): Record<string, unknown> {
  let result = { ...args }

  if (toolName === 'query_events') {
    if (result.schedule_spec) return result
    const inferred = inferScheduleSpecFromMessage(userMessage)
    if (!inferred) return result
    return {
      ...result,
      schedule_spec: inferred,
      period: undefined,
      weekday: undefined,
      start_date: undefined,
      end_date: undefined,
    }
  }

  if (toolName === 'create_event') {
    result = enrichMutationScheduleArgs(result, userMessage)
    if (!result.schedule_spec) {
      const inferred = inferScheduleSpecFromMessage(userMessage)
      if (inferred) {
        result = {
          ...result,
          schedule_spec: inferred,
          start_at: result.start_at,
          end_at: result.end_at,
        }
        result = enrichMutationScheduleArgs(result, userMessage)
      }
    }
  }

  if (toolName === 'update_event') {
    result = sanitizeUpdateArgs(result, userMessage)
    if (hasRescheduleIntent(userMessage, result) && result.schedule_spec) {
      result = enrichMutationScheduleArgs(result, userMessage)
    }
  }

  if (toolName === 'delete_event' || toolName === 'update_event') {
    result = enrichRecurringOccurrenceArgs(result, sessionContext, userMessage)
  }

  return result
}

/** V2.4: confirm 실행용 내부 플래그 제거 */
export function stripPendingInternalFields(args: Record<string, unknown>): Record<string, unknown> {
  const { _v24Frozen: _, ...rest } = args
  return rest
}

export function isFrozenPendingArgs(args: Record<string, unknown>): boolean {
  return args._v24Frozen === true
}
