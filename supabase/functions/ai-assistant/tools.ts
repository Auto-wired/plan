import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DEFAULT_EVENT_CATEGORY, parseCategory } from './categories.ts'
import { resolveEventQueryRange } from './dateRanges.ts'
import { expandOccurrences, type RecurrenceExceptionRow } from './recurrence.ts'
import type { RecurringUpdateFields } from './recurrenceActions.ts'
import type { ToolDefinition } from './providers/types.ts'
import type { EventCategory } from './categories.ts'

export const QUERY_DEFAULT_LIMIT = 20

/** 시간대 단어 → 시작 시각(KST, 시 단위 포함 범위). 저장값이 KST 벽시계를 Z로 두므로 getUTCHours = KST 시. */
const TIME_PERIOD_HOURS: Record<string, [number, number]> = {
  dawn: [1, 5], // 새벽
  morning: [6, 9], // 아침
  forenoon: [0, 11], // 오전
  daytime: [6, 17], // 낮
  afternoon: [12, 23], // 오후
  evening: [18, 20], // 저녁
  night: [21, 23], // 밤
}

function matchesTimePeriod(event: CalendarEvent, period: string): boolean {
  if (event.all_day) return true // 종일 일정은 시간대 필터와 무관하게 포함
  const bounds = TIME_PERIOD_HOURS[period]
  if (!bounds) return true
  const hour = new Date(event.start_at).getUTCHours()
  return hour >= bounds[0] && hour <= bounds[1]
}

function matchesDayType(event: CalendarEvent, dayType: string): boolean {
  const day = new Date(event.start_at).getUTCDay() // 0=일 .. 6=토 (KST)
  const isWeekend = day === 0 || day === 6
  return dayType === 'weekend' ? isWeekend : !isWeekend
}

function matchesKeyword(event: CalendarEvent, keyword: string): boolean {
  const k = keyword.toLowerCase()
  return (
    event.title.toLowerCase().includes(k) ||
    (event.description ?? '').toLowerCase().includes(k)
  )
}

export interface CalendarEvent {
  id: string
  user_id: string
  title: string
  description: string | null
  start_at: string
  end_at: string
  all_day: boolean
  category: EventCategory
  recurrence_freq: string | null
  recurrence_interval: number
  recurrence_count: number | null
  recurrence_until: string | null
}

