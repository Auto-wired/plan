import type { SessionContext } from './scheduleSpec.ts'

/** 반복 수정·삭제: sessionContext.lastQuery에서 회차 start_at 보강. masterStart fallback 금지. */
export function inferOriginalStartAt(
  args: Record<string, unknown>,
  sessionContext?: SessionContext,
  userMessage?: string,
): string | undefined {
  const explicit = args.original_start_at ? String(args.original_start_at).trim() : ''
  if (explicit) return explicit

  const targetId = args.id ? String(args.id) : ''
  const events = sessionContext?.lastQuery?.events ?? []
  if (!targetId || events.length === 0) return undefined

  const matches = events.filter((e) => e.id === targetId)
  if (matches.length === 1) return matches[0].start_at

  if (userMessage && matches.length > 1) {
    const narrowed = matches.filter((e) => userMessage.includes(e.title))
    if (narrowed.length === 1) return narrowed[0].start_at
  }

  return undefined
}

export function enrichRecurringOccurrenceArgs(
  args: Record<string, unknown>,
  sessionContext?: SessionContext,
  userMessage?: string,
): Record<string, unknown> {
  const original = inferOriginalStartAt(args, sessionContext, userMessage)
  if (!original) return args
  return { ...args, original_start_at: original }
}
