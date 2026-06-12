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
  type: 'modified' | 'deleted'
  override_title: string | null
  override_description: string | null
  override_start_at: string | null
  override_end_at: string | null
  override_all_day: boolean | null
  override_category: EventCategory | null
  created_at: string
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

export interface AIResponse {
  reply: string
  actions: AIAction[]
  events: CalendarEvent[]
}

export interface DateRange {
  start: Date
  end: Date
}
