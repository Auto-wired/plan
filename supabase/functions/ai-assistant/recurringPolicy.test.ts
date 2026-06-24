import { describe, expect, it } from 'vitest'
import {
  isRecurringCreateArgs,
  isRecurringMaster,
  RECURRING_MUTATION_BLOCKED_MESSAGE,
} from './recurringPolicy.ts'

describe('recurringPolicy', () => {
  it('blocks create with recurrence_freq', () => {
    expect(isRecurringCreateArgs({ recurrence_freq: 'weekly' })).toBe(true)
    expect(isRecurringCreateArgs({ title: 'x' })).toBe(false)
  })

  it('detects recurring master', () => {
    expect(isRecurringMaster({ recurrence_freq: 'weekly' })).toBe(true)
    expect(isRecurringMaster({ recurrence_freq: null })).toBe(false)
    expect(isRecurringMaster(null)).toBe(false)
  })

  it('blocked message mentions calendar', () => {
    expect(RECURRING_MUTATION_BLOCKED_MESSAGE).toContain('달력')
  })
})
