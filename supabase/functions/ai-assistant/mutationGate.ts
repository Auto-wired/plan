import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { prepareAmbiguousPending, type PendingTarget } from './confirmProposal.ts'
import {
  IDENTIFY_MESSAGES,
  type IdentifyCandidate,
  identifyEventsForMutation,
} from './identifyEvents.ts'
import { hasRescheduleIntent, sanitizeUpdateArgs } from './mutationSafety.ts'
import type { SessionContext } from './scheduleSpec.ts'

const MUTATION_TOOLS = new Set(['update_event', 'delete_event'])

export type MutationGateResult =
  | { kind: 'proceed'; args: Record<string, unknown> }
  | {
      kind: 'pick-target'
      candidates: IdentifyCandidate[]
      pendingIntent: { tool: string; arguments: Record<string, unknown> }
      message: string
    }
  | { kind: 'chat'; message: string }

function stripIdFromArgs(args: Record<string, unknown>): Record<string, unknown> {
  const { id: _, ...rest } = args
  return rest
}

/** update/delete mutation 전 대상 식별 gate (V3). */
export async function gateMutationTarget(
  supabase: SupabaseClient,
  tool: string,
  args: Record<string, unknown>,
  userMessage: string,
  referenceIso: string,
  timezone: string,
  sessionContext?: SessionContext,
): Promise<MutationGateResult> {
  if (!MUTATION_TOOLS.has(tool)) {
    return { kind: 'proceed', args }
  }

  const identified = await identifyEventsForMutation(
    supabase,
    userMessage,
    referenceIso,
    timezone,
    sessionContext,
  )

  switch (identified.tier) {
    case 'none':
      return { kind: 'chat', message: IDENTIFY_MESSAGES.none }
    case 'too_many':
      return {
        kind: 'chat',
        message: IDENTIFY_MESSAGES.tooMany(identified.keyword ?? '검색어'),
      }
    case 'single': {
      const id = identified.candidates[0]!.id
      return { kind: 'proceed', args: { ...args, id } }
    }
    case 'pick':
      return {
        kind: 'pick-target',
        candidates: identified.candidates,
        pendingIntent: {
          tool,
          arguments: stripIdFromArgs(args),
        },
        message: IDENTIFY_MESSAGES.pickPrompt,
      }
  }
}

export type AfterPickResult =
  | {
      kind: 'pending'
      pendingConfirmation: {
        kind: 'delete' | 'ambiguous'
        message: string
        pendingAction: { tool: string; arguments: Record<string, unknown> }
        target: PendingTarget | null
        triggerUserMessage: string
      }
    }
  | {
      kind: 'executed'
      tool: string
      result: unknown
      events: Array<{
        id: string
        title: string
        start_at: string
        end_at: string
        all_day: boolean
      }>
    }

/** pick-target 선택 후: 삭제 Confirm / 해석 propose / 즉시 실행 분기. */
export async function continueAfterPickTarget(
  supabase: SupabaseClient,
  userId: string,
  tool: string,
  args: Record<string, unknown>,
  userMessage: string,
  sessionContext: SessionContext | undefined,
  referenceIso: string,
  timezone: string,
  options: { fromPropose: boolean },
  executeToolFn: (
    tool: string,
    args: Record<string, unknown>,
    userMessage: string,
  ) => Promise<{ result: unknown; events: AfterPickResult['events'] }>,
): Promise<AfterPickResult> {
  const merged = { ...args }

  if (tool === 'delete_event') {
    const { data: row } = await supabase
      .from('events')
      .select('title, start_at, end_at, all_day')
      .eq('id', String(merged.id ?? ''))
      .maybeSingle()
    const target = row
      ? {
          title: row.title,
          start_at: row.start_at,
          end_at: row.end_at,
          all_day: row.all_day,
        }
      : null
    return {
      kind: 'pending',
      pendingConfirmation: {
        kind: 'delete',
        message: target ? `'${target.title}' 일정을 삭제할까요?` : '이 일정을 삭제할까요?',
        pendingAction: { tool: 'delete_event', arguments: merged },
        target,
        triggerUserMessage: userMessage,
      },
    }
  }

  if (tool === 'update_event') {
    const safe = sanitizeUpdateArgs(merged, userMessage)
    const reschedule = hasRescheduleIntent(userMessage, safe)
    const needsPropose = options.fromPropose || reschedule

    if (needsPropose) {
      const prepared = await prepareAmbiguousPending(
        supabase,
        tool,
        safe,
        userMessage,
        sessionContext,
        referenceIso,
        timezone,
      )
      return {
        kind: 'pending',
        pendingConfirmation: {
          kind: 'ambiguous',
          message: prepared.message,
          pendingAction: prepared.pendingAction,
          target: prepared.target,
          triggerUserMessage: userMessage,
        },
      }
    }

    const executed = await executeToolFn(tool, safe, userMessage)
    return {
      kind: 'executed',
      tool,
      result: executed.result,
      events: executed.events,
    }
  }

  const executed = await executeToolFn(tool, merged, userMessage)
  return {
    kind: 'executed',
    tool,
    result: executed.result,
    events: executed.events,
  }
}