const CATEGORY_DESCRIPTION =
  '일정 카테고리: work(업무), life(일상), appointment(약속)'

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'create_event',
    description: '새 일정을 추가합니다.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '일정 제목' },
        start_at: { type: 'string', description: '시작 시간 (ISO 8601 또는 YYYY-MM-DD)' },
        end_at: { type: 'string', description: '종료 시간 (ISO 8601 또는 YYYY-MM-DD)' },
        all_day: { type: 'boolean', description: '종일 일정 여부' },
        description: { type: 'string', description: '일정 설명' },
        category: {
          type: 'string',
          enum: ['work', 'life', 'appointment'],
          description: CATEGORY_DESCRIPTION,
        },
        recurrence_freq: {
          type: 'string',
          enum: ['daily', 'weekly', 'monthly', 'yearly'],
          description: '반복 주기',
        },
        recurrence_interval: { type: 'number', description: '반복 간격 (기본 1)' },
        recurrence_count: { type: 'number', description: '반복 횟수' },
        recurrence_until: { type: 'string', description: '반복 종료일 (YYYY-MM-DD)' },
      },
      required: ['title', 'start_at', 'end_at'],
    },
  },
  {
    name: 'update_event',
    description: '기존 일정을 수정합니다.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '일정 ID (반복이면 마스터 ID)' },
        original_start_at: {
          type: 'string',
          description:
            '반복 일정의 특정 회차를 수정할 때 그 회차의 시작 시각(조회 결과의 start_at). 반복이 아니면 생략.',
        },
        title: { type: 'string', description: '일정 제목' },
        start_at: { type: 'string', description: '시작 시간 (ISO 8601)' },
        end_at: { type: 'string', description: '종료 시간 (ISO 8601)' },
        all_day: { type: 'boolean', description: '종일 일정 여부' },
        description: { type: 'string', description: '일정 설명' },
        category: {
          type: 'string',
          enum: ['work', 'life', 'appointment'],
          description: CATEGORY_DESCRIPTION,
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_event',
    description: '일정을 삭제합니다.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '삭제할 일정 ID (반복이면 마스터 ID)' },
        original_start_at: {
          type: 'string',
          description:
            '반복 일정의 특정 회차를 삭제할 때 그 회차의 시작 시각(조회 결과의 start_at). 반복이 아니면 생략.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'query_events',
    description: '일정을 조회합니다. 상대 기간(이번 주, 이번 달 등)은 period를 우선 사용하세요.',
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: [
            'today',
            'yesterday',
            'tomorrow',
            'this_week',
            'next_week',
            'last_week',
            'this_month',
            'next_month',
            'last_month',
            'this_year',
          ],
          description:
            '상대 기간. 이번 주=this_week(일요일~토요일), 이번 달=this_month, 오늘=today 등',
        },
        start_date: { type: 'string', description: '조회 시작일 (YYYY-MM-DD). period 미사용 시' },
        end_date: { type: 'string', description: '조회 종료일 (YYYY-MM-DD, inclusive). period 미사용 시' },
        keyword: { type: 'string', description: '제목/설명 검색 키워드' },
        time_period: {
          type: 'string',
          enum: ['dawn', 'morning', 'forenoon', 'daytime', 'afternoon', 'evening', 'night'],
          description:
            '시간대 단어(KST). 새벽=dawn(1-5시), 아침=morning(6-9시), 오전=forenoon(0-11시), 낮=daytime(6-17시), 오후=afternoon(12-23시), 저녁=evening(18-20시), 밤=night(21-23시). 겹치면 가장 좁은 단어 1개만. 구체적 시각(예: 9시)이 있으면 time_period 대신 그 시각을 쓰고 time_period는 비운다.',
        },
        day_type: {
          type: 'string',
          enum: ['weekend', 'weekday'],
          description: '주말(토·일)=weekend, 평일(월~금)=weekday',
        },
        limit: { type: 'number', description: '최대 결과 수 (기본 20)' },
        offset: { type: 'number', description: '건너뛸 개수 (더보기용, 기본 0)' },
      },
    },
  },
  {
    name: 'propose_action',
    description:
      'Use ONLY when the request is ambiguous (unclear target, date, time, or intent). Do NOT execute the real tool. Instead propose your best-guess interpretation as a Korean question and provide the exact action to run if the user confirms. The app shows the user 맞다/아니다 buttons.',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: '사용자에게 보여줄 확인 질문(한국어). 추측한 해석을 설명한다.',
        },
        action: {
          type: 'object',
          description: '사용자가 "맞다"를 누르면 실행할 도구와 인자',
          properties: {
            name: {
              type: 'string',
              enum: ['create_event', 'update_event', 'delete_event'],
            },
            arguments: { type: 'object', description: '해당 도구에 전달할 인자' },
          },
          required: ['name', 'arguments'],
        },
      },
      required: ['question', 'action'],
    },
  },
]

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function hasExplicitTime(value: string): boolean {
  const match = value.trim().match(/T(\d{2}):(\d{2})/)
  if (!match) return false
  return !(match[1] === '00' && match[2] === '00')
}

function inferAllDayFromArgs(args: Record<string, unknown>): boolean {
  if (args.all_day !== undefined) return Boolean(args.all_day)

  const start = args.start_at ? String(args.start_at) : ''
  const end = args.end_at ? String(args.end_at) : ''

  if (hasExplicitTime(start) || hasExplicitTime(end)) return false
  if (start || end) return true

  return false
}

function parseWallClock(value: string): {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
} {
  const match = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/)

  if (!match) {
    throw new Error('must be a valid ISO 8601 date string')
  }

  return {
    year: match[1],
    month: match[2],
    day: match[3],
    hour: match[4] ?? '00',
    minute: match[5] ?? '00',
    second: match[6] ?? '00',
  }
}

