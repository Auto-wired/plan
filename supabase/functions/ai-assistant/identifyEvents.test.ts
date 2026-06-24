import { describe, expect, it } from 'vitest'
import { extractSearchKeyword } from './identifyEvents.ts'

describe('identifyEvents', () => {
  it('extractSearchKeyword: 이번주 미팅 일요일로 미뤄줘 → 미팅', () => {
    expect(extractSearchKeyword('이번주 미팅 일요일로 미뤄줘')).toBe('미팅')
  })

  it('extractSearchKeyword: 팀미팅 삭제 → 팀미팅', () => {
    expect(extractSearchKeyword('팀미팅 삭제해줘')).toBe('팀미팅')
  })

  it('extractSearchKeyword: no keyword', () => {
    expect(extractSearchKeyword('일요일로 미뤄줘')).toBeNull()
  })
})
