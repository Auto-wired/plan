import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DEFAULT_EVENT_CATEGORY, parseCategory } from './categories.ts'
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
    description: '일정을 조회합니다.',
    parameters: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: '조회 시작일 (ISO 8601)' },
        end_date: { type: 'string', description: '조회 종료일 (ISO 8601)' },
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

/** 사용자 로컬 벽시계 → UTC ISO */
function toUtcTimestamp(
  value: unknown,
  field: string,
  timezone: string,
  allDay = false,
): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a valid ISO 8601 date string`)
  }

  const parts = parseWallClock(value)
  const wallClock = allDay || !value.includes('T')
    ? `${parts.year}-${parts.month}-${parts.day}T00:00:00`
    : `${parts.year}-${parts.month}-${parts.day}T${pad2(Number(parts.hour))}:${pad2(Number(parts.minute))}:${pad2(Number(parts.second))}`

  const utcDate = zonedTimeToUtc(wallClock, timezone)
  return utcDate.toISOString()
}

function zonedTimeToUtc(wallClock: string, timezone: string): Date {
  const [datePart, timePart = '00:00:00'] = wallClock.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute, second = 0] = timePart.split(':').map(Number)

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  for (let offset = -16; offset <= 16; offset++) {
    const candidate = new Date(utcGuess + offset * 60 * 60 * 1000)
    const formatted = formatter.format(candidate).replace(', ', 'T')
    const normalized = formatted.length === 16 ? `${formatted}:00` : formatted
    if (normalized === wallClock || normalized.startsWith(wallClock.slice(0, 16))) {
      return candidate
    }
  }

  return new Date(utcGuess)
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

      if (args.start_date) {
        query = query.gte('start_at', toUtcTimestamp(args.start_date, 'start_date', timezone, true))
      }
      if (args.end_date) {
        query = query.lte('end_at', toUtcTimestamp(args.end_date, 'end_date', timezone, true))
      }
      if (args.keyword) {
        const keyword = String(args.keyword)
        query = query.or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%`)
      }

      const limit = typeof args.limit === 'number' ? args.limit : 20
      query = query.limit(limit)

      const { data, error } = await query
      if (error) throw error
      return { result: { count: data?.length ?? 0, events: data }, events: (data ?? []) as CalendarEvent[] }
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
- Parse relative dates ("tomorrow", "next Monday", "내일", "다음 주") using the current date and timezone.
- If the request is ambiguous (missing time, title, or target event), ask a clarifying question instead of calling tools.
- For update/delete, if multiple events match, query first and ask the user to confirm which one.
- After tool execution, summarize what was done in natural Korean.
- For queries, provide a helpful summary of the results.
- All datetime values passed to tools should use the user's local wall-clock in ${timezone}.
- Timestamps are stored in the database as UTC. Provide local times in tool arguments.
- Event categories: work (업무), life (일상), appointment (약속). Infer category from context when creating events.
- All-day events (종일): set all_day=true and use date-only values (YYYY-MM-DD). end_at is the last day inclusive.
- Multi-day all-day (e.g. Mon–Thu): all_day=true, start_at=first day, end_at=last day, both date-only.
- Timed events: set all_day=false and include specific times.
- Recurring events: use recurrence_freq (daily/weekly/monthly/yearly), optional recurrence_interval, recurrence_count, recurrence_until.`
}
