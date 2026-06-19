import { useState, type FormEvent } from 'react'
import {
  calendarDateToUtcIso,
  defaultAllDayEventUtcIso,
  fcExclusiveEndToInclusiveAllDayDate,
  localToUtc,
  normalizeAllDayRangeForSave,
  prepareEventFormForSave,
  utcToLocalFormInput,
} from '../../lib/datetime'
import {
  DEFAULT_EVENT_CATEGORY,
  EVENT_CATEGORIES,
  type EventCategory,
} from '../../lib/categories'
import { eventToFormData } from '../../lib/eventMapper'
import type { CalendarEvent, EventFormData, RecurrenceFreq } from '../../types'
import './EventModal.css'

interface EventModalProps {
  event: CalendarEvent | null
  initialRange?: { start: Date; end: Date; allDay: boolean } | null
  isRecurringInstanceEdit?: boolean
  onSave: (form: EventFormData, eventId?: string) => Promise<void>
  onDelete?: (eventId: string) => Promise<void>
  onClose: () => void
}

const emptyForm = (): EventFormData => ({
  title: '',
  description: '',
  start_at: defaultAllDayEventUtcIso(),
  end_at: defaultAllDayEventUtcIso(),
  all_day: true,
  category: DEFAULT_EVENT_CATEGORY,
  recurrence: null,
})

const RECURRENCE_OPTIONS: { value: RecurrenceFreq | ''; label: string }[] = [
  { value: '', label: '반복 안 함' },
  { value: 'daily', label: '매일' },
  { value: 'weekly', label: '매주' },
  { value: 'monthly', label: '매월' },
  { value: 'yearly', label: '매년' },
]

const RECURRENCE_UNIT: Record<RecurrenceFreq, string> = {
  daily: '일',
  weekly: '주',
  monthly: '개월',
  yearly: '년',
}

const RECURRENCE_EVERY_LABEL: Record<RecurrenceFreq, string> = {
  daily: '매일',
  weekly: '매주',
  monthly: '매월',
  yearly: '매년',
}

type RecurrenceEndMode = 'never' | 'count' | 'until'

function getEndMode(recurrence: EventFormData['recurrence']): RecurrenceEndMode {
  if (!recurrence) return 'never'
  if (recurrence.until) return 'until'
  if (recurrence.count != null) return 'count'
  return 'never'
}

function describeRecurrence(recurrence: NonNullable<EventFormData['recurrence']>): string {
  const interval = recurrence.interval || 1
  const unit = RECURRENCE_UNIT[recurrence.freq]
  const base =
    interval === 1
      ? RECURRENCE_EVERY_LABEL[recurrence.freq]
      : `${interval}${unit}마다`
  if (recurrence.count != null) return `${base}, ${recurrence.count}회 반복`
  if (recurrence.until) return `${base}, ${recurrence.until}까지`
  return `${base} 계속 반복`
}

function buildInitialForm(
  event: CalendarEvent | null,
  initialRange?: { start: Date; end: Date; allDay: boolean } | null,
): EventFormData {
  if (event) return eventToFormData(event)
  if (initialRange) {
    if (initialRange.allDay) {
      const start_at = localToUtc(
        utcToLocalFormInput(calendarDateToUtcIso(initialRange.start), true),
        true,
      )
      const inclusiveEnd = fcExclusiveEndToInclusiveAllDayDate(
        calendarDateToUtcIso(initialRange.end),
      )
      const end_at = localToUtc(inclusiveEnd, true)
      return {
        ...emptyForm(),
        start_at,
        end_at,
        all_day: true,
      }
    }
    return {
      ...emptyForm(),
      start_at: calendarDateToUtcIso(initialRange.start),
      end_at: calendarDateToUtcIso(initialRange.end),
      all_day: false,
    }
  }
  return emptyForm()
}

function handleAllDayToggle(form: EventFormData, checked: boolean): EventFormData {
  if (checked) {
    const { start_at, end_at } = normalizeAllDayRangeForSave(form.start_at, form.end_at)
    return { ...form, all_day: true, start_at, end_at }
  }

  const startDate = utcToLocalFormInput(form.start_at, true)
  const endDate = utcToLocalFormInput(form.end_at, true)
  const effectiveEndDate = endDate >= startDate ? endDate : startDate

  return {
    ...form,
    all_day: false,
    start_at: localToUtc(`${startDate}T09:00`, false),
    end_at: localToUtc(`${effectiveEndDate}T18:00`, false),
  }
}

