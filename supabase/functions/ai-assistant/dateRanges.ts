export type QueryPeriod =
  | 'today'
  | 'yesterday'
  | 'tomorrow'
  | 'this_week'
  | 'next_week'
  | 'last_week'
  | 'this_month'
  | 'next_month'
  | 'last_month'
  | 'this_year'

const PERIOD_ALIASES: Record<string, QueryPeriod> = {
  today: 'today',
  오늘: 'today',
  yesterday: 'yesterday',
  어제: 'yesterday',
  tomorrow: 'tomorrow',
  내일: 'tomorrow',
  this_week: 'this_week',
  이번주: 'this_week',
  '이번 주': 'this_week',
  next_week: 'next_week',
  다음주: 'next_week',
  '다음 주': 'next_week',
  last_week: 'last_week',
  지난주: 'last_week',
  '지난 주': 'last_week',
  this_month: 'this_month',
  이번달: 'this_month',
  '이번 달': 'this_month',
  next_month: 'next_month',
  다음달: 'next_month',
  '다음 달': 'next_month',
  last_month: 'last_month',
  지난달: 'last_month',
  '지난 달': 'last_month',
  this_year: 'this_year',
  올해: 'this_year',
  금년: 'this_year',
}

export function normalizeQueryPeriod(value: string): QueryPeriod | null {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ')
  return PERIOD_ALIASES[normalized] ?? PERIOD_ALIASES[value.trim()] ?? null
}

export type QueryWeekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

const WEEKDAY_KO = [
  '일요일',
  '월요일',
  '화요일',
  '수요일',
  '목요일',
  '금요일',
  '토요일',
] as const

const WEEKDAY_ALIASES: Record<string, QueryWeekday> = {
  sun: 'sun',
  sunday: 'sun',
  일: 'sun',
  일요일: 'sun',
  mon: 'mon',
  monday: 'mon',
  월: 'mon',
  월요일: 'mon',
  tue: 'tue',
  tuesday: 'tue',
  화: 'tue',
  화요일: 'tue',
  wed: 'wed',
  wednesday: 'wed',
  수: 'wed',
  수요일: 'wed',
  thu: 'thu',
  thursday: 'thu',
  목: 'thu',
  목요일: 'thu',
  fri: 'fri',
  friday: 'fri',
  금: 'fri',
  금요일: 'fri',
  sat: 'sat',
  saturday: 'sat',
  토: 'sat',
  토요일: 'sat',
}

export function normalizeQueryWeekday(value: string): QueryWeekday | null {
  const trimmed = value.trim()
  const lower = trimmed.toLowerCase()
  return WEEKDAY_ALIASES[lower] ?? WEEKDAY_ALIASES[trimmed] ?? null
}

