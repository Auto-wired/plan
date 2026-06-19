export const EVENT_CATEGORIES = [
  { value: 'work', label: '업무', color: '#3788d8' },
  { value: 'life', label: '일상', color: '#22c55e' },
  { value: 'appointment', label: '약속', color: '#f97316' },
] as const

export type EventCategory = (typeof EVENT_CATEGORIES)[number]['value']

export const DEFAULT_EVENT_CATEGORY: EventCategory = 'work'

export const ALL_EVENT_CATEGORIES: EventCategory[] = EVENT_CATEGORIES.map((category) => category.value)

export function isAllCategoriesSelected(selected: EventCategory[]): boolean {
  return selected.length === ALL_EVENT_CATEGORIES.length
}

export function getCategoryColor(category: EventCategory | string | null | undefined): string {
  const found = EVENT_CATEGORIES.find((c) => c.value === category)
  return found?.color ?? EVENT_CATEGORIES[0].color
}

export function getCategoryLabel(category: EventCategory | string | null | undefined): string {
  const found = EVENT_CATEGORIES.find((c) => c.value === category)
  return found?.label ?? EVENT_CATEGORIES[0].label
}

export function isValidCategory(value: string): value is EventCategory {
  return EVENT_CATEGORIES.some((c) => c.value === value)
}

export function matchesCategoryFilter(
  category: EventCategory | string | null | undefined,
  selected: EventCategory[],
): boolean {
  if (selected.length === 0 || isAllCategoriesSelected(selected)) return true
  return selected.includes((category ?? DEFAULT_EVENT_CATEGORY) as EventCategory)
}