export function EventModal({
  event,
  initialRange,
  isRecurringInstanceEdit = false,
  onSave,
  onDelete,
  onClose,
}: EventModalProps) {
  const [form, setForm] = useState(() => buildInitialForm(event, initialRange))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recurrenceFreq = form.recurrence?.freq ?? ''
  const isEditingRecurringMaster = !!event?.recurrence_freq && !isRecurringInstanceEdit

  const endMode = getEndMode(form.recurrence)

  const handleRecurrenceChange = (freq: RecurrenceFreq | '') => {
    if (!freq) {
      setForm({ ...form, recurrence: null })
      return
    }
    setForm({
      ...form,
      recurrence: {
        freq,
        interval: form.recurrence?.interval ?? 1,
        count: form.recurrence?.count,
        until: form.recurrence?.until,
      },
    })
  }

  const updateRecurrence = (patch: Partial<NonNullable<EventFormData['recurrence']>>) => {
    if (!form.recurrence) return
    setForm({ ...form, recurrence: { ...form.recurrence, ...patch } })
  }

  const handleEndModeChange = (mode: RecurrenceEndMode) => {
    if (!form.recurrence) return
    if (mode === 'never') {
      updateRecurrence({ count: undefined, until: undefined })
    } else if (mode === 'count') {
      updateRecurrence({ count: form.recurrence.count ?? 10, until: undefined })
    } else {
      const fallbackUntil = utcToLocalFormInput(form.start_at, true)
      updateRecurrence({ count: undefined, until: form.recurrence.until ?? fallbackUntil })
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('제목을 입력해주세요.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await onSave(prepareEventFormForSave(form), event?.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!event?.id || !onDelete) return
    // 반복 일정은 범위 선택 다이얼로그에서 확인을 받으므로 여기서는 묻지 않는다.
    if (!isRecurringInstanceEdit && !confirm('이 일정을 삭제하시겠습니까?')) return

    setLoading(true)
    try {
      await onDelete(event.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{event ? '일정 수정' : '일정 추가'}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="event-form">
          <label>
            제목 *
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </label>

          <label>
            설명
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.all_day}
              onChange={(e) => setForm(handleAllDayToggle(form, e.target.checked))}
            />
            종일
          </label>

          <div className="datetime-row">
            <label>
              {form.all_day ? '시작일' : '시작'}
              <input
                type={form.all_day ? 'date' : 'datetime-local'}
                value={utcToLocalFormInput(form.start_at, form.all_day)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    start_at: localToUtc(e.target.value, form.all_day),
                  })
                }
                required
              />
            </label>
            <label>
              {form.all_day ? '종료일' : '종료'}
              <input
                type={form.all_day ? 'date' : 'datetime-local'}
                value={utcToLocalFormInput(form.end_at, form.all_day)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    end_at: localToUtc(e.target.value, form.all_day),
                  })
                }
                required
              />
            </label>
          </div>

          {!isEditingRecurringMaster && (
            <fieldset className="recurrence-fieldset">
              <legend>반복</legend>
              <select
                className="recurrence-freq"
                value={recurrenceFreq}
                onChange={(e) =>
                  handleRecurrenceChange(e.target.value as RecurrenceFreq | '')
                }
              >
                {RECURRENCE_OPTIONS.map((opt) => (
                  <option key={opt.value || 'none'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {form.recurrence && (
                <div className="recurrence-detail">
                  <div className="recurrence-interval-row">
                    <span>매</span>
                    <input
                      type="number"
                      min={1}
                      value={form.recurrence.interval}
                      onChange={(e) =>
                        updateRecurrence({
                          interval: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                    <span>{RECURRENCE_UNIT[form.recurrence.freq]}마다</span>
                  </div>

                  <div className="recurrence-end">
                    <span className="recurrence-end-title">반복 종료</span>

                    <div className="recurrence-end-options">
                      <label className="recurrence-radio">
                        <input
                          type="radio"
                          name="recurrence-end"
                          checked={endMode === 'never'}
                          onChange={() => handleEndModeChange('never')}
                        />
                        <span>계속 반복</span>
                      </label>

                      <label className="recurrence-radio">
                        <input
                          type="radio"
                          name="recurrence-end"
                          checked={endMode === 'count'}
                          onChange={() => handleEndModeChange('count')}
                        />
                        <span>횟수</span>
                      </label>

                      <label className="recurrence-radio">
                        <input
                          type="radio"
                          name="recurrence-end"
                          checked={endMode === 'until'}
                          onChange={() => handleEndModeChange('until')}
                        />
                        <span>종료 날짜</span>
                      </label>
                    </div>

                    {endMode === 'count' && (
                      <div className="recurrence-end-detail">
                        <input
                          type="number"
                          min={1}
                          className="recurrence-detail-input"
                          value={form.recurrence.count ?? ''}
                          onChange={(e) =>
                            updateRecurrence({
                              count: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                        />
                        <span>회 반복</span>
                      </div>
                    )}

                    {endMode === 'until' && (
                      <div className="recurrence-end-detail">
                        <input
                          type="date"
                          className="recurrence-detail-input recurrence-date-input"
                          value={form.recurrence.until ?? ''}
                          onChange={(e) =>
                            updateRecurrence({ until: e.target.value || undefined })
                          }
                        />
                      </div>
                    )}
                  </div>

                  <p className="recurrence-summary">{describeRecurrence(form.recurrence)}</p>
                </div>
              )}
            </fieldset>
          )}

          {isEditingRecurringMaster && (
            <p className="recurrence-note">반복 일정은 전체 시리즈 기준으로 수정됩니다.</p>
          )}

          <fieldset className="category-fieldset">
            <legend>카테고리</legend>
            <div className="category-selector">
              {EVENT_CATEGORIES.map((cat) => (
                <label
                  key={cat.value}
                  className={`category-option${form.category === cat.value ? ' selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="category"
                    value={cat.value}
                    checked={form.category === cat.value}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value as EventCategory })
                    }
                  />
                  <span className="category-dot" style={{ background: cat.color }} />
                  <span className="category-label">{cat.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            {event && onDelete && (
              <button
                type="button"
                className="btn-danger"
                onClick={handleDelete}
                disabled={loading}
              >
                삭제
              </button>
            )}
            <div className="modal-actions-right">
              <button type="button" className="btn-secondary" onClick={onClose}>
                취소
              </button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
