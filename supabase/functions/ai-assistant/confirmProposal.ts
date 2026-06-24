import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enrichToolArgs } from './enrichToolArgs.ts'
import { hasRescheduleIntent, sanitizeUpdateArgs } from './mutationSafety.ts'
import { applyMutationScheduleSpec } from './resolveSchedule.ts'
import type { ResolvedInstant, SessionContext } from './scheduleSpec.ts'

export type PendingTarget = {
  title: string
  start_at: string
  end_at: string
  all_day: boolean
}

async function fetchEventRow(
  supabase: SupabaseClient,
  id: string,
): Promise<PendingTarget | null> {
  if (!id) return null
  const { data } = await supabase
    .from('events')
    .select('title, start_at, end_at, all_day')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  return {
    title: data.title,
    start_at: data.start_at,
    end_at: data.end_at,
    all_day: data.all_day,
  }
}

/** resolved 기반 확인 문장 (LLM question 대신 서버 생성). */
export function buildConfirmationMessage(
  tool: string,
  args: Record<string, unknown>,
  eventTitle: string | null,
  resolved: ResolvedInstant | null,
): string {
  switch (tool) {
    case 'delete_event': {
      const title = eventTitle ?? '일정'
      return `'${title}' 일정을 삭제할까요?`
    }
    case 'create_event': {
      const title = String(args.title ?? '일정')
      if (resolved?.resolved_label) {
        return `'${title}' 일정을 ${resolved.resolved_label}에 추가할까요?`
      }
      return `'${title}' 일정을 추가할까요?`
    }
    case 'update_event': {
      const title = eventTitle ?? String(args.title ?? '일정')
      if (resolved?.resolved_label) {
        return `'${title}'을(를) ${resolved.resolved_label}(으)로 옮길까요?`
      }
      if (args.title !== undefined && eventTitle) {
        return `'${eventTitle}' 제목을 '${String(args.title)}'(으)로 변경할까요?`
      }
      return `'${title}' 일정을 수정할까요?`
    }
    default:
      return '요청을 이렇게 처리할까요?'
  }
}

/** enrich 후 schedule resolve → start_at/end_at 확정, schedule_spec 제거. */
export async function freezePendingMutationArgs(
  supabase: SupabaseClient,
  tool: string,
  enrichedArgs: Record<string, unknown>,
  userMessage: string,
  referenceIso: string,
  timezone: string,
): Promise<{ args: Record<string, unknown>; resolved: ResolvedInstant | null }> {
  if (tool === 'create_event') {
    const applied = applyMutationScheduleSpec(enrichedArgs, referenceIso, timezone, {
      mode: 'create',
      userMessage,
    })
    if (!applied.resolved) {
      return { args: { ...enrichedArgs, _v24Frozen: true }, resolved: null }
    }
    const frozen: Record<string, unknown> = {
      ...applied.args,
      _v24Frozen: true,
    }
    delete frozen.schedule_spec
    return { args: frozen, resolved: applied.resolved }
  }

  if (tool === 'update_event') {
    const safe = sanitizeUpdateArgs(enrichedArgs, userMessage)
    const reschedule = hasRescheduleIntent(userMessage, safe)

    if (!reschedule) {
      return { args: { ...safe, _v24Frozen: true }, resolved: null }
    }

    const id = String(safe.id ?? '')
    const { data: existing } = await supabase
      .from('events')
      .select('start_at, end_at, all_day')
      .eq('id', id)
      .maybeSingle()

    const existingEvent = existing
      ? {
          start_at: String(existing.start_at),
          end_at: String(existing.end_at),
          all_day: Boolean(existing.all_day),
        }
      : undefined

    const applied = applyMutationScheduleSpec(safe, referenceIso, timezone, {
      existingEvent,
      mode: 'update',
      userMessage,
    })

    if (!applied.resolved) {
      return { args: { ...safe, _v24Frozen: true }, resolved: null }
    }

    const frozen: Record<string, unknown> = {
      ...applied.args,
      _v24Frozen: true,
    }
    delete frozen.schedule_spec
    return { args: frozen, resolved: applied.resolved }
  }

  return { args: { ...enrichedArgs, _v24Frozen: true }, resolved: null }
}

/** propose_action: enrich → freeze → 서버 확인 문장. */
export async function prepareAmbiguousPending(
  supabase: SupabaseClient,
  tool: string,
  rawArgs: Record<string, unknown>,
  userMessage: string,
  sessionContext: SessionContext | undefined,
  referenceIso: string,
  timezone: string,
): Promise<{
  pendingAction: { tool: string; arguments: Record<string, unknown> }
  message: string
  target: PendingTarget | null
}> {
  const enriched = enrichToolArgs(tool, rawArgs, userMessage, sessionContext)
  const { args: frozen, resolved } = await freezePendingMutationArgs(
    supabase,
    tool,
    enriched,
    userMessage,
    referenceIso,
    timezone,
  )

  const eventId = String(frozen.id ?? '')
  const target = tool === 'update_event' || tool === 'delete_event'
    ? await fetchEventRow(supabase, eventId)
    : null

  const message = buildConfirmationMessage(
    tool,
    frozen,
    target?.title ?? null,
    resolved,
  )

  return {
    pendingAction: { tool, arguments: frozen },
    message,
    target,
  }
}
