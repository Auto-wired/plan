import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { inferScheduleSpecFromMessage } from './enrichToolArgs.ts'
import { resolveQuerySchedule } from './resolveSchedule.ts'
import type { SessionContext } from './scheduleSpec.ts'

/** pick-target UI에 표시할 최대 후보 수 */
export const PICK_TARGET_MAX = 5

/** identify 조회 상한 (6건 이상이면 too_many) */
export const IDENTIFY_FETCH_LIMIT = 6

export type IdentifyTier = 'none' | 'single' | 'pick' | 'too_many'

export interface IdentifyCandidate {
  id: string
  title: string
  start_at: string
  end_at: string
  all_day: boolean
}

export interface IdentifyResult {
  tier: IdentifyTier
  candidates: IdentifyCandidate[]
  keyword: string | null
}

const STRIP_FOR_KEYWORD =
  /옮겨|옮기|옮길|미루|미뤄|연기|삭제|삭제해|추가|추가해|변경|수정|해줘|해주|주세요|일정|으로|로|을|를|이|가|은|는|좀|그거|그것|해당|말한|말씀|this|week|today|tomorrow/gi

const WEEKDAY_KO =
  /일요일|월요일|화요일|수요일|목요일|금요일|토요일|일|월|화|수|목|금|토/g

const DATE_PHRASES =
  /다다음\s*주|다음\s*주|지난\s*주|이번\s*주|이번\s*달|다음\s*달|지난\s*달|올해|금년|모레|글피|내일|어제|오늘|\d+\s*월|\d+\s*일|\d+\s*시/gi

/** 사용자 메시지에서 일정 검색 키워드 추출 (휴리스틱). */
export function extractSearchKeyword(userMessage: string): string | null {
  let s = userMessage
  s = s.replace(DATE_PHRASES, ' ')
  s = s.replace(WEEKDAY_KO, ' ')
  s = s.replace(STRIP_FOR_KEYWORD, ' ')
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ')
  const tokens = s.split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2)
  if (tokens.length === 0) return null
  return tokens.sort((a, b) => b.length - a.length)[0] ?? null
}

function toCandidate(row: {
  id: string
  title: string
  start_at: string
  end_at: string
  all_day: boolean
}): IdentifyCandidate {
  return {
    id: row.id,
    title: row.title,
    start_at: row.start_at,
    end_at: row.end_at,
    all_day: row.all_day,
  }
}

function tierFromCount(count: number): IdentifyTier {
  if (count === 0) return 'none'
  if (count === 1) return 'single'
  if (count <= PICK_TARGET_MAX) return 'pick'
  return 'too_many'
}

function dedupeById(rows: IdentifyCandidate[]): IdentifyCandidate[] {
  const seen = new Set<string>()
  const out: IdentifyCandidate[] = []
  for (const row of rows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  return out
}

/** 후속 「그거」 등: sessionContext.lastQuery 이벤트 id 목록. */
function candidatesFromSession(sessionContext?: SessionContext): string[] | null {
  if (!sessionContext?.lastQuery?.events?.length) return null
  const unique = new Set<string>()
  for (const e of sessionContext.lastQuery.events) {
    unique.add(e.id)
  }
  return [...unique]
}

function isFollowUpPronoun(message: string): boolean {
  return /그\s*(거|것)|해당\s*일정|방금\s*(그|조회)/.test(message)
}

/**
 * mutation 대상 식별 (비반복 일정만 — AI mutation 대상).
 * 반복 마스터는 제외(recurringPolicy).
 */
export async function identifyEventsForMutation(
  supabase: SupabaseClient,
  userMessage: string,
  referenceIso: string,
  timezone: string,
  sessionContext?: SessionContext,
): Promise<IdentifyResult> {
  let idsFilter: string[] | null = null
  if (isFollowUpPronoun(userMessage)) {
    idsFilter = candidatesFromSession(sessionContext)
    if (idsFilter?.length === 0) idsFilter = null
  }

  const keyword = extractSearchKeyword(userMessage)

  if (idsFilter?.length) {
    const { data } = await supabase
      .from('events')
      .select('id, title, start_at, end_at, all_day, recurrence_freq')
      .in('id', idsFilter)
      .is('recurrence_freq', null)
      .limit(IDENTIFY_FETCH_LIMIT)

    const candidates = dedupeById((data ?? []).map(toCandidate))
    return { tier: tierFromCount(candidates.length), candidates, keyword }
  }

  if (!keyword) {
    return { tier: 'none', candidates: [], keyword: null }
  }

  const inferred = inferScheduleSpecFromMessage(userMessage)
  const queryArgs: Record<string, unknown> = inferred ? { schedule_spec: inferred } : {}
  const resolved = resolveQuerySchedule(queryArgs, referenceIso, timezone)
  const range = resolved
    ? {
        startUtc: resolved.startUtc,
        endUtcExclusive: resolved.endUtcExclusive,
      }
    : null

  let query = supabase
    .from('events')
    .select('id, title, start_at, end_at, all_day, recurrence_freq')
    .is('recurrence_freq', null)
    .or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%`)

  if (range) {
    query = query
      .lt('start_at', range.endUtcExclusive)
      .gte('end_at', range.startUtc)
  }

  const { data } = await query.limit(IDENTIFY_FETCH_LIMIT)

  const candidates = dedupeById((data ?? []).map(toCandidate))
  return { tier: tierFromCount(candidates.length), candidates, keyword }
}

export const IDENTIFY_MESSAGES = {
  none: '일치하는 일정을 찾지 못했습니다. 일정 제목이나 날짜를 더 구체적으로 알려 주세요.',
  tooMany: (keyword: string) =>
    `'${keyword}'(으)로 찾은 일정이 너무 많습니다. 제목·날짜·시간을 더 구체적으로 알려 주세요.`,
  pickPrompt: '어떤 일정을 말씀하셨나요? 아래에서 선택해 주세요.',
} as const
