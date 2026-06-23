import type { EventCategory } from '../lib/categories'

export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type RecurrenceScope = 'this' | 'all'
export type ThemeMode = 'light' | 'dark'

export interface UserProfile {
  id: string
  nickname: string
  avatar_url: string | null
  theme: ThemeMode
  created_at: string
  updated_at: string
}

export interface RecurrenceRule {
  freq: RecurrenceFreq
  interval: number
  count?: number
  until?: string
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
  recurrence_freq: RecurrenceFreq | null
  recurrence_interval: number
  recurrence_count: number | null
  recurrence_until: string | null
  created_at: string
  updated_at: string
}

export interface ExpandedCalendarEvent extends CalendarEvent {
  instanceId: string
  masterId: string
  originalStartAt: string
  isRecurringInstance: boolean
}

export interface RecurrenceException {
  id: string
  event_id: string
  original_start_at: string
}

export interface EventFormData {
  title: string
  description: string
  start_at: string
  end_at: string
  all_day: boolean
  category: EventCategory
  recurrence?: RecurrenceRule | null
}

/** Modal 저장/삭제가 즉시 완료됐는지, 반복 범위 선택으로 지연됐는지 */
export type EventMutationResult = 'completed' | 'deferred'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface AIAction {
  tool: string
  result: unknown
}

export type AIResultKind = 'create' | 'update' | 'delete' | 'query'

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

export interface AIQueryInfo {
  args: Record<string, unknown>
  total: number
  offset: number
  limit: number
  hasMore: boolean
  resolved?: SessionLastQueryResolved | null
}

export interface AIPendingAction {
  tool: string
  arguments: Record<string, unknown>
}

export interface AIPendingConfirmation {
  kind: 'delete' | 'recurring-delete' | 'recurring-update' | 'ambiguous'
  message: string
  pendingAction: AIPendingAction
  target?: {
    title: string
    start_at: string
    end_at: string
    all_day: boolean
  } | null
  /** recurring-delete: 유한 반복 마지막 1회차 → 「전체 삭제」만 */
  lastOne?: boolean
}

export interface AIResponse {
  reply: string
  actions: AIAction[]
  events: CalendarEvent[]
  resultKind?: AIResultKind | null
  query?: AIQueryInfo | null
  pendingConfirmation?: AIPendingConfirmation | null
}

export interface DateRange {
  start: Date
  end: Date
}
