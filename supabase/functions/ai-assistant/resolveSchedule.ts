import {
  addDaysToDateString,
  finalizeDateRange,
  formatKoreanWeekday,
  getLocalDateString,
  normalizeQueryPeriod,
  normalizeQueryWeekday,
  resolveQueryPeriod,
  type QueryPeriod,
} from './dateRanges.ts'
import type {
  DateSpec,
  QueryWeekday,
  ResolveConfidence,
  ResolvedInstant,
  ResolvedSchedule,
  ScheduleSpec,
  TimeSpec,
} from './scheduleSpec.ts'

const DEFAULT_DURATION_MINUTES = 60

/** time_period → default start hour (KST wall clock). */
export const TIME_PERIOD_DEFAULT_START: Record<string, number> = {
  dawn: 1,
  morning: 6,
  forenoon: 9,
  daytime: 9,
  afternoon: 12,
  evening: 18,
  night: 21,
}

const TIME_PERIOD_KO: Record<string, string> = {
  dawn: '새벽',
  morning: '아침',
  forenoon: '오전',
  daytime: '낮',
  afternoon: '오후',
  evening: '저녁',
  night: '밤',
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatWallClockIso(dateStr: string, hour: number, minute: number): string {
  return `${dateStr}T${pad2(hour)}:${pad2(minute)}:00.000Z`
}

function addMinutesToWallClock(iso: string, minutes: number): string {
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/)
  if (!match) throw new Error(`Invalid wall clock: ${iso}`)
  const base = new Date(
    Date.UTC(Number(match[1].slice(0, 4)), Number(match[1].slice(5, 7)) - 1, Number(match[1].slice(8, 10)),
      Number(match[2]), Number(match[3])),
  )
  const end = new Date(base.getTime() + minutes * 60 * 1000)
  return `${match[1]}T${pad2(end.getUTCHours())}:${pad2(end.getUTCMinutes())}:00.000Z`
}

export function parseTimeSpec(raw: unknown): TimeSpec | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const kind = o.kind
  if (kind === 'all_day') return { kind: 'all_day' }
  if (kind === 'preserve') return { kind: 'preserve' }
  if (typeof o.hour === 'number' && (kind === 'clock' || kind === undefined)) {
    return { kind: 'clock', hour: o.hour, minute: typeof o.minute === 'number' ? o.minute : 0 }
  }
  if (kind === 'time_period' && o.period) {
    return { kind: 'time_period', period: String(o.period) }
  }
  return null
}

const WEEKDAY_KO: Record<QueryWeekday, string> = {
  sun: '일요일',
  mon: '월요일',
  tue: '화요일',
  wed: '수요일',
  thu: '목요일',
  fri: '금요일',
  sat: '토요일',
}

const PERIOD_TO_WEEK_OFFSET: Partial<Record<QueryPeriod, number>> = {
  this_week: 0,
  next_week: 1,
  last_week: -1,
}

const PERIOD_TO_DAY_OFFSET: Partial<Record<QueryPeriod, number>> = {
  today: 0,
  tomorrow: 1,
  yesterday: -1,
}

const PERIOD_TO_MONTH_OFFSET: Partial<Record<QueryPeriod, number>> = {
  this_month: 0,
  next_month: 1,
  last_month: -1,
}

function periodToDateSpec(period: QueryPeriod, weekday?: QueryWeekday): DateSpec {
  if (period in PERIOD_TO_DAY_OFFSET) {
    return { kind: 'day', day_offset: PERIOD_TO_DAY_OFFSET[period]! }
  }
  if (period in PERIOD_TO_WEEK_OFFSET) {
    return {
      kind: 'week',
      week_offset: PERIOD_TO_WEEK_OFFSET[period]!,
      weekday,
    }
  }
  if (period in PERIOD_TO_MONTH_OFFSET) {
    return { kind: 'month_span', month_offset: PERIOD_TO_MONTH_OFFSET[period]! }
  }
  if (period === 'this_year') {
    return { kind: 'year', year_offset: 0 }
  }
  throw new Error(`Unsupported period: ${period}`)
}

function weekdayToDayNumber(weekday: QueryWeekday): number {
  const map: Record<QueryWeekday, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  }
  return map[weekday]
}