export function weekdayToDayNumber(weekday: QueryWeekday): number {
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

/** YYYY-MM-DD → 0=일 … 6=토 (KST 날짜 부분 기준) */
export function getDateWeekdayNumber(dateStr: string): number {
  return getLocalDayOfWeek(dateStr.slice(0, 10), 'UTC')
}

export function formatKoreanWeekday(dateStr: string): string {
  return WEEKDAY_KO[getDateWeekdayNumber(dateStr.slice(0, 10))]
}

export function buildKstCalendarContext(referenceIso: string, timezone: string): string {
  const today = getLocalDateString(referenceIso, timezone)
  const tomorrow = addDaysToDateString(today, 1)
  const thisWeek = resolveQueryPeriod('this_week', referenceIso, timezone)

  const lines = [
    `Today (KST): ${today} (${formatKoreanWeekday(today)})`,
    `Tomorrow (KST): ${tomorrow} (${formatKoreanWeekday(tomorrow)})`,
    `This calendar week (Sun–Sat, KST): ${thisWeek.startDate} ~ ${thisWeek.endDate}`,
    'Days this week (KST):',
  ]

  for (let i = 0; i < 7; i++) {
    const date = addDaysToDateString(thisWeek.startDate, i)
    lines.push(`  ${date}: ${formatKoreanWeekday(date)}`)
  }

  return lines.join('\n')
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function parseDateParts(dateStr: string): { year: number; month: number; day: number } {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    throw new Error(`Invalid date: ${dateStr}`)
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const { year, month, day } = parseDateParts(dateStr)
  const utc = new Date(Date.UTC(year, month - 1, day + days))
  return formatDateParts(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate())
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function getLocalDateString(iso: string, timezone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${iso}`)
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error(`Failed to format date in timezone ${timezone}`)
  }

  return `${year}-${month}-${day}`
}

function getLocalDayOfWeek(dateStr: string, _timezone: string): number {
  const { year, month, day } = parseDateParts(dateStr)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
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

export function localDateToUtcStart(dateStr: string, _timezone: string): string {
  return `${dateStr}T00:00:00.000Z`
}

export function localDateToUtcEndExclusive(dateStr: string, _timezone: string): string {
  return `${addDaysToDateString(dateStr, 1)}T00:00:00.000Z`
}

export interface ResolvedDateRange {
  startDate: string
  endDate: string
  startUtc: string
  endUtcExclusive: string
  label: string
}

export function resolveQueryPeriod(
  period: QueryPeriod,
  referenceIso: string,
  timezone: string,
): ResolvedDateRange {
  const today = getLocalDateString(referenceIso, timezone)

  switch (period) {
    case 'today':
      return finalizeDateRange(today, today, timezone, '오늘')
    case 'yesterday': {
      const date = addDaysToDateString(today, -1)
      return finalizeDateRange(date, date, timezone, '어제')
    }
    case 'tomorrow': {
      const date = addDaysToDateString(today, 1)
      return finalizeDateRange(date, date, timezone, '내일')
    }
    case 'this_week': {
      const dayOfWeek = getLocalDayOfWeek(today, timezone)
      const startDate = addDaysToDateString(today, -dayOfWeek)
      const endDate = addDaysToDateString(startDate, 6)
      return finalizeDateRange(startDate, endDate, timezone, '이번 주')
    }
    case 'next_week': {
      const thisWeek = resolveQueryPeriod('this_week', referenceIso, timezone)
      const startDate = addDaysToDateString(thisWeek.startDate, 7)
      const endDate = addDaysToDateString(thisWeek.endDate, 7)
      return finalizeDateRange(startDate, endDate, timezone, '다음 주')
    }
    case 'last_week': {
      const thisWeek = resolveQueryPeriod('this_week', referenceIso, timezone)
      const startDate = addDaysToDateString(thisWeek.startDate, -7)
      const endDate = addDaysToDateString(thisWeek.endDate, -7)
      return finalizeDateRange(startDate, endDate, timezone, '지난 주')
    }
    case 'this_month': {
      const { year, month } = parseDateParts(today)
      const startDate = formatDateParts(year, month, 1)
      const endDate = formatDateParts(year, month, daysInMonth(year, month))
      return finalizeDateRange(startDate, endDate, timezone, '이번 달')
    }
    case 'next_month': {
      const { year, month } = parseDateParts(today)
      const nextMonthDate = month === 12
        ? formatDateParts(year + 1, 1, 1)
        : formatDateParts(year, month + 1, 1)
      const { year: nextYear, month: nextMonth } = parseDateParts(nextMonthDate)
      const startDate = formatDateParts(nextYear, nextMonth, 1)
      const endDate = formatDateParts(nextYear, nextMonth, daysInMonth(nextYear, nextMonth))
      return finalizeDateRange(startDate, endDate, timezone, '다음 달')
    }
    case 'last_month': {
      const { year, month } = parseDateParts(today)
      const lastMonthDate = month === 1
        ? formatDateParts(year - 1, 12, 1)
        : formatDateParts(year, month - 1, 1)
      const { year: lastYear, month: lastMonth } = parseDateParts(lastMonthDate)
      const startDate = formatDateParts(lastYear, lastMonth, 1)
      const endDate = formatDateParts(lastYear, lastMonth, daysInMonth(lastYear, lastMonth))
      return finalizeDateRange(startDate, endDate, timezone, '지난 달')
    }
    case 'this_year': {
      const year = parseDateParts(today).year
      const startDate = formatDateParts(year, 1, 1)
      const endDate = formatDateParts(year, 12, 31)
      return finalizeDateRange(startDate, endDate, timezone, '올해')
    }
    default:
      throw new Error(`Unsupported period: ${period satisfies never}`)
  }
}

export function finalizeDateRange(
  startDate: string,
  endDate: string,
  timezone: string,
  label = `${startDate} ~ ${endDate}`,
): ResolvedDateRange {
  if (startDate > endDate) {
    throw new Error('start_date must be on or before end_date')
  }

  return {
    startDate,
    endDate,
    label,
    startUtc: localDateToUtcStart(startDate, timezone),
    endUtcExclusive: localDateToUtcEndExclusive(endDate, timezone),
  }
}

export function resolveEventQueryRange(
  args: Record<string, unknown>,
  referenceIso: string,
  timezone: string,
): ResolvedDateRange | null {
  if (args.period) {
    const period = normalizeQueryPeriod(String(args.period))
    if (!period) {
      throw new Error(`Unknown period: ${args.period}`)
    }

    const resolved = resolveQueryPeriod(period, referenceIso, timezone)
    return finalizeDateRange(resolved.startDate, resolved.endDate, timezone)
  }

  const startDate = args.start_date ? String(args.start_date).slice(0, 10) : null
  const endDate = args.end_date ? String(args.end_date).slice(0, 10) : null

  if (!startDate && !endDate) return null

  const effectiveStart = startDate ?? endDate!
  const effectiveEnd = endDate ?? startDate!

  return finalizeDateRange(effectiveStart, effectiveEnd, timezone)
}
