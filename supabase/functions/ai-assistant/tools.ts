import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DEFAULT_EVENT_CATEGORY, parseCategory } from './categories.ts'
import {
  buildKstCalendarContext,
  getDateWeekdayNumber,
} from './dateRanges.ts'
import {
  applyMutationScheduleSpec,
  type EventTimeSnapshot,
  resolveQuerySchedule,
  resolvedInstantToPayload,
} from './resolveSchedule.ts'
import {
  hasRescheduleIntent,
  hasScheduleFieldChanges,
  sanitizeUpdateArgs,
} from './mutationSafety.ts'
import type { SessionContext } from './scheduleSpec.ts'
import { expandOccurrences, type RecurrenceExceptionRow } from './recurrence.ts'
import type { RecurringUpdateFields } from './recurrenceActions.ts'
import {
  isBlockedRecurringMutation,
  isRecurringCreateArgs,
  RECURRING_MUTATION_BLOCKED_MESSAGE,
} from './recurringPolicy.ts'
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
  const day = getDateWeekdayNumber(event.start_at.slice(0, 10))
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

const SCHEDULE_SPEC_DATE_SCHEMA = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: ['absolute', 'day', 'week', 'month_span', 'year'],
    },
    start_date: { type: 'string' },
    end_date: { type: 'string' },
    day_offset: { type: 'number', description: '0=오늘, 1=내일, 2=모레, 3=글피' },
    week_offset: {
      type: 'number',
      description: '0=이번주, 1=다음주, 2=다다음주, -1=지난주',
    },
    month_offset: { type: 'number', description: '0=이번달, 1=다음달' },
    year_offset: { type: 'number' },
    weekday: {
      type: 'string',
      enum: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    },
  },
  required: ['kind'],
}