/** 사용자 입력 벽시계(KST) → DB ISO (보정 없이 Z만 붙임) */
function toUtcTimestamp(
  value: unknown,
  field: string,
  _timezone: string,
  allDay = false,
): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a valid ISO 8601 date string`)
  }

  const parts = parseWallClock(value)
  const wallClock = allDay || !value.includes('T')
    ? `${parts.year}-${parts.month}-${parts.day}T00:00:00`
    : `${parts.year}-${parts.month}-${parts.day}T${pad2(Number(parts.hour))}:${pad2(Number(parts.minute))}:${pad2(Number(parts.second))}`

  return `${wallClock}.000Z`
}

function recurrencePayload(args: Record<string, unknown>, timezone: string) {
  const freq = args.recurrence_freq ? String(args.recurrence_freq) : null
  if (!freq) {
    return {
      recurrence_freq: null,
      recurrence_interval: 1,
      recurrence_count: null,
      recurrence_until: null,
    }
  }

  return {
    recurrence_freq: freq,
    recurrence_interval:
      typeof args.recurrence_interval === 'number' ? args.recurrence_interval : 1,
    recurrence_count:
      typeof args.recurrence_count === 'number' ? args.recurrence_count : null,
    recurrence_until: args.recurrence_until
      ? toUtcTimestamp(
          `${String(args.recurrence_until).slice(0, 10)}T23:59:59`,
          'recurrence_until',
          timezone,
          false,
        )
      : null,
  }
}

/** update_event 인자 → 정규화된 수정 필드(반복 범위 수정에서 공용). */
export function buildUpdateFields(
  args: Record<string, unknown>,
  timezone: string,
): RecurringUpdateFields {
  const fields: RecurringUpdateFields = {}
  if (args.title !== undefined) fields.title = String(args.title)
  if (args.description !== undefined) {
    fields.description = args.description ? String(args.description) : null
  }
  if (args.category !== undefined) fields.category = parseCategory(args.category)

  const hasDateChange = args.start_at !== undefined || args.end_at !== undefined
  const allDay =
    hasDateChange || args.all_day !== undefined ? inferAllDayFromArgs(args) : undefined
  if (allDay !== undefined) fields.all_day = allDay

  const effectiveAllDay = allDay ?? false
  if (args.start_at !== undefined) {
    fields.start_at = toUtcTimestamp(args.start_at, 'start_at', timezone, effectiveAllDay)
  }
  if (args.end_at !== undefined) {
    fields.end_at = toUtcTimestamp(args.end_at, 'end_at', timezone, effectiveAllDay)
  }
  return fields
}

export async function executeTool(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  args: Record<string, unknown>,
  timezone = 'UTC',
  currentDate = new Date().toISOString(),
): Promise<{ result: unknown; events: CalendarEvent[] }> {
  switch (name) {
    case 'create_event': {
      const title = String(args.title ?? '').trim()
      if (!title) throw new Error('title is required')

      const allDay = inferAllDayFromArgs(args)
      const start_at = toUtcTimestamp(args.start_at, 'start_at', timezone, allDay)
      const end_at = toUtcTimestamp(args.end_at, 'end_at', timezone, allDay)

      const { data, error } = await supabase
        .from('events')
        .insert({
          user_id: userId,
          title,
          start_at,
          end_at,
          all_day: allDay,
          description: args.description ? String(args.description) : null,
          category: args.category ? parseCategory(args.category) : DEFAULT_EVENT_CATEGORY,
          ...recurrencePayload(args, timezone),
        })
        .select()
        .single()

      if (error) throw error
      return { result: { success: true, event: data }, events: [data as CalendarEvent] }
    }

    case 'update_event': {
      const id = String(args.id ?? '')
      if (!id) throw new Error('id is required')

      const payload: Record<string, unknown> = {}
      if (args.title !== undefined) payload.title = String(args.title)
      if (args.description !== undefined) payload.description = String(args.description)

      const hasDateChange = args.start_at !== undefined || args.end_at !== undefined
      const allDay = hasDateChange || args.all_day !== undefined
        ? inferAllDayFromArgs(args)
        : undefined

      if (allDay !== undefined) payload.all_day = allDay

      const effectiveAllDay = allDay ?? false
      if (args.start_at !== undefined) {
        payload.start_at = toUtcTimestamp(args.start_at, 'start_at', timezone, effectiveAllDay)
      }
      if (args.end_at !== undefined) {
        payload.end_at = toUtcTimestamp(args.end_at, 'end_at', timezone, effectiveAllDay)
      }
      if (args.category !== undefined) payload.category = parseCategory(args.category)

      const { data, error } = await supabase
        .from('events')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return { result: { success: true, event: data }, events: [data as CalendarEvent] }
    }

    case 'delete_event': {
      const id = String(args.id ?? '')
      if (!id) throw new Error('id is required')

      // 삭제 전 스냅샷 확보 (상단 목록 비활성 표시용)
      const { data: existing } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      const { error } = await supabase.from('events').delete().eq('id', id)
      if (error) throw error

      return {
        result: { success: true, deletedId: id, event: existing ?? null },
        events: existing ? [existing as CalendarEvent] : [],
      }
    }

    case 'query_events': {
      const range = resolveEventQueryRange(args, currentDate, timezone)
      const keyword = args.keyword ? String(args.keyword) : null
      const timePeriod = args.time_period ? String(args.time_period) : null
      const dayType = args.day_type ? String(args.day_type) : null
      const limit = typeof args.limit === 'number' ? args.limit : QUERY_DEFAULT_LIMIT
      const offset = typeof args.offset === 'number' ? args.offset : 0

      // 1) 비반복 일정: 범위 겹침으로 직접 조회
      let singlesQuery = supabase.from('events').select('*').is('recurrence_freq', null)
      if (range) {
        singlesQuery = singlesQuery
          .lt('start_at', range.endUtcExclusive)
          .gte('end_at', range.startUtc)
      }
      if (keyword) {
        singlesQuery = singlesQuery.or(
          `title.ilike.%${keyword}%,description.ilike.%${keyword}%`,
        )
      }
      const { data: singles, error: singlesError } = await singlesQuery
      if (singlesError) throw singlesError

      // 2) 반복 마스터: 회차 전개로 처리
      let mastersQuery = supabase.from('events').select('*').not('recurrence_freq', 'is', null)
      if (range) {
        mastersQuery = mastersQuery
          .lt('start_at', range.endUtcExclusive)
          .or(`recurrence_until.is.null,recurrence_until.gte.${range.startUtc}`)
      }
      if (keyword) {
        mastersQuery = mastersQuery.or(
          `title.ilike.%${keyword}%,description.ilike.%${keyword}%`,
        )
      }
      const { data: masters, error: mastersError } = await mastersQuery
      if (mastersError) throw mastersError

      const expandStart = range ? new Date(range.startUtc) : new Date(currentDate)
      const expandEnd = range
        ? new Date(range.endUtcExclusive)
        : new Date(new Date(currentDate).getTime() + 366 * 24 * 60 * 60 * 1000)

      // 제외 목록
      const masterIds = (masters ?? []).map((m) => m.id)
      const exceptionsByMaster: Record<string, RecurrenceExceptionRow[]> = {}
      if (masterIds.length) {
        const { data: exRows } = await supabase
          .from('event_recurrence_exceptions')
          .select('event_id, original_start_at')
          .in('event_id', masterIds)
        for (const row of exRows ?? []) {
          ;(exceptionsByMaster[row.event_id] ??= []).push({
            original_start_at: row.original_start_at,
          })
        }
      }

      const expanded: CalendarEvent[] = []
      for (const master of (masters ?? []) as CalendarEvent[]) {
        expanded.push(
          ...expandOccurrences(
            master,
            exceptionsByMaster[master.id] ?? [],
            expandStart,
            expandEnd,
          ),
        )
      }

      // 3) 병합 + 코드 측 필터(시간대·요일·키워드 일관 적용)
      let all = [...((singles ?? []) as CalendarEvent[]), ...expanded]
      if (keyword) all = all.filter((e) => matchesKeyword(e, keyword))
      if (timePeriod) all = all.filter((e) => matchesTimePeriod(e, timePeriod))
      if (dayType) all = all.filter((e) => matchesDayType(e, dayType))

      // 정렬 + 중복 제거(반복 회차는 id 공유 → id+start_at 키)
      all.sort((a, b) => (a.start_at < b.start_at ? -1 : a.start_at > b.start_at ? 1 : 0))
      const seen = new Set<string>()
      all = all.filter((e) => {
        const key = `${e.id}|${e.start_at}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      const total = all.length
      const page = all.slice(offset, offset + limit)

      return {
        result: {
          count: page.length,
          total,
          offset,
          limit,
          hasMore: offset + page.length < total,
          events: page,
          range: range
            ? { label: range.label, start_date: range.startDate, end_date: range.endDate }
            : null,
        },
        events: page,
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

export function buildSystemPrompt(currentDate: string, timezone: string): string {
  return `You are a calendar assistant for a schedule management app. Respond in Korean.

Current date/time: ${currentDate}
Timezone: Always KST (Asia/Seoul). Interpret every date/time as KST.

Rules:
- Use tools to create, update, delete, or query events. Do not invent event data.
- For event queries with relative ranges, prefer query_events.period instead of guessing start_date/end_date.
- Period mapping: "이번 주"/"이번주" → this_week (Sunday–Saturday), "이번 달" → this_month (1st–last day), "오늘" → today, "내일" → tomorrow, "다음 주" → next_week, "지난 주" → last_week, "다음 달" → next_month, "지난 달" → last_month, "올해" → this_year.
- Do NOT interpret "이번 주" as "from today for 7 days". Always use the calendar week (Sunday through Saturday).
- Do NOT interpret "이번 달" as "from today to month end". Always use the full calendar month.
- For absolute date ranges, pass start_date and end_date as YYYY-MM-DD (inclusive on both ends).
- Date defaults: if the year is omitted, use the current year. If the month is omitted (e.g. "30일"), use the current month.
- Parse other relative dates ("다음 주 월요일") using the current date in KST.

Time-of-day filter (query_events.time_period):
- Words map to: 새벽=dawn(01-05), 아침=morning(06-09), 오전=forenoon(00-11), 낮=daytime(06-17), 오후=afternoon(12-23), 저녁=evening(18-20), 밤=night(21-23). "밤" stays same-day (no past midnight).
- If multiple words overlap for one event, the narrowest word wins (dawn → morning → evening → night → daytime → forenoon/afternoon).
- IMPORTANT: If the user gives a concrete clock time (e.g. "9시", "오전 9시", "새벽 9시"), use that exact hour and DO NOT set time_period. A clock time always overrides the time-of-day word ("새벽 9시" means 09:00, not 01-05).
- Weekend/weekday: 주말 → day_type=weekend (Sat/Sun), 평일 → day_type=weekday (Mon-Fri).
- Combine period/date + time_period + day_type + keyword as AND.

Confirmation:
- Deletion always requires user confirmation. To delete, call delete_event with the target id (query first to find the id if needed). The app shows a confirm dialog and runs the deletion only after the user agrees — so do NOT additionally ask "삭제할까요?" in text.
- If the request is ambiguous (unclear target, date, time, or intent), do NOT call create_event/update_event/delete_event directly. Instead call propose_action with a Korean question and your best-guess action; the user will confirm with 맞다/아니다.
- For update/delete, if multiple events match, query first; if still ambiguous which one, use propose_action.
- Adding events and clearly-specified updates do NOT need confirmation — just call the tool.

Recurring update/delete:
- To update or delete a specific occurrence of a recurring event, pass id = the master id AND original_start_at = that occurrence's start_at (from query results). The app will ask the user to choose 「해당 일정만」 or 「전체 일정」 — you do NOT decide the scope.
- For non-recurring events, just pass id (omit original_start_at).

Other:
- After tool execution, summarize what was done in natural Korean. For queries, summarize the results.
- All datetime values passed to tools use KST wall-clock. Timestamps are stored in the DB as KST wall-clock with a Z suffix; pass KST times directly without timezone conversion.
- Event categories: work (업무), life (일상), appointment (약속). Infer category from context when creating.
- All-day events (종일): all_day=true, date-only values (YYYY-MM-DD), end_at is the last day inclusive.
- Multi-day all-day (e.g. Mon–Thu): all_day=true, start_at=first day, end_at=last day, both date-only.
- Timed events: all_day=false with specific times.
- Recurring events: recurrence_freq (daily/weekly/monthly/yearly), optional recurrence_interval, recurrence_count, recurrence_until.`
}
