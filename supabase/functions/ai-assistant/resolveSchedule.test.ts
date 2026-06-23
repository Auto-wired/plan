import { describe, expect, it } from 'vitest'
import {
  canonicalQueryArgsForPagination,
  legacyArgsToDateSpec,
  resolveQuerySchedule,
  resolveSchedule,
} from './resolveSchedule.ts'

const TZ = 'Asia/Seoul'
/** 2026-06-22 (월) 09:00 KST */
const REF = '2026-06-22T00:00:00.000Z'

describe('resolveSchedule', () => {
  it('day_offset: 오늘/내일/모레', () => {
    const today = resolveSchedule({ kind: 'day', day_offset: 0 }, REF, TZ, 'high')
    expect(today.startDate).toBe('2026-06-22')
    expect(today.weekday_ko).toBe('월요일')

    const tomorrow = resolveSchedule({ kind: 'day', day_offset: 1 }, REF, TZ, 'high')
    expect(tomorrow.startDate).toBe('2026-06-23')
    expect(tomorrow.resolved_label).toBe('내일')

    const dayAfter = resolveSchedule({ kind: 'day', day_offset: 2 }, REF, TZ, 'high')
    expect(dayAfter.startDate).toBe('2026-06-24')
    expect(dayAfter.resolved_label).toBe('모레')
  })

  it('week_offset + weekday: 이번 주 수요일', () => {
    const r = resolveSchedule(
      { kind: 'week', week_offset: 0, weekday: 'wed' },
      REF,
      TZ,
      'high',
    )
    expect(r.startDate).toBe('2026-06-24')
    expect(r.endDate).toBe('2026-06-24')
    expect(r.weekday_ko).toBe('수요일')
    expect(r.resolved_label).toContain('이번 주')
  })

  it('week_offset + weekday: 다음 주 수요일', () => {
    const r = resolveSchedule(
      { kind: 'week', week_offset: 1, weekday: 'wed' },
      REF,
      TZ,
      'high',
    )
    expect(r.startDate).toBe('2026-07-01')
    expect(r.weekday_ko).toBe('수요일')
  })

  it('week_offset + weekday: 다다음 주 수요일', () => {
    const r = resolveSchedule(
      { kind: 'week', week_offset: 2, weekday: 'wed' },
      REF,
      TZ,
      'high',
    )
    expect(r.startDate).toBe('2026-07-08')
    expect(r.weekday_ko).toBe('수요일')
    expect(r.resolved_label).toContain('다다음 주')
  })

  it('week_offset without weekday: 다음 주 범위', () => {
    const r = resolveSchedule({ kind: 'week', week_offset: 1 }, REF, TZ, 'high')
    expect(r.startDate).toBe('2026-06-28')
    expect(r.endDate).toBe('2026-07-04')
    expect(r.granularity).toBe('range')
  })

  it('month_span: 이번 달', () => {
    const r = resolveSchedule({ kind: 'month_span', month_offset: 0 }, REF, TZ, 'high')
    expect(r.startDate).toBe('2026-06-01')
    expect(r.endDate).toBe('2026-06-30')
  })

  it('legacy period + weekday', () => {
    const { spec, confidence } = legacyArgsToDateSpec({
      period: 'next_week',
      weekday: 'wed',
    })
    expect(confidence).toBe('medium')
    expect(spec).toEqual({ kind: 'week', week_offset: 1, weekday: 'wed' })

    const r = resolveQuerySchedule({ period: 'next_week', weekday: 'wed' }, REF, TZ)
    expect(r?.startDate).toBe('2026-07-01')
  })

  it('schedule_spec takes priority', () => {
    const { spec, confidence } = legacyArgsToDateSpec({
      schedule_spec: { date: { kind: 'day', day_offset: 3 } },
      period: 'today',
    })
    expect(confidence).toBe('high')
    expect(spec?.kind).toBe('day')
    if (spec?.kind === 'day') expect(spec.day_offset).toBe(3)
  })

  it('canonicalQueryArgsForPagination strips period', () => {
    const resolved = resolveSchedule(
      { kind: 'week', week_offset: 2, weekday: 'wed' },
      REF,
      TZ,
      'high',
    )
    const canonical = canonicalQueryArgsForPagination(
      { period: 'next_week', weekday: 'wed', keyword: '회의', limit: 20 },
      resolved,
    )
    expect(canonical).toEqual({
      start_date: '2026-07-08',
      end_date: '2026-07-08',
      keyword: '회의',
      limit: 20,
    })
    expect(canonical.period).toBeUndefined()
    expect(canonical.schedule_spec).toBeUndefined()
  })
})
