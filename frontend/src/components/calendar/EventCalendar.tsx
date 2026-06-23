import { useCallback, useImperativeHandle, useLayoutEffect, useMemo, useState, forwardRef } from 'react'
import type { EventInput } from '@fullcalendar/core'
import { matchesCategoryFilter, DEFAULT_EVENT_CATEGORY, EVENT_CATEGORIES, type EventCategory } from '../../lib/categories'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import type {
  DateSelectArg,
  EventClickArg,
  EventDropArg,
  DatesSetArg,
  EventContentArg,
} from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import { useAuth } from '../../hooks/useAuth'
import { useEvents } from '../../hooks/useEvents'
import { useToast } from '../../contexts/ToastContext'
import {
  calendarDateToUtcIso,
  calendarRangeToUtcIso,
  getCalendarNow,
  normalizeDbTimestamp,
  toFullCalendarAllDayEnd,
  utcToFullCalendarValue,
} from '../../lib/datetime'
import { mapEventError } from '../../lib/eventValidation'
import { EVENT_TOAST } from '../../lib/eventToast'
import type { CalendarEvent, DateRange, EventFormData, EventMutationResult, RecurrenceScope } from '../../types'
import { eventToRecurrenceRule, recurrenceRuleChanged } from '../../lib/eventMapper'
import { getRemainingRecurringOccurrences } from '../../lib/recurrenceActions'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { EventModal } from './EventModal'
import { renderCalendarEventContent } from './CalendarEventContent'
import './EventCalendar.css'

interface EventCalendarProps {
  selectedCategories?: EventCategory[]
}

export interface EventCalendarHandle {
  openEventForEdit: (event: CalendarEvent) => void
}

interface PendingRecurringAction {
  master: CalendarEvent
  originalStartAt: string
  form: EventFormData
  /** DnD/리사이즈로 진입한 경우 취소·저장 실패 시 달력 위치 복구 */
  revert?: () => void
}

interface PendingRecurringDelete {
  master: CalendarEvent
  originalStartAt: string
  /** 유한 반복의 마지막 1회차 → 「전체 삭제」만 제공 */
  lastOne: boolean
}

/** DnD/리사이즈한 회차만 controlled events 원위치 리셋 방지 (저장·refetch 완료까지 유지) */
interface DragPreviewOverride {
  instanceId: string
  start_at: string
  end_at: string
  all_day: boolean
  /** 「해당 일정만」 저장 중 instanceId가 목록에서 빠질 때 드롭 위치 유지 */
  fallbackEvent: EventInput
}

function buildPreviewEventFromOverride(preview: DragPreviewOverride): EventInput {
  const { instanceId, start_at, end_at, all_day, fallbackEvent } = preview
  return {
    ...fallbackEvent,
    id: instanceId,
    start: utcToFullCalendarValue(start_at, all_day),
    end: all_day
      ? toFullCalendarAllDayEnd(start_at, end_at)
      : utcToFullCalendarValue(end_at, false),
    allDay: all_day,
    extendedProps: {
      ...(fallbackEvent.extendedProps as Record<string, unknown>),
      start_at: normalizeDbTimestamp(start_at),
      end_at: normalizeDbTimestamp(end_at),
    },
  }
}

function snapshotFcEventForPreview(
  event: {
    id: string
    title: string
    start: Date | null
    end: Date | null
    allDay: boolean
    backgroundColor?: string
    borderColor?: string
    textColor?: string
    extendedProps: Record<string, unknown>
  },
  start_at: string,
  end_at: string,
): EventInput {
  return {
    id: event.id,
    title: event.title,
    start: event.start ?? undefined,
    end: event.end ?? undefined,
    allDay: event.allDay,
    backgroundColor: event.backgroundColor,
    borderColor: event.borderColor,
    textColor: event.textColor,
    extendedProps: {
      ...event.extendedProps,
      start_at: normalizeDbTimestamp(start_at),
      end_at: normalizeDbTimestamp(end_at),
    },
  }
}