function getDateWeekdayNumber(dateStr: string): number {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) throw new Error(`Invalid date: ${dateStr}`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

function pickWeekdayInRange(
  startDate: string,
  endDate: string,
  weekday: QueryWeekday,
): string | null {
  const target = weekdayToDayNumber(weekday)
  let cursor = startDate
  while (cursor <= endDate) {
    if (getDateWeekdayNumber(cursor) === target) return cursor
    cursor = addDaysToDateString(cursor, 1)
  }
  return null
}

function monthOffsetToRange(
  monthOffset: number,
  referenceIso: string,
  timezone: string,
): { startDate: string; endDate: string; label: string } {
  const period: QueryPeriod =
    monthOffset === 0 ? 'this_month' : monthOffset === 1 ? 'next_month' : 'last_month'
  const resolved = resolveQueryPeriod(period, referenceIso, timezone)
  return {
    startDate: resolved.startDate,
    endDate: resolved.endDate,
    label: resolved.label,
  }
}

function buildResolvedMetadata(
  spec: DateSpec,
  startDate: string,
  endDate: string,
  label: string,
  confidence: ResolveConfidence,
): Omit<ResolvedSchedule, 'startUtc' | 'endUtcExclusive'> {
  const isSingleDay = startDate === endDate
  const weekday_ko = isSingleDay ? formatKoreanWeekday(startDate) : undefined
  const resolved_date = isSingleDay ? startDate : undefined

  let resolved_label = label
  if (spec.kind === 'week' && spec.weekday) {
    const weekLabel =
      spec.week_offset === 0
        ? '이번 주'
        : spec.week_offset === 1
          ? '다음 주'
          : spec.week_offset === -1
            ? '지난 주'
            : spec.week_offset === 2
              ? '다다음 주'
              : `${spec.week_offset}주 후`
    resolved_label = `${weekLabel} ${WEEKDAY_KO[spec.weekday]}`
  } else if (spec.kind === 'day') {
    if (spec.day_offset === 0) resolved_label = '오늘'
    else if (spec.day_offset === 1) resolved_label = '내일'
    else if (spec.day_offset === 2) resolved_label = '모레'
    else if (spec.day_offset === 3) resolved_label = '글피'
    else if (spec.day_offset === -1) resolved_label = '어제'
    else if (spec.day_offset < 0) resolved_label = `${-spec.day_offset}일 전`
    else resolved_label = `${spec.day_offset}일 후`
  }

  return {
    startDate,
    endDate,
    label,
    resolved_label,
    resolved_date,
    weekday_ko,
    granularity: isSingleDay ? 'day' : 'range',
    confidence,
  }
}

export function parseDateSpec(raw: unknown): DateSpec | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const kind = o.kind
  if (typeof kind !== 'string') return null

  switch (kind) {
    case 'absolute': {
      const start = o.start_date ? String(o.start_date).slice(0, 10) : null
      if (!start) return null
      const end = o.end_date ? String(o.end_date).slice(0, 10) : undefined
      return {
        kind: 'absolute',
        start_date: start,
        end_date: end,
        label: o.label ? String(o.label) : undefined,
      }
    }
    case 'day':
      if (typeof o.day_offset !== 'number') return null
      return { kind: 'day', day_offset: o.day_offset }
    case 'week': {
      if (typeof o.week_offset !== 'number') return null
      const wd = o.weekday ? normalizeQueryWeekday(String(o.weekday)) : undefined
      return { kind: 'week', week_offset: o.week_offset, weekday: wd ?? undefined }
    }
    case 'month_span':
      if (typeof o.month_offset !== 'number') return null
      return { kind: 'month_span', month_offset: o.month_offset }
    case 'year':
      if (typeof o.year_offset !== 'number') return null
      return { kind: 'year', year_offset: o.year_offset }
    default:
      return null
  }
}

export function parseScheduleSpec(raw: unknown): ScheduleSpec | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const date = parseDateSpec(o.date ?? o)
  if (!date) return null
  const time = o.time ? parseTimeSpec(o.time) : undefined
  const duration_minutes =
    typeof o.duration_minutes === 'number' ? o.duration_minutes : undefined
  return { date, time, duration_minutes }
}

