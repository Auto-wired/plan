import { describe, expect, it } from 'vitest'
import { enrichRecurringOccurrenceArgs, inferOriginalStartAt } from './sessionEnrich.ts'
import type { SessionContext } from './scheduleSpec.ts'

describe('sessionEnrich', () => {
  const ctx: SessionContext = {
    lastQuery: {
      resolved: {
        resolved_label: '이번 주',
        start_date: '2026-06-22',
        end_date: '2026-06-28',
      },
      events: [
        { id: 'master-1', title: '주간 QA', start_at: '2026-06-25T10:00:00.000Z' },
        { id: 'master-1', title: '월간 QA', start_at: '2026-07-02T10:00:00.000Z' },
      ],
    },
  }

  it('inferOriginalStartAt: 단일 회차 매칭', () => {
    const single: SessionContext = {
      lastQuery: {
        resolved: { resolved_label: 'x', start_date: '2026-06-25', end_date: '2026-06-25' },
        events: [{ id: 'e1', title: '운동', start_at: '2026-06-25T18:00:00.000Z' }],
      },
    }
    expect(
      inferOriginalStartAt({ id: 'e1' }, single),
    ).toBe('2026-06-25T18:00:00.000Z')
  })

  it('inferOriginalStartAt: 제목으로 회차 구분', () => {
    expect(
      inferOriginalStartAt({ id: 'master-1' }, ctx, '주간 QA 수정'),
    ).toBe('2026-06-25T10:00:00.000Z')
  })

  it('enrichRecurringOccurrenceArgs: sessionContext 보강', () => {
    const single: SessionContext = {
      lastQuery: {
        resolved: { resolved_label: 'x', start_date: '2026-06-25', end_date: '2026-06-25' },
        events: [{ id: 'master-1', title: 'QA', start_at: '2026-06-25T10:00:00.000Z' }],
      },
    }
    const enriched = enrichRecurringOccurrenceArgs({ id: 'master-1' }, single)
    expect(enriched.original_start_at).toBe('2026-06-25T10:00:00.000Z')
  })
})