function fcEventTimesMatchPreview(event: EventInput, preview: DragPreviewOverride): boolean {
  const props = event.extendedProps as Record<string, unknown> | undefined
  const start_at = normalizeDbTimestamp(String(props?.start_at ?? ''))
  const end_at = normalizeDbTimestamp(String(props?.end_at ?? ''))
  return (
    start_at === normalizeDbTimestamp(preview.start_at) &&
    end_at === normalizeDbTimestamp(preview.end_at) &&
    Boolean(event.allDay) === preview.all_day
  )
}

function applyDragPreview(
  events: EventInput[],
  preview: DragPreviewOverride,
): EventInput[] {
  const { instanceId, start_at, end_at, all_day } = preview
  const target = events.find((event) => event.id === instanceId)

  if (target && fcEventTimesMatchPreview(target, preview)) {
    return events
  }

  if (!target) {
    if (events.some((event) => fcEventTimesMatchPreview(event, preview))) {
      return events
    }
    return [...events, buildPreviewEventFromOverride(preview)]
  }

  return events.map((fcEvent) => {
    if (fcEvent.id !== instanceId) return fcEvent
    return {
      ...fcEvent,
      start: utcToFullCalendarValue(start_at, all_day),
      end: all_day
        ? toFullCalendarAllDayEnd(start_at, end_at)
        : utcToFullCalendarValue(end_at, false),
      allDay: all_day,
      extendedProps: {
        ...(fcEvent.extendedProps as Record<string, unknown>),
        start_at: normalizeDbTimestamp(start_at),
        end_at: normalizeDbTimestamp(end_at),
      },
    }
  })
}

function dragPreviewCommitted(
  events: EventInput[],
  preview: DragPreviewOverride,
): boolean {
  const target = events.find((event) => event.id === preview.instanceId)
  if (target && fcEventTimesMatchPreview(target, preview)) return true
  return events.some(
    (event) => event.id !== preview.instanceId && fcEventTimesMatchPreview(event, preview),
  )
}

