import { describe, expect, it } from 'vitest'
import {
  applyMutationScheduleSpec,
  canonicalQueryArgsForPagination,
  enrichMutationScheduleArgs,
  legacyArgsToDateSpec,
  legacyMutationToScheduleSpec,
  parseTimeSpec,
  resolveInstantSchedule,
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

describe('resolveInstantSchedule (V2)', () => {
  it('day_offset + evening: 내일 저녁', () => {
    const r = resolveInstantSchedule(
      {
        date: { kind: 'day', day_offset: 1 },
        time: { kind: 'time_period', period: 'evening' },
      },
      REF,
      TZ,
      'high',
    )
    expect(r.start_at).toBe('2026-06-23T18:00:00.000Z')
    expect(r.end_at).toBe('2026-06-23T19:00:00.000Z')
    expect(r.all_day).toBe(false)
    expect(r.resolved_label).toContain('내일')
    expect(r.time_label).toBe('저녁')
  })

  it('week + clock: 다음 주 금요일 15:30', () => {
    const r = resolveInstantSchedule(
      {
        date: { kind: 'week', week_offset: 1, weekday: 'fri' },
        time: { kind: 'clock', hour: 15, minute: 30 },
        duration_minutes: 90,
      },
      REF,
      TZ,
      'high',
    )
    expect(r.start_at).toBe('2026-07-03T15:30:00.000Z')
    expect(r.end_at).toBe('2026-07-03T17:00:00.000Z')
    expect(r.weekday_ko).toBe('금요일')
  })

  it('all_day: 모레 종일', () => {
    const r = resolveInstantSchedule(
      {
        date: { kind: 'day', day_offset: 2 },
        time: { kind: 'all_day' },
      },
      REF,
      TZ,
      'high',
    )
    expect(r.all_day).toBe(true)
    expect(r.start_at).toBe('2026-06-24T00:00:00.000Z')
    expect(r.end_at).toBe('2026-06-24T00:00:00.000Z')
    expect(r.time_label).toBe('종일')
  })

  it('applyMutationScheduleSpec from schedule_spec', () => {
    const { args, resolved } = applyMutationScheduleSpec(
      {
        title: '운동',
        schedule_spec: {
          date: { kind: 'day', day_offset: 1 },
          time: { kind: 'clock', hour: 9 },
        },
      },
      REF,
      TZ,
    )
    expect(args.start_at).toBe('2026-06-23T09:00:00.000Z')
    expect(args.all_day).toBe(false)
    expect(resolved?.confidence).toBe('high')
  })

  it('legacy start_at bridge', () => {
    const { spec, confidence } = legacyMutationToScheduleSpec({
      start_at: '2026-06-25T14:00:00.000Z',
      end_at: '2026-06-25T15:30:00.000Z',
    })
    expect(confidence).toBe('medium')
    expect(spec?.time?.kind).toBe('clock')
    if (spec?.time?.kind === 'clock') {
      expect(spec.time.hour).toBe(14)
      expect(spec.duration_minutes).toBe(90)
    }
  })
})

describe('V2.1 update time merge', () => {
  const existing = {
    start_at: '2026-06-25T18:00:00.000Z',
    end_at: '2026-06-25T19:00:00.000Z',
    all_day: false,
  }

  it('메시지 3시 → clock 15:00', () => {
    const { args, resolved } = applyMutationScheduleSpec(
      {
        id: 'e1',
        schedule_spec: {
          date: { kind: 'week', week_offset: 1, weekday: 'fri' },
        },
      },
      REF,
      TZ,
      { mode: 'update', userMessage: '다음 주 금요일 3시로 옮겨줘' },
    )
    expect(args.start_at).toBe('2026-07-03T15:00:00.000Z')
    expect(args.all_day).toBe(false)
    expect(resolved?.time_label).toBe('15:00')
  })

  it('time 없고 메시지도 없으면 기존 시각 유지', () => {
    const { args, resolved } = applyMutationScheduleSpec(
      {
        id: 'e1',
        schedule_spec: {
          date: { kind: 'week', week_offset: 1, weekday: 'fri' },
        },
      },
      REF,
      TZ,
      { mode: 'update', existingEvent: existing },
    )
    expect(args.start_at).toBe('2026-07-03T18:00:00.000Z')
    expect(args.end_at).toBe('2026-07-03T19:00:00.000Z')
    expect(args.all_day).toBe(false)
    expect(resolved?.all_day).toBe(false)
  })

  it('enrichMutationScheduleArgs: schedule_spec에 time 주입', () => {
    const enriched = enrichMutationScheduleArgs(
      {
        schedule_spec: { date: { kind: 'week', week_offset: 1, weekday: 'fri' } },
      },
      '다음 주 금요일 3시로',
    )
    const spec = enriched.schedule_spec as { time?: { kind: string; hour?: number } }
    expect(spec.time?.kind).toBe('clock')
    expect(spec.time?.hour).toBe(15)
  })

  it('parseTimeSpec: kind 없이 hour만', () => {
    expect(parseTimeSpec({ hour: 15 })).toEqual({ kind: 'clock', hour: 15, minute: 0 })
  })
})