export function legacyArgsToDateSpec(args: Record<string, unknown>): {
  spec: DateSpec | null
  confidence: ResolveConfidence
} {
  const scheduleSpec = args.schedule_spec ? parseScheduleSpec(args.schedule_spec) : null
  if (scheduleSpec) {
    return { spec: scheduleSpec.date, confidence: 'high' }
  }

  const weekdayRaw = args.weekday ? String(args.weekday) : null
  const weekday = weekdayRaw ? normalizeQueryWeekday(weekdayRaw) : undefined
  if (weekdayRaw && !weekday) {
    throw new Error(`Unknown weekday: ${weekdayRaw}`)
  }

  if (args.period) {
    const period = normalizeQueryPeriod(String(args.period))
    if (!period) throw new Error(`Unknown period: ${args.period}`)
    return { spec: periodToDateSpec(period, weekday), confidence: 'medium' }
  }

  const startDate = args.start_date ? String(args.start_date).slice(0, 10) : null
  const endDate = args.end_date ? String(args.end_date).slice(0, 10) : null
  if (startDate || endDate) {
    return {
      spec: {
        kind: 'absolute',
        start_date: startDate ?? endDate!,
        end_date: endDate ?? startDate!,
      },
      confidence: 'medium',
    }
  }

  if (weekday) {
    return {
      spec: { kind: 'week', week_offset: 0, weekday },
      confidence: 'medium',
    }
  }

  return { spec: null, confidence: 'low' }
}

function timeSpecFromLegacyStartAt(startAt: string): TimeSpec {
  const match = startAt.trim().match(/T(\d{2}):(\d{2})/)
  if (!match) return { kind: 'all_day' }
  if (match[1] === '00' && match[2] === '00') return { kind: 'all_day' }
  return { kind: 'clock', hour: Number(match[1]), minute: Number(match[2]) }
}

export type EventTimeSnapshot = {
  start_at: string
  end_at: string
  all_day: boolean
}

export function durationMinutesFromSnapshot(s: EventTimeSnapshot): number {
  if (s.all_day) return DEFAULT_DURATION_MINUTES
  const sm = s.start_at.match(/T(\d{2}):(\d{2})/)
  const em = s.end_at.match(/T(\d{2}):(\d{2})/)
  if (!sm || !em) return DEFAULT_DURATION_MINUTES
  if (sm[1] === '00' && sm[2] === '00') return DEFAULT_DURATION_MINUTES
  const startM = Number(sm[1]) * 60 + Number(sm[2])
  const endM = Number(em[1]) * 60 + Number(em[2])
  if (endM > startM) return endM - startM
  return DEFAULT_DURATION_MINUTES
}

export function timeSpecFromSnapshot(s: EventTimeSnapshot): TimeSpec {
  if (s.all_day) return { kind: 'all_day' }
  return timeSpecFromLegacyStartAt(s.start_at)
}

/** 반복 confirm 경로: 마스터 + original_start_at → 회차 시각 스냅샷. */
export function occurrenceTimeSnapshot(
  master: EventTimeSnapshot,
  originalStartAt?: string,
): EventTimeSnapshot {
  if (!originalStartAt) return master
  const dateStr = originalStartAt.slice(0, 10)
  if (master.all_day) {
    return {
      start_at: `${dateStr}T00:00:00.000Z`,
      end_at: `${dateStr}T00:00:00.000Z`,
      all_day: true,
    }
  }
  const dur = durationMinutesFromSnapshot(master)
  const occTime = timeSpecFromLegacyStartAt(originalStartAt)
  if (occTime.kind === 'clock') {
    const start_at = formatWallClockIso(dateStr, occTime.hour, occTime.minute ?? 0)
    return {
      start_at,
      end_at: addMinutesToWallClock(start_at, dur),
      all_day: false,
    }
  }
  return {
    start_at: originalStartAt,
    end_at: addMinutesToWallClock(originalStartAt, dur),
    all_day: false,
  }
}