export const EventCalendar = forwardRef<EventCalendarHandle, EventCalendarProps>(
  function EventCalendar({ selectedCategories = [] }, ref) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [dateRange, setDateRange] = useState<DateRange | null>(null)
  const {
    calendarEvents,
    isLoading,
    createEvent,
    updateEvent,
    updateRecurringEvent,
    deleteEvent,
    deleteRecurringEventByScope,
    fetchMasterEvent,
  } = useEvents(dateRange)

  const filteredCalendarEvents = useMemo(
    () =>
      calendarEvents.filter((event) =>
        matchesCategoryFilter(
          event.extendedProps?.category as EventCategory | undefined,
          selectedCategories,
        ),
      ),
    [calendarEvents, selectedCategories],
  )

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [selectedOriginalStartAt, setSelectedOriginalStartAt] = useState<string | null>(null)
  const [initialRange, setInitialRange] = useState<{
    start: Date
    end: Date
    allDay: boolean
  } | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [pendingRecurringAction, setPendingRecurringAction] =
    useState<PendingRecurringAction | null>(null)
  const [pendingRecurringDelete, setPendingRecurringDelete] =
    useState<PendingRecurringDelete | null>(null)
  const [dragPreviewOverride, setDragPreviewOverride] =
    useState<DragPreviewOverride | null>(null)

  const clearDragPreview = useCallback(() => {
    setDragPreviewOverride(null)
  }, [])

  const displayCalendarEvents = useMemo(() => {
    if (!dragPreviewOverride) return filteredCalendarEvents
    return applyDragPreview(filteredCalendarEvents, dragPreviewOverride)
  }, [filteredCalendarEvents, dragPreviewOverride])

  useLayoutEffect(() => {
    if (!dragPreviewOverride) return
    if (dragPreviewCommitted(filteredCalendarEvents, dragPreviewOverride)) {
      clearDragPreview()
    }
  }, [filteredCalendarEvents, dragPreviewOverride, clearDragPreview])

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setDateRange({ start: arg.start, end: arg.end })
  }, [])

  const handleSelect = useCallback((selectInfo: DateSelectArg) => {
    setSelectedEvent(null)
    setSelectedOriginalStartAt(null)
    setInitialRange({
      start: selectInfo.start,
      end: selectInfo.end,
      allDay: selectInfo.allDay,
    })
    setIsModalOpen(true)
  }, [])

  const openCalendarEventForEdit = useCallback((event: CalendarEvent) => {
    setSelectedEvent({
      ...event,
      recurrence_freq: event.recurrence_freq ?? null,
      recurrence_interval: event.recurrence_interval ?? 1,
      recurrence_count: event.recurrence_count ?? null,
      recurrence_until: event.recurrence_until ?? null,
    })
    setSelectedOriginalStartAt(null)
    setInitialRange(null)
    setIsModalOpen(true)
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      openEventForEdit: openCalendarEventForEdit,
    }),
    [openCalendarEventForEdit],
  )

  const openEventForEdit = useCallback(
    async (clickInfo: EventClickArg) => {
      const event = clickInfo.event
      const masterId = (event.extendedProps.masterId as string | undefined) ?? event.id
      const originalStartAt =
        (event.extendedProps.originalStartAt as string | undefined) ??
        (event.extendedProps.start_at as string | undefined) ??
        (event.start ? calendarDateToUtcIso(event.start) : '')

      const isRecurringInstance = Boolean(event.extendedProps.isRecurringInstance)

      if (isRecurringInstance) {
        const master = await fetchMasterEvent(masterId)
        setSelectedEvent({
          ...master,
          title: event.title,
          description: (event.extendedProps.description as string) ?? null,
          start_at: (event.extendedProps.start_at as string) ?? originalStartAt,
          end_at:
            (event.extendedProps.end_at as string) ??
            (event.end ? calendarDateToUtcIso(event.end) : originalStartAt),
          all_day: event.allDay,
          category: (event.extendedProps.category as CalendarEvent['category']) ?? 'work',
        })
        setSelectedOriginalStartAt(originalStartAt)
      } else {
        setSelectedEvent({
          id: event.id,
          user_id: user?.id ?? '',
          title: event.title,
          description: (event.extendedProps.description as string) ?? null,
          start_at:
            (event.extendedProps.start_at as string) ??
            (event.start ? calendarDateToUtcIso(event.start) : ''),
          end_at:
            (event.extendedProps.end_at as string) ??
            (event.end
              ? calendarDateToUtcIso(event.end)
              : event.start
                ? calendarDateToUtcIso(event.start)
                : ''),
          all_day: event.allDay,
          category: (event.extendedProps.category as CalendarEvent['category']) ?? 'work',
          recurrence_freq: null,
          recurrence_interval: 1,
          recurrence_count: null,
          recurrence_until: null,
          created_at: '',
          updated_at: '',
        })
        setSelectedOriginalStartAt(null)
      }

      setInitialRange(null)
      setIsModalOpen(true)
    },
    [fetchMasterEvent, user?.id],
  )

  const handleEventClick = useCallback(
    (clickInfo: EventClickArg) => {
      void openEventForEdit(clickInfo)
    },
    [openEventForEdit],
  )

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
    setSelectedEvent(null)
    setSelectedOriginalStartAt(null)
    setInitialRange(null)
  }, [])

  const executeRecurringDelete = useCallback(
    async (scope: RecurrenceScope) => {
      if (!pendingRecurringDelete) return

      const { master, originalStartAt } = pendingRecurringDelete

      try {
        await deleteRecurringEventByScope(master, originalStartAt, scope)
        showToast(EVENT_TOAST.deleteSuccess, { variant: 'success' })
        closeModal()
      } catch (err) {
        const reason = mapEventError(err instanceof Error ? err.message : '')
        showToast(EVENT_TOAST.deleteFailure(reason), { variant: 'error' })
      } finally {
        setPendingRecurringDelete(null)
      }
    },
    [closeModal, deleteRecurringEventByScope, pendingRecurringDelete, showToast],
  )

  const applyScope = useCallback(
    async (scope: RecurrenceScope) => {
      if (!pendingRecurringAction) return

      const { master, originalStartAt, form, revert } = pendingRecurringAction
      setPendingRecurringAction(null)

      try {
        await updateRecurringEvent(master, originalStartAt, scope, form)
        showToast(EVENT_TOAST.updateSuccess, { variant: 'success' })
        closeModal()
      } catch (err) {
        revert?.()
        clearDragPreview()
        const reason = mapEventError(err instanceof Error ? err.message : '')
        showToast(EVENT_TOAST.updateFailure(reason), { variant: 'error' })
      }
    },
    [clearDragPreview, closeModal, pendingRecurringAction, showToast, updateRecurringEvent],
  )

  const handleEventDrop = useCallback(
    async (dropInfo: EventDropArg) => {
      const event = dropInfo.event
      if (!event.start) return

      const masterId = (event.extendedProps.masterId as string | undefined) ?? event.id
      const originalStartAt =
        (event.extendedProps.originalStartAt as string | undefined) ?? event.id
      const isRecurringInstance = Boolean(event.extendedProps.isRecurringInstance)

      const { start_at, end_at } = calendarRangeToUtcIso(
        event.start,
        event.end,
        event.allDay,
      )

      try {
        if (isRecurringInstance) {
          setDragPreviewOverride({
            instanceId: event.id,
            start_at: normalizeDbTimestamp(start_at),
            end_at: normalizeDbTimestamp(end_at),
            all_day: event.allDay,
            fallbackEvent: snapshotFcEventForPreview(event, start_at, end_at),
          })
          const master = await fetchMasterEvent(masterId)
          setPendingRecurringAction({
            master,
            originalStartAt,
            form: {
              title: event.title,
              description: (event.extendedProps.description as string) ?? '',
              start_at,
              end_at,
              all_day: event.allDay,
              category: (event.extendedProps.category as CalendarEvent['category']) ?? 'work',
              recurrence: eventToRecurrenceRule(master),
            },
            revert: () => dropInfo.revert(),
          })
          return
        }

        await updateEvent(event.id, {
          start_at,
          end_at,
          all_day: event.allDay,
        })
      } catch (err) {
        clearDragPreview()
        dropInfo.revert()
        const reason = mapEventError(err instanceof Error ? err.message : '')
        showToast(EVENT_TOAST.updateFailure(reason), { variant: 'error' })
      }
    },
    [clearDragPreview, fetchMasterEvent, showToast, updateEvent],
  )

  const handleEventResize = useCallback(
    async (resizeInfo: EventResizeDoneArg) => {
      const event = resizeInfo.event
      if (!event.start) return

      const masterId = (event.extendedProps.masterId as string | undefined) ?? event.id
      const originalStartAt =
        (event.extendedProps.originalStartAt as string | undefined) ?? event.id
      const isRecurringInstance = Boolean(event.extendedProps.isRecurringInstance)

      const { start_at, end_at } = calendarRangeToUtcIso(
        event.start,
        event.end,
        event.allDay,
      )

      try {
        if (isRecurringInstance) {
          setDragPreviewOverride({
            instanceId: event.id,
            start_at: normalizeDbTimestamp(start_at),
            end_at: normalizeDbTimestamp(end_at),
            all_day: event.allDay,
            fallbackEvent: snapshotFcEventForPreview(event, start_at, end_at),
          })
          const master = await fetchMasterEvent(masterId)
          setPendingRecurringAction({
            master,
            originalStartAt,
            form: {
              title: event.title,
              description: (event.extendedProps.description as string) ?? '',
              start_at,
              end_at,
              all_day: event.allDay,
              category: (event.extendedProps.category as CalendarEvent['category']) ?? 'work',
              recurrence: eventToRecurrenceRule(master),
            },
            revert: () => resizeInfo.revert(),
          })
          return
        }

        await updateEvent(event.id, {
          start_at,
          end_at,
          all_day: event.allDay,
        })
      } catch (err) {
        clearDragPreview()
        resizeInfo.revert()
        const reason = mapEventError(err instanceof Error ? err.message : '')
        showToast(EVENT_TOAST.updateFailure(reason), { variant: 'error' })
      }
    },
    [clearDragPreview, fetchMasterEvent, showToast, updateEvent],
  )

  const handleSave = useCallback(
    async (form: EventFormData, eventId?: string): Promise<EventMutationResult> => {
      if (!user) return 'completed'

      if (eventId && selectedOriginalStartAt) {
        const master = await fetchMasterEvent(eventId)
        if (master.recurrence_freq) {
          if (recurrenceRuleChanged(master, form)) {
            await updateRecurringEvent(master, selectedOriginalStartAt, 'all', form)
            return 'completed'
          }

          setPendingRecurringAction({
            master,
            originalStartAt: selectedOriginalStartAt,
            form,
          })
          setIsModalOpen(false)
          return 'deferred'
        }
      }

      if (eventId) {
        await updateEvent(eventId, form)
      } else {
        await createEvent(form, user.id)
      }
      return 'completed'
    },
    [user, selectedOriginalStartAt, fetchMasterEvent, updateEvent, updateRecurringEvent, createEvent],
  )

  const handleDelete = useCallback(
    async (eventId: string): Promise<EventMutationResult> => {
      if (selectedOriginalStartAt) {
        const master = await fetchMasterEvent(eventId)
        if (master.recurrence_freq) {
          const remaining = await getRemainingRecurringOccurrences(master)
          setPendingRecurringDelete({
            master,
            originalStartAt: selectedOriginalStartAt,
            lastOne: remaining === 1,
          })
          setIsModalOpen(false)
          return 'deferred'
        }
      }

      await deleteEvent(eventId)
      return 'completed'
    },
    [deleteEvent, fetchMasterEvent, selectedOriginalStartAt],
  )

  const categoryEventStyles = useMemo(
    () =>
      EVENT_CATEGORIES.map(
        (cat) =>
          `.calendar-container .fc-event-cat-${cat.value}{--fc-event-bg-color:${cat.color};--fc-event-border-color:${cat.color};}`,
      ).join(''),
    [],
  )

  const handleEventClassNames = useCallback((arg: EventContentArg) => {
    const category =
      (arg.event.extendedProps.category as EventCategory | undefined) ?? DEFAULT_EVENT_CATEGORY
    return [`fc-event-cat-${category}`]
  }, [])

  return (
    <div className="calendar-container">
      <style>{categoryEventStyles}</style>
      {isLoading && <div className="calendar-loading">일정 불러오는 중...</div>}
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev next today',
          center: 'title',
          right: 'dayGridMonth timeGridWeek timeGridDay listWeek',
        }}
        locale="ko"
        timeZone="UTC"
        eventDisplay="block"
        now={getCalendarNow()}
        editable
        selectable
        selectMirror
        dayMaxEvents
        weekends
        events={displayCalendarEvents}
        datesSet={handleDatesSet}
        select={handleSelect}
        eventClick={handleEventClick}
        eventContent={renderCalendarEventContent}
        eventClassNames={handleEventClassNames}
        eventDrop={handleEventDrop}
        eventResize={handleEventResize}
        height="100%"
      />

      {isModalOpen && (
        <EventModal
          event={selectedEvent}
          initialRange={initialRange}
          isRecurringInstanceEdit={!!selectedOriginalStartAt}
          onSave={handleSave}
          onDelete={selectedEvent ? handleDelete : undefined}
          onClose={closeModal}
        />
      )}

      {pendingRecurringAction && (
        <ConfirmDialog
          title="반복 일정을 어떻게 수정할까요?"
          actions={[
            { label: '해당 일정만', onClick: () => void applyScope('this') },
            { label: '전체 일정', onClick: () => void applyScope('all') },
          ]}
          onClose={() => {
            pendingRecurringAction.revert?.()
            clearDragPreview()
            setPendingRecurringAction(null)
            if (!isModalOpen) {
              setSelectedEvent(null)
              setSelectedOriginalStartAt(null)
            }
          }}
        />
      )}

      {pendingRecurringDelete && (
        <ConfirmDialog
          title={
            pendingRecurringDelete.lastOne
              ? '전체 반복 일정을 삭제하시겠습니까?'
              : '반복 일정을 어떻게 삭제할까요?'
          }
          actions={
            pendingRecurringDelete.lastOne
              ? [
                  {
                    label: '전체 삭제',
                    variant: 'danger',
                    onClick: () => void executeRecurringDelete('all'),
                  },
                ]
              : [
                  {
                    label: '해당 일정만',
                    variant: 'danger',
                    onClick: () => void executeRecurringDelete('this'),
                  },
                  {
                    label: '전체 일정',
                    variant: 'danger',
                    onClick: () => void executeRecurringDelete('all'),
                  },
                ]
          }
          onClose={() => {
            setPendingRecurringDelete(null)
            if (!isModalOpen) closeModal()
          }}
        />
      )}
    </div>
  )
},
)
