export const EVENT_CATEGORIES = [
  { value: 'work', label: '업무', color: '#3788d8' },
  { value: 'life', label: '일상', color: '#22c55e' },
  { value: 'appointment', label: '약속', color: '#f97316' },
] as const

export type EventCategory = (typeof EVENT_CATEGORIES)[number]['value']

export const DEFAULT_EVENT_CATEGORY: EventCategory = 'work'

export function isValidCategory(value: string): value is EventCategory {
  return EVENT_CATEGORIES.some((c) => c.value === value)
}

export function parseCategory(value: unknown): EventCategory {
  const str = String(value ?? '')
  return isValidCategory(str) ? str : DEFAULT_EVENT_CATEGORY
}