/** 사용자 메시지에서 시각·시간대 단어 추론 (mutation enrich). */
export function inferTimeSpecFromMessage(message: string): TimeSpec | null {
  const periodPatterns: Array<{ re: RegExp; period: string }> = [
    { re: /새벽/, period: 'dawn' },
    { re: /아침/, period: 'morning' },
    { re: /(?:^|\s)오전(?!\s*\d)/, period: 'forenoon' },
    { re: /(?:^|\s)낮/, period: 'daytime' },
    { re: /(?:^|\s)오후(?!\s*\d)/, period: 'afternoon' },
    { re: /저녁/, period: 'evening' },
    { re: /(?:^|\s)밤/, period: 'night' },
  ]
  for (const { re, period } of periodPatterns) {
    if (re.test(message)) return { kind: 'time_period', period }
  }

  const ampm = message.match(/(오전|오후)\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/)
  if (ampm) {
    let hour = Number(ampm[2])
    const minute = ampm[3] ? Number(ampm[3]) : 0
    if (ampm[1] === '오후' && hour < 12) hour += 12
    if (ampm[1] === '오전' && hour === 12) hour = 0
    return { kind: 'clock', hour, minute }
  }

  const plain = message.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/)
  if (plain) {
    let hour = Number(plain[1])
    const minute = plain[2] ? Number(plain[2]) : 0
    // 일정 맥락: 1~6시 → 오후(+12), 7~11·12 → 그대로
    if (hour >= 1 && hour <= 6) hour += 12
    return { kind: 'clock', hour, minute }
  }

  return null
}

function enrichSpecWithTimeFallback(
  spec: ScheduleSpec,
  options: { existing?: EventTimeSnapshot; mode: 'create' | 'update' },
  userMessage?: string,
): ScheduleSpec {
  if (spec.time) return spec

  const fromMsg = userMessage ? inferTimeSpecFromMessage(userMessage) : null
  if (fromMsg) {
    return {
      ...spec,
      time: fromMsg,
      duration_minutes: spec.duration_minutes ?? DEFAULT_DURATION_MINUTES,
    }
  }

  if (options.mode === 'update' && options.existing) {
    return {
      ...spec,
      time: timeSpecFromSnapshot(options.existing),
      duration_minutes: durationMinutesFromSnapshot(options.existing),
    }
  }

  return spec
}

/** create/update: schedule_spec에 time 누락 시 메시지에서 보강. */
export function enrichMutationScheduleArgs(
  args: Record<string, unknown>,
  userMessage: string,
): Record<string, unknown> {
  if (!args.schedule_spec) return args
  const parsed = parseScheduleSpec(args.schedule_spec)
  if (!parsed || parsed.time) return args

  const time = inferTimeSpecFromMessage(userMessage)
  if (!time) return args

  const raw = args.schedule_spec as Record<string, unknown>
  return {
    ...args,
    schedule_spec: { ...raw, time },
  }
}

/** create/update: schedule_spec or legacy start_at/end_at → ScheduleSpec. */
export function legacyMutationToScheduleSpec(
  args: Record<string, unknown>,
): { spec: ScheduleSpec | null; confidence: ResolveConfidence } {
  const parsed = args.schedule_spec ? parseScheduleSpec(args.schedule_spec) : null
  if (parsed) {
    return { spec: parsed, confidence: 'high' }
  }

  const startRaw = args.start_at ? String(args.start_at) : null
  if (!startRaw) {
    return { spec: null, confidence: 'low' }
  }

  const startDate = startRaw.slice(0, 10)
  const endRaw = args.end_at ? String(args.end_at) : null
  const endDate = endRaw ? endRaw.slice(0, 10) : startDate
  const time = timeSpecFromLegacyStartAt(startRaw)

  let duration_minutes: number | undefined
  if (time?.kind === 'clock' && endRaw?.includes('T')) {
    const em = endRaw.match(/T(\d{2}):(\d{2})/)
    if (em && !(em[1] === '00' && em[2] === '00')) {
      const startM = time.hour * 60 + (time.minute ?? 0)
      const endM = Number(em[1]) * 60 + Number(em[2])
      if (endM > startM) duration_minutes = endM - startM
    }
  }

  return {
    spec: {
      date: {
        kind: 'absolute',
        start_date: startDate,
        end_date: endDate !== startDate ? endDate : undefined,
      },
      time,
      duration_minutes,
    },
    confidence: 'medium',
  }
}

