import { parseScheduleSpec } from './resolveSchedule.ts'

/** 일정 이동·시간 변경 의도 (target 한정어와 구분). */
const RESCHEDULE_INTENT =
  /옮겨|옮기|미루|연기|다시\s*잡|시간\s*바꿔|시각\s*바꿔|시간\s*변경|시각\s*변경|로\s*옮|으로\s*옮|로\s*변경|으로\s*변경|로\s*미루|으로\s*미루|reschedule/i

export type UpdateTarget = {
  id: string
  original_start_at?: string
}

export type UpdateChanges = {
  title?: string
  description?: string | null
  category?: string
  schedule_spec?: unknown
  start_at?: string
  end_at?: string
  all_day?: boolean
}

/** update: 일정 이동·시간 변경 의도가 있는가 (메타데이터만 변경과 구분). */
export function hasRescheduleIntent(
  userMessage: string,
  args: Record<string, unknown>,
): boolean {
  if (args.start_at !== undefined || args.end_at !== undefined) {
    return true
  }

  if (!args.schedule_spec) {
    return RESCHEDULE_INTENT.test(userMessage)
  }

  const parsed = parseScheduleSpec(args.schedule_spec)
  if (!parsed) {
    return RESCHEDULE_INTENT.test(userMessage)
  }

  if (parsed.time && parsed.time.kind !== 'preserve') {
    return true
  }

  return RESCHEDULE_INTENT.test(userMessage)
}

export function partitionUpdateArgs(args: Record<string, unknown>): {
  target: UpdateTarget
  changes: UpdateChanges
} {
  const target: UpdateTarget = { id: String(args.id ?? '') }
  if (args.original_start_at !== undefined) {
    target.original_start_at = String(args.original_start_at)
  }

  const changes: UpdateChanges = {}
  if (args.title !== undefined) changes.title = String(args.title)
  if (args.description !== undefined) {
    changes.description = args.description ? String(args.description) : null
  }
  if (args.category !== undefined) changes.category = String(args.category)
  if (args.schedule_spec !== undefined) changes.schedule_spec = args.schedule_spec
  if (args.start_at !== undefined) changes.start_at = String(args.start_at)
  if (args.end_at !== undefined) changes.end_at = String(args.end_at)
  if (args.all_day !== undefined) changes.all_day = Boolean(args.all_day)

  return { target, changes }
}

/**
 * Mutation Safety: 식별용 date(schedule_spec)가 DB 날짜 변경으로 오염되지 않도록 strip.
 * metadata-only 또는 이동 의도 없는 schedule_spec 제거.
 */
export function sanitizeUpdateArgs(
  args: Record<string, unknown>,
  userMessage: string,
): Record<string, unknown> {
  const { target, changes } = partitionUpdateArgs(args)
  const reschedule = hasRescheduleIntent(userMessage, args)

  const safe: Record<string, unknown> = { ...target }

  if (changes.title !== undefined) safe.title = changes.title
  if (changes.description !== undefined) safe.description = changes.description
  if (changes.category !== undefined) safe.category = changes.category

  if (reschedule) {
    if (changes.schedule_spec !== undefined) safe.schedule_spec = changes.schedule_spec
    if (changes.start_at !== undefined) safe.start_at = changes.start_at
    if (changes.end_at !== undefined) safe.end_at = changes.end_at
    if (changes.all_day !== undefined) safe.all_day = changes.all_day
  }

  return safe
}

export function hasScheduleFieldChanges(fields: {
  start_at?: string
  end_at?: string
  all_day?: boolean
}): boolean {
  return (
    fields.start_at !== undefined ||
    fields.end_at !== undefined ||
    fields.all_day !== undefined
  )
}
