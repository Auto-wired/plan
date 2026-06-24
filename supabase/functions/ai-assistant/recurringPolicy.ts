import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** AI 어시스턴트 반복 mutation 차단 안내 (조회는 허용). */
export const RECURRING_MUTATION_BLOCKED_MESSAGE =
  '반복 일정의 추가·수정·삭제는 현재 AI 어시스턴트에서 지원하지 않습니다. 달력에서 변경해 주세요. 반복 일정 조회는 가능합니다.'

export function isRecurringCreateArgs(args: Record<string, unknown>): boolean {
  const freq = args.recurrence_freq
  return freq !== undefined && freq !== null && String(freq).trim() !== ''
}

export function isRecurringMaster(row: { recurrence_freq?: string | null } | null): boolean {
  return !!row?.recurrence_freq
}

/** confirm / propose_action 실행 전 반복 mutation 차단 여부. */
export async function isBlockedRecurringMutation(
  supabase: SupabaseClient,
  tool: string,
  args: Record<string, unknown>,
): Promise<boolean> {
  if (tool === 'create_event') {
    return isRecurringCreateArgs(args)
  }

  if (tool === 'update_event' || tool === 'delete_event') {
    const id = String(args.id ?? '')
    if (!id) return false
    const { data } = await supabase.from('events').select('recurrence_freq').eq('id', id).maybeSingle()
    return isRecurringMaster(data)
  }

  return false
}