function resolveTimeOnDate(
  dateStr: string,
  time: TimeSpec | undefined,
  durationMinutes: number,
): { start_at: string; end_at: string; all_day: boolean; time_label?: string } {
  if (!time || time.kind === 'all_day') {
    return {
      start_at: `${dateStr}T00:00:00.000Z`,
      end_at: `${dateStr}T00:00:00.000Z`,
      all_day: true,
    }
  }
  if (time.kind === 'preserve') {
    throw new Error('time.kind=preserve is only valid for updates with explicit start_at')
  }

  let hour: number
  let minute = 0
  let time_label: string | undefined

  if (time.kind === 'clock') {
    hour = time.hour
    minute = time.minute ?? 0
    time_label = `${pad2(hour)}:${pad2(minute)}`
  } else {
    hour = TIME_PERIOD_DEFAULT_START[time.period] ?? 9
    time_label = TIME_PERIOD_KO[time.period] ?? time.period
  }

  const start_at = formatWallClockIso(dateStr, hour, minute)
  const end_at = addMinutesToWallClock(start_at, durationMinutes)
  return { start_at, end_at, all_day: false, time_label }
}

export function resolveInstantSchedule(
  spec: ScheduleSpec,
  referenceIso: string,
  timezone: string,
  confidence: ResolveConfidence,
): ResolvedInstant {
  if (spec.time?.kind === 'preserve') {
    throw new Error('schedule_spec.time.preserve requires legacy start_at')
  }

  const { startDate, endDate } = resolveDateSpec(spec.date, referenceIso, timezone)
  const duration = spec.duration_minutes ?? DEFAULT_DURATION_MINUTES
  const rangeMeta = buildResolvedMetadata(spec.date, startDate, endDate, startDate, confidence)

  const isMultiDay = endDate > startDate
  const wantsAllDay = !spec.time || spec.time.kind === 'all_day' || isMultiDay

  if (wantsAllDay) {
    return {
      start_at: `${startDate}T00:00:00.000Z`,
      end_at: `${endDate}T00:00:00.000Z`,
      all_day: true,
      resolved_label: rangeMeta.resolved_label,
      resolved_date: rangeMeta.resolved_date,
      weekday_ko: rangeMeta.weekday_ko,
      time_label: '종일',
      confidence,
    }
  }

  const { start_at, end_at, all_day, time_label } = resolveTimeOnDate(
    startDate,
    spec.time,
    duration,
  )

  let resolved_label = rangeMeta.resolved_label
  if (time_label) {
    resolved_label = `${rangeMeta.resolved_label} ${time_label}`
  }

  return {
    start_at,
    end_at,
    all_day,
    resolved_label,
    resolved_date: rangeMeta.resolved_date,
    weekday_ko: rangeMeta.weekday_ko,
    time_label,
    confidence,
  }
}

export function resolveMutationSchedule(
  args: Record<string, unknown>,
  referenceIso: string,
  timezone: string,
  options?: {
    existingEvent?: EventTimeSnapshot
    mode?: 'create' | 'update'
    userMessage?: string
  },
): ResolvedInstant | null {
  const mode = options?.mode ?? (args.id ? 'update' : 'create')
  let { spec, confidence } = legacyMutationToScheduleSpec(args)
  if (!spec) return null
  if (spec.time?.kind === 'preserve') return null

  spec = enrichSpecWithTimeFallback(
    spec,
    { existing: options?.existingEvent, mode },
    options?.userMessage,
  )

  return resolveInstantSchedule(spec, referenceIso, timezone, confidence)
}

/** Merge schedule_spec into create/update args (start_at, end_at, all_day). */
export function applyMutationScheduleSpec(
  args: Record<string, unknown>,
  referenceIso: string,
  timezone: string,
  options?: {
    existingEvent?: EventTimeSnapshot
    mode?: 'create' | 'update'
    userMessage?: string
  },
): { args: Record<string, unknown>; resolved: ResolvedInstant | null } {
  const resolved = resolveMutationSchedule(args, referenceIso, timezone, options)
  if (!resolved) {
    return { args, resolved: null }
  }

  return {
    args: {
      ...args,
      start_at: resolved.start_at,
      end_at: resolved.end_at,
      all_day: resolved.all_day,
    },
    resolved,
  }
}

export function resolvedInstantToPayload(resolved: ResolvedInstant) {
  return {
    resolved_label: resolved.resolved_label,
    resolved_date: resolved.resolved_date,
    weekday_ko: resolved.weekday_ko,
    time_label: resolved.time_label,
    start_at: resolved.start_at,
    end_at: resolved.end_at,
    all_day: resolved.all_day,
    confidence: resolved.confidence,
  }
}

