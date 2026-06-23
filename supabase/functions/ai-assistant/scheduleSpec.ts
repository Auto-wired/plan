/** Schedule resolution domain types (V1 — query range). See docs/specs/SCHEDULE_RESOLUTION.md */

export type QueryWeekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

export type DateSpec =
  | {
      kind: 'absolute'
      start_date: string
      end_date?: string
      label?: string
    }
  | {
      kind: 'day'
      day_offset: number
    }
  | {
      kind: 'week'
      week_offset: number
      weekday?: QueryWeekday
    }
  | {
      kind: 'month_span'
      month_offset: number
    }
  | {
      kind: 'year'
      year_offset: number
    }

/** V1 query uses top-level time_period; full TimeSpec in V2. */
export type TimeSpec =
  | { kind: 'all_day' }
  | { kind: 'clock'; hour: number; minute?: number }
  | { kind: 'time_period'; period: string }
  | { kind: 'preserve' }

export type ScheduleSpec = {
  date: DateSpec
  time?: TimeSpec
}

export type ResolveConfidence = 'high' | 'medium' | 'low'

export type ResolveGranularity = 'day' | 'range'

export interface ResolvedSchedule {
  startDate: string
  endDate: string
  startUtc: string
  endUtcExclusive: string
  label: string
  resolved_label: string
  resolved_date?: string
  weekday_ko?: string
  granularity: ResolveGranularity
  confidence: ResolveConfidence
}

export interface SessionEventRef {
  id: string
  title: string
  start_at: string
}

export interface SessionLastQueryResolved {
  resolved_label: string
  resolved_date?: string
  weekday_ko?: string
  start_date: string
  end_date: string
}

export interface SessionContext {
  lastQuery?: {
    resolved: SessionLastQueryResolved
    events: SessionEventRef[]
  }
}
