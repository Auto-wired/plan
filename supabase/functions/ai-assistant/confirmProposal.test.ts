import { describe, expect, it } from 'vitest'
import { buildConfirmationMessage } from './confirmProposal.ts'

describe('buildConfirmationMessage', () => {
  it('update reschedule uses resolved_label', () => {
    const msg = buildConfirmationMessage(
      'update_event',
      { id: 'x' },
      '팀미팅',
      {
        resolved_label: '다음 주 일요일 15:00',
        start_at: '2026-06-28T15:00:00.000Z',
        end_at: '2026-06-28T16:00:00.000Z',
        all_day: false,
        confidence: 'high',
      },
    )
    expect(msg).toContain('팀미팅')
    expect(msg).toContain('다음 주 일요일 15:00')
    expect(msg).toContain('옮길까요')
  })

  it('update title-only', () => {
    const msg = buildConfirmationMessage(
      'update_event',
      { id: 'x', title: '주간회의' },
      '팀회의',
      null,
    )
    expect(msg).toBe("'팀회의' 제목을 '주간회의'(으)로 변경할까요?")
  })

  it('delete', () => {
    expect(buildConfirmationMessage('delete_event', { id: 'x' }, '약속', null)).toBe(
      "'약속' 일정을 삭제할까요?",
    )
  })
})