export function resolveDateSpec(
  spec: DateSpec,
  referenceIso: string,
  timezone: string,
): { startDate: string; endDate: string; label: string } {
  const today = getLocalDateString(referenceIso, timezone)

  switch (spec.kind) {
    case 'absolute': {
      const end = spec.end_date ?? spec.start_date
      const label = spec.label ?? `${spec.start_date} ~ ${end}`
      return { startDate: spec.start_date, endDate: end, label }
    }
    case 'day': {
      const date = addDaysToDateString(today, spec.day_offset)
      return { startDate: date, endDate: date, label: date }
    }
    case 'week': {
      const thisWeek = resolveQueryPeriod('this_week', referenceIso, timezone)
      const weekStart = addDaysToDateString(thisWeek.startDate, spec.week_offset * 7)
      const weekEnd = addDaysToDateString(weekStart, 6)
      if (spec.weekday) {
        const day = pickWeekdayInRange(weekStart, weekEnd, spec.weekday)
        if (!day) throw new Error(`No ${spec.weekday} in week starting ${weekStart}`)
        return { startDate: day, endDate: day, label: day }
      }
      const weekLabel =
        spec.week_offset === 0
          ? '이번 주'
          : spec.week_offset === 1
            ? '다음 주'
            : spec.week_offset === -1
              ? '지난 주'
              : `${spec.week_offset}주`
      return { startDate: weekStart, endDate: weekEnd, label: weekLabel }
    }
    case 'month_span': {
      const { startDate, endDate, label } = monthOffsetToRange(
        spec.month_offset,
        referenceIso,
        timezone,
      )
      return { startDate, endDate, label }
    }
    case 'year': {
      if (spec.year_offset !== 0) {
        throw new Error(`Unsupported year_offset: ${spec.year_offset}`)
      }
      const resolved = resolveQueryPeriod('this_year', referenceIso, timezone)
      return {
        startDate: resolved.startDate,
        endDate: resolved.endDate,
        label: resolved.label,
      }
    }
    default:
      throw new Error(`Unsupported DateSpec kind: ${(spec as DateSpec).kind satisfies never}`)
  }
}

export function resolveSchedule(
  spec: DateSpec,
  referenceIso: string,
  timezone: string,
  confidence: ResolveConfidence,
): ResolvedSchedule {
  const { startDate, endDate, label } = resolveDateSpec(spec, referenceIso, timezone)
  const range = finalizeDateRange(startDate, endDate, timezone, label)
  const meta = buildResolvedMetadata(spec, startDate, endDate, label, confidence)
  return {
    ...meta,
    startUtc: range.startUtc,
    endUtcExclusive: range.endUtcExclusive,
  }
}

export function resolveQuerySchedule(
  args: Record<string, unknown>,
  referenceIso: string,
  timezone: string,
): ResolvedSchedule | null {
  const { spec, confidence } = legacyArgsToDateSpec(args)
  if (!spec) return null
  return resolveSchedule(spec, referenceIso, timezone, confidence)
}

export function canonicalQueryArgsForPagination(
  args: Record<string, unknown>,
  resolved: ResolvedSchedule | null,
): Record<string, unknown> {
  let start_date: string | undefined
  let end_date: string | undefined

  if (resolved) {
    start_date = resolved.startDate
    end_date = resolved.endDate
  } else if (args.start_date || args.end_date) {
    start_date = args.start_date ? String(args.start_date).slice(0, 10) : undefined
    end_date = args.end_date ? String(args.end_date).slice(0, 10) : undefined
    if (start_date && !end_date) end_date = start_date
    if (end_date && !start_date) start_date = end_date
  }

  const canonical: Record<string, unknown> = {}
  if (start_date && end_date) {
    canonical.start_date = start_date
    canonical.end_date = end_date
  }
  if (args.keyword) canonical.keyword = args.keyword
  if (args.time_period) canonical.time_period = args.time_period
  if (args.day_type) canonical.day_type = args.day_type
  if (typeof args.limit === 'number') canonical.limit = args.limit
  return canonical
}

export function resolvedToSessionLastQuery(resolved: ResolvedSchedule) {
  return {
    resolved_label: resolved.resolved_label,
    resolved_date: resolved.resolved_date,
    weekday_ko: resolved.weekday_ko,
    start_date: resolved.startDate,
    end_date: resolved.endDate,
  }
}
