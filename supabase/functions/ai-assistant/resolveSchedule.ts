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
  ResolvedSchedule,
  ScheduleSpec,
} from './scheduleSpec.ts'

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
  return { date }
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
