import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DEFAULT_EVENT_CATEGORY, parseCategory } from './categories.ts'
import { resolveEventQueryRange } from './dateRanges.ts'
import type { ToolDefinition } from './providers/types.ts'
import type { EventCategory } from './categories.ts'

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
        id: { type: 'string', description: '일정 ID' },
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
        id: { type: 'string', description: '삭제할 일정 ID' },
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
        limit: { type: 'number', description: '최대 결과 수' },
      },
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

      const { error } = await supabase.from('events').delete().eq('id', id)
      if (error) throw error
      return { result: { success: true, deletedId: id }, events: [] }
    }

    case 'query_events': {
      let query = supabase.from('events').select('*').order('start_at', { ascending: true })

      const range = resolveEventQueryRange(args, currentDate, timezone)
      if (range) {
        query = query
          .lt('start_at', range.endUtcExclusive)
          .gte('end_at', range.startUtc)
      }

      if (args.keyword) {
        const keyword = String(args.keyword)
        query = query.or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%`)
      }

      const limit = typeof args.limit === 'number' ? args.limit : 100
      query = query.limit(limit)

      const { data, error } = await query
      if (error) throw error
      return {
        result: {
          count: data?.length ?? 0,
          events: data,
          range: range
            ? {
                label: range.label,
                start_date: range.startDate,
                end_date: range.endDate,
              }
            : null,
        },
        events: (data ?? []) as CalendarEvent[],
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

export function buildSystemPrompt(currentDate: string, timezone: string): string {
  return `You are a calendar assistant for a schedule management app. Respond in Korean.

Current date/time: ${currentDate}
User timezone: ${timezone}

Rules:
- Use tools to create, update, delete, or query events. Do not invent event data.
- For event queries with relative ranges, prefer query_events.period instead of guessing start_date/end_date.
- Period mapping: "이번 주"/"이번주" → this_week (Sunday–Saturday, includes already-ended days in the week), "이번 달" → this_month (1st–last day), "오늘" → today, "내일" → tomorrow, "다음 주" → next_week, "지난 주" → last_week, "다음 달" → next_month, "지난 달" → last_month, "올해" → this_year.
- Do NOT interpret "이번 주" as "from today for 7 days". Always use the calendar week (Sunday through Saturday).
- Do NOT interpret "이번 달" as "from today to month end". Always use the full calendar month.
- For absolute date ranges, pass start_date and end_date as YYYY-MM-DD (inclusive on both ends).
- Parse other relative dates ("next Monday", "다음 주 월요일") using the current date and timezone.
- If the request is ambiguous (missing time, title, or target event), ask a clarifying question instead of calling tools.
- For update/delete, if multiple events match, query first and ask the user to confirm which one.
- After tool execution, summarize what was done in natural Korean.
- For queries, provide a helpful summary of the results.
- All datetime values passed to tools should use the user's local wall-clock in ${timezone}.
- Timestamps are stored in the database as KST wall-clock values with a Z suffix. Pass KST times directly in tool arguments without timezone conversion.
- Event categories: work (업무), life (일상), appointment (약속). Infer category from context when creating events.
- All-day events (종일): set all_day=true and use date-only values (YYYY-MM-DD). end_at is the last day inclusive.
- Multi-day all-day (e.g. Mon–Thu): all_day=true, start_at=first day, end_at=last day, both date-only.
- Timed events: set all_day=false and include specific times.
- Recurring events: use recurrence_freq (daily/weekly/monthly/yearly), optional recurrence_interval, recurrence_count, recurrence_until.`
}