const SCHEDULE_SPEC_SCHEMA = {
  type: 'object',
  description:
    '일정 시각(권장). date + time. 예: 내일 저녁 → { date:{ kind:"day", day_offset:1 }, time:{ kind:"time_period", period:"evening" } }',
  properties: {
    date: SCHEDULE_SPEC_DATE_SCHEMA,
    time: {
      type: 'object',
      description:
        'all_day=종일, clock=구체 시각, time_period=저녁 등, preserve=update 시 기존 시각 유지(legacy start_at 필요)',
      properties: {
        kind: {
          type: 'string',
          enum: ['all_day', 'clock', 'time_period', 'preserve'],
        },
        hour: { type: 'number' },
        minute: { type: 'number' },
        period: {
          type: 'string',
          enum: ['dawn', 'morning', 'forenoon', 'daytime', 'afternoon', 'evening', 'night'],
        },
      },
      required: ['kind'],
    },
    duration_minutes: {
      type: 'number',
      description: '시간 일정 기본 60분. end = start + duration',
    },
  },
  required: ['date'],
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'create_event',
    description: '새 일정을 추가합니다.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '일정 제목' },
        schedule_spec: SCHEDULE_SPEC_SCHEMA,
        start_at: {
          type: 'string',
          description: 'legacy. schedule_spec 미사용 시 시작 (ISO 8601 또는 YYYY-MM-DD)',
        },
        end_at: {
          type: 'string',
          description: 'legacy. schedule_spec 미사용 시 종료 (ISO 8601 또는 YYYY-MM-DD)',
        },
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
      required: ['title'],
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
        schedule_spec: SCHEDULE_SPEC_SCHEMA,
        start_at: { type: 'string', description: 'legacy. 일정 이동 시 schedule_spec 권장' },
        end_at: { type: 'string', description: 'legacy' },
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
    description:
      '일정을 조회합니다. 상대 날짜는 schedule_spec을 우선 사용하세요. legacy period/start_date도 호환됩니다.',
    parameters: {
      type: 'object',
      properties: {
        schedule_spec: {
          type: 'object',
          description:
            '날짜 의도(권장). date.kind: absolute|day|week|month_span|year. 예: 다다음주 수요일 → { date: { kind:"week", week_offset:2, weekday:"wed" } }, 내일 → { date: { kind:"day", day_offset:1 } }',
          properties: {
            date: SCHEDULE_SPEC_DATE_SCHEMA,
          },
          required: ['date'],
        },
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
          description: 'legacy. schedule_spec 미사용 시만. 이번 주=this_week(일~토)',
        },
        start_date: { type: 'string', description: 'legacy. 조회 시작일 (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'legacy. 조회 종료일 (YYYY-MM-DD, inclusive)' },
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
        weekday: {
          type: 'string',
          enum: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
          description:
            'legacy. schedule_spec.date.weekday 권장. "수요일 일정" → schedule_spec { kind:week, week_offset:0, weekday:wed }',
        },
        limit: { type: 'number', description: '최대 결과 수 (기본 20)' },
        offset: { type: 'number', description: '건너뛸 개수 (더보기용, 기본 0)' },
      },
    },
  },
  {
    name: 'propose_action',
    description:
      'Use ONLY when the request is ambiguous (unclear target, date, time, or intent). Do NOT execute the real tool. Provide the exact action (name + arguments) to run if the user confirms. The SERVER builds the Korean confirmation message from resolved schedule — do NOT rely on question text matching action. The app shows 맞다/아니다 buttons.',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description:
            'Optional legacy field — ignored by the app. Confirmation text is generated server-side from action.arguments.',
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
      required: ['action'],
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
  referenceIso = new Date().toISOString(),
  existingEvent?: EventTimeSnapshot,
  userMessage?: string,
): RecurringUpdateFields {
  const safe = userMessage !== undefined
    ? sanitizeUpdateArgs(args, userMessage)
    : sanitizeUpdateArgs(args, '')
  const reschedule = hasRescheduleIntent(userMessage ?? '', safe)

  const fields: RecurringUpdateFields = {}
  if (safe.title !== undefined) fields.title = String(safe.title)
  if (safe.description !== undefined) {
    fields.description = safe.description ? String(safe.description) : null
  }
  if (safe.category !== undefined) fields.category = parseCategory(safe.category)

  if (!reschedule) {
    return fields
  }

  const { args: normalized } = applyMutationScheduleSpec(safe, referenceIso, timezone, {
    existingEvent,
    mode: 'update',
    userMessage,
  })

  const hasDateChange =
    normalized.start_at !== undefined || normalized.end_at !== undefined
  const allDay =
    hasDateChange || normalized.all_day !== undefined
      ? inferAllDayFromArgs(normalized)
      : undefined
  if (allDay !== undefined) fields.all_day = allDay

  const effectiveAllDay = allDay ?? false
  if (normalized.start_at !== undefined) {
    fields.start_at = toUtcTimestamp(
      normalized.start_at,
      'start_at',
      timezone,
      effectiveAllDay,
    )
  }
  if (normalized.end_at !== undefined) {
    fields.end_at = toUtcTimestamp(
      normalized.end_at,
      'end_at',
      timezone,
      effectiveAllDay,
    )
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
  options?: { userMessage?: string },
): Promise<{ result: unknown; events: CalendarEvent[] }> {
  switch (name) {
    case 'create_event': {
      if (isRecurringCreateArgs(args)) {
        throw new Error(RECURRING_MUTATION_BLOCKED_MESSAGE)
      }

      const title = String(args.title ?? '').trim()
      if (!title) throw new Error('title is required')

      const { args: normalized, resolved } = applyMutationScheduleSpec(
        args,
        currentDate,
        timezone,
        { mode: 'create', userMessage: options?.userMessage },
      )
      if (!normalized.start_at || !normalized.end_at) {
        throw new Error('schedule_spec or start_at/end_at is required')
      }

      const allDay = inferAllDayFromArgs(normalized)
      const start_at = toUtcTimestamp(normalized.start_at, 'start_at', timezone, allDay)
      const end_at = toUtcTimestamp(normalized.end_at, 'end_at', timezone, allDay)

      const { data, error } = await supabase
        .from('events')
        .insert({
          user_id: userId,
          title,
          start_at,
          end_at,
          all_day: allDay,
          description: normalized.description ? String(normalized.description) : null,
          category: normalized.category
            ? parseCategory(normalized.category)
            : DEFAULT_EVENT_CATEGORY,
          ...recurrencePayload(normalized, timezone),
        })
        .select()
        .single()

      if (error) throw error
      return {
        result: {
          success: true,
          event: data,
          resolved: resolved ? resolvedInstantToPayload(resolved) : null,
        },
        events: [data as CalendarEvent],
      }
    }

    case 'update_event': {
      const id = String(args.id ?? '')
      if (!id) throw new Error('id is required')

      if (await isBlockedRecurringMutation(supabase, 'update_event', args)) {
        throw new Error(RECURRING_MUTATION_BLOCKED_MESSAGE)
      }

      const userMessage = options?.userMessage ?? ''
      const safe = sanitizeUpdateArgs(args, userMessage)
      const reschedule = hasRescheduleIntent(userMessage, safe)

      const { data: existing } = await supabase
        .from('events')
        .select('start_at, end_at, all_day')
        .eq('id', id)
        .maybeSingle()

      const existingEvent: EventTimeSnapshot | undefined = existing
        ? {
            start_at: String(existing.start_at),
            end_at: String(existing.end_at),
            all_day: Boolean(existing.all_day),
          }
        : undefined

      let normalized = safe
      let resolved = null
      if (reschedule) {
        const applied = applyMutationScheduleSpec(safe, currentDate, timezone, {
          existingEvent,
          mode: 'update',
          userMessage,
        })
        normalized = applied.args
        resolved = applied.resolved
      }

      const payload: Record<string, unknown> = {}
      if (normalized.title !== undefined) payload.title = String(normalized.title)
      if (normalized.description !== undefined) {
        payload.description = String(normalized.description)
      }

      if (reschedule) {
        const hasDateChange =
          normalized.start_at !== undefined || normalized.end_at !== undefined
        const allDay =
          hasDateChange || normalized.all_day !== undefined
            ? inferAllDayFromArgs(normalized)
            : undefined

        if (allDay !== undefined) payload.all_day = allDay

        const effectiveAllDay = allDay ?? false
        if (normalized.start_at !== undefined) {
          payload.start_at = toUtcTimestamp(
            normalized.start_at,
            'start_at',
            timezone,
            effectiveAllDay,
          )
        }
        if (normalized.end_at !== undefined) {
          payload.end_at = toUtcTimestamp(
            normalized.end_at,
            'end_at',
            timezone,
            effectiveAllDay,
          )
        }
      }
      if (normalized.category !== undefined) {
        payload.category = parseCategory(normalized.category)
      }

      if (Object.keys(payload).length === 0) {
        throw new Error('No update fields provided')
      }

      const { data, error } = await supabase
        .from('events')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return {
        result: {
          success: true,
          event: data,
          resolved: resolved ? resolvedInstantToPayload(resolved) : null,
        },
        events: [data as CalendarEvent],
      }
    }

    case 'delete_event': {
      const id = String(args.id ?? '')
      if (!id) throw new Error('id is required')

      if (await isBlockedRecurringMutation(supabase, 'delete_event', args)) {
        throw new Error(RECURRING_MUTATION_BLOCKED_MESSAGE)
      }

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
      const queryArgs = { ...args }
      const resolved = resolveQuerySchedule(queryArgs, currentDate, timezone)
      const range = resolved
        ? {
            startDate: resolved.startDate,
            endDate: resolved.endDate,
            startUtc: resolved.startUtc,
            endUtcExclusive: resolved.endUtcExclusive,
            label: resolved.label,
          }
        : null

      const keyword = queryArgs.keyword ? String(queryArgs.keyword) : null
      const timePeriod = queryArgs.time_period ? String(queryArgs.time_period) : null
      const dayType = queryArgs.day_type ? String(queryArgs.day_type) : null
      const limit = typeof queryArgs.limit === 'number' ? queryArgs.limit : QUERY_DEFAULT_LIMIT
      const offset = typeof queryArgs.offset === 'number' ? queryArgs.offset : 0

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

      const resolvedPayload = resolved
        ? {
            resolved_label: resolved.resolved_label,
            resolved_date: resolved.resolved_date,
            weekday_ko: resolved.weekday_ko,
            start_date: resolved.startDate,
            end_date: resolved.endDate,
            granularity: resolved.granularity,
            confidence: resolved.confidence,
          }
        : null

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
          resolved: resolvedPayload,
        },
        events: page,
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

export function buildSystemPrompt(
  currentDate: string,
  timezone: string,
  sessionContext?: SessionContext,
): string {
  const calendarContext = buildKstCalendarContext(currentDate, timezone)

  let sessionBlock = ''
  if (sessionContext?.lastQuery) {
    const { resolved, events } = sessionContext.lastQuery
    const eventLines = events
      .slice(0, 20)
      .map((e) => `  - id=${e.id} title="${e.title}" start_at=${e.start_at}`)
      .join('\n')
    sessionBlock = `
Session context (last query — use for follow-up update/delete):
Resolved: ${resolved.resolved_label}${resolved.weekday_ko ? ` (${resolved.weekday_ko})` : ''} ${resolved.start_date}${resolved.end_date !== resolved.start_date ? ` ~ ${resolved.end_date}` : ''}
Events from last query:
${eventLines || '  (none)'}
- For follow-up like "그거 삭제", use id from this list only. If unclear or multiple matches, use propose_action — never guess.
`
  }

  return `You are a calendar assistant for a schedule management app. Respond in Korean.

${calendarContext}
Reference ISO (UTC): ${currentDate}
Timezone: Always KST (Asia/Seoul).
${sessionBlock}
Rules:
- Use tools to create, update, delete, or query events. Do not invent event data.
- For event queries, prefer query_events.schedule_spec (structured date). Do NOT guess start_date/end_date for relative phrases.
- schedule_spec mapping:
  - 오늘/내일/모레/글피 → date.kind=day, day_offset 0/1/2/3
  - N일 뒤/전 → date.kind=day, day_offset=N (negative for past)
  - 이번 주/다음 주/다다음 주 → date.kind=week, week_offset 0/1/2 (calendar week Sun–Sat)
  - 이번 주 수요일 → week_offset 0 + weekday wed; 다음 주 수요일 → week_offset 1 + weekday wed
  - 이번 달/다음 달 → date.kind=month_span, month_offset 0/1
  - 올해 → date.kind=year, year_offset 0
  - 절대 날짜 → date.kind=absolute, start_date (and end_date if range)
- legacy period/weekday/start_date still work but schedule_spec is preferred.
- Do NOT interpret "이번 주" as "from today for 7 days". Always calendar week (Sunday–Saturday).
- In replies for queries, use ONLY result.resolved (resolved_label, weekday_ko, start_date/end_date) and listed events. Do NOT recalculate weekdays or add speculative footnotes.

Time-of-day filter (query_events.time_period):
- Words map to: 새벽=dawn(01-05), 아침=morning(06-09), 오전=forenoon(00-11), 낮=daytime(06-17), 오후=afternoon(12-23), 저녁=evening(18-20), 밤=night(21-23). "밤" stays same-day (no past midnight).
- If multiple words overlap for one event, the narrowest word wins (dawn → morning → evening → night → daytime → forenoon/afternoon).
- IMPORTANT: If the user gives a concrete clock time (e.g. "9시", "오전 9시", "새벽 9시"), use that exact hour and DO NOT set time_period. A clock time always overrides the time-of-day word ("새벽 9시" means 09:00, not 01-05).
- Weekend/weekday: 주말 → day_type=weekend (Sat/Sun), 평일 → day_type=weekday (Mon-Fri).
- Combine schedule_spec/date + time_period + day_type + keyword as AND.

Create/update schedule (prefer schedule_spec over legacy start_at):
- For create_event and update_event (date/time changes), use schedule_spec with date + time.
- **update_event metadata-only (title/description/category only):** do NOT pass schedule_spec, start_at, or end_at. Phrases like "이번 주 팀회의" identify the target — they are NOT a schedule change.
- **update_event reschedule:** pass schedule_spec with date + time ONLY when moving/rescheduling (옮겨, 미뤄, ~시로 변경). Include time.clock when user gives a specific time.
- date mapping is the same as query schedule_spec.date.
- time.kind: all_day (종일), clock (hour/minute for concrete times), time_period (evening→18:00 KST start, default 60min duration).
- Examples: 「내일 저녁 운동」→ schedule_spec { date:{ kind:"day", day_offset:1 }, time:{ kind:"time_period", period:"evening" } }; 「다음 주 금요일 3시로 옮겨」→ { date:{ kind:"week", week_offset:1, weekday:"fri" }, time:{ kind:"clock", hour:15 } }; 「이번 주 팀회의 제목을 주간회의로」→ update_event { id, title:"주간회의" } only (no schedule_spec).
- After create/update, use result.resolved (resolved_label, time_label, start_at) in replies — do NOT recalculate dates/times.
- legacy start_at/end_at still work for reschedule but schedule_spec is preferred.

Confirmation (V3 target + V2.4 interpret):
- For update/delete, the SERVER runs identifyEvents first. Do NOT ask clarifying questions in chat when candidates exist.
- 0 matches → explain in chat that no event was found; ask for a clearer title or date.
- 6+ matches → explain in chat that too many events matched; ask the user to narrow down.
- 2–5 matches → call update_event/delete_event or propose_action with your best-guess arguments; the app shows a pick-target list (user selects one).
- 1 match → proceed with that event id.
- After target is clear, if date/time interpretation is still ambiguous, use propose_action (맞다/아니다 with server-built message).
- Deletion always requires user confirmation via delete_event tool (app shows Confirm dialog).
- If the request is ambiguous, do NOT additionally ask in chat — use tools so the app can show pick-target or 맞다/아니다.

Recurring events (IMPORTANT):
- You MAY query recurring events (query_events expands occurrences).
- Do NOT create, update, or delete recurring events via tools. If the user asks to add/modify/delete a recurring series or a specific occurrence, reply in Korean that recurring add/edit/delete must be done in the calendar UI — do NOT call create_event with recurrence_freq, update_event, or delete_event on a recurring master id.
- For non-recurring events only: delete_event with id; update_event with id (omit original_start_at).

Other:
- After tool execution, summarize what was done in natural Korean. For queries, summarize the results.
- All datetime values passed to tools use KST wall-clock. Timestamps are stored in the DB as KST wall-clock with a Z suffix; pass KST times directly without timezone conversion.
- Event categories: work (업무), life (일상), appointment (약속). Infer category from context when creating.
- All-day events (종일): all_day=true, date-only values (YYYY-MM-DD), end_at is the last day inclusive.
- Multi-day all-day (e.g. Mon–Thu): all_day=true, start_at=first day, end_at=last day, both date-only.
- Timed events: all_day=false with specific times.
- Do NOT set recurrence_freq on create_event — recurring creation is calendar-only.`
}
