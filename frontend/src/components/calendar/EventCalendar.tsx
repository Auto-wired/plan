import { useCallback, useImperativeHandle, useMemo, useState, forwardRef } from 'react'
import { matchesCategoryFilter, type EventCategory } from '../../lib/categories'
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
} from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import { useAuth } from '../../hooks/useAuth'
import { useEvents } from '../../hooks/useEvents'
import {
  calendarDateToUtcIso,
  calendarRangeToUtcIso,
} from '../../lib/datetime'
import type { CalendarEvent, DateRange, EventFormData, RecurrenceScope } from '../../types'
import { eventToRecurrenceRule, recurrenceRuleChanged } from '../../lib/eventMapper'
import { EventModal } from './EventModal'
import { RecurrenceScopeDialog, type RecurrenceScopeChoice } from './RecurrenceScopeDialog'
import './EventCalendar.css'

interface EventCalendarProps {
  selectedCategories?: EventCategory[]
}

export interface EventCalendarHandle {
  openEventForEdit: (event: CalendarEvent) => void
}

interface PendingRecurringAction {
  mode: 'edit' | 'delete'
  master: CalendarEvent
  originalStartAt: string
  form?: EventFormData
}

export const EventCalendar = forwardRef<EventCalendarHandle, EventCalendarProps>(
  function EventCalendar({ selectedCategories = [] }, ref) {
  const { user } = useAuth()
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

  const applyScope = useCallback(
    async (scope: RecurrenceScopeChoice) => {
      if (!pendingRecurringAction) return

      const { mode, master, originalStartAt, form } = pendingRecurringAction
      const recurrenceScope = scope as RecurrenceScope

      if (mode === 'delete') {
        const confirmed = confirm(
          recurrenceScope === 'all'
            ? '전체 반복 일정을 삭제하시겠습니까?'
            : '이 일정을 삭제하시겠습니까?',
        )
        if (!confirmed) {
          setPendingRecurringAction(null)
          return
        }
        await deleteRecurringEventByScope(master, originalStartAt, recurrenceScope)
        closeModal()
      } else if (form) {
        await updateRecurringEvent(master, originalStartAt, recurrenceScope, form)
        closeModal()
      }

      setPendingRecurringAction(null)
    },
    [deleteRecurringEventByScope, pendingRecurringAction, updateRecurringEvent],
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
          const master = await fetchMasterEvent(masterId)
          setPendingRecurringAction({
            mode: 'edit',
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
          })
          dropInfo.revert()
          return
        }

        await updateEvent(event.id, {
          start_at,
          end_at,
          all_day: event.allDay,
        })
      } catch {
        dropInfo.revert()
      }
    },
    [fetchMasterEvent, updateEvent],
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
          const master = await fetchMasterEvent(masterId)
          setPendingRecurringAction({
            mode: 'edit',
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
          })
          resizeInfo.revert()
          return
        }

        await updateEvent(event.id, {
          start_at,
          end_at,
          all_day: event.allDay,
        })
      } catch {
        resizeInfo.revert()
      }
    },
    [fetchMasterEvent, updateEvent],
  )

  const handleSave = useCallback(
    async (form: EventFormData, eventId?: string) => {
      if (!user) return

      if (eventId && selectedOriginalStartAt) {
        const master = await fetchMasterEvent(eventId)
        if (master.recurrence_freq) {
          if (recurrenceRuleChanged(master, form)) {
            await updateRecurringEvent(master, selectedOriginalStartAt, 'all', form)
            return
          }

          setPendingRecurringAction({
            mode: 'edit',
            master,
            originalStartAt: selectedOriginalStartAt,
            form,
          })
          setIsModalOpen(false)
          return
        }
      }

      if (eventId) {
        await updateEvent(eventId, form)
      } else {
        await createEvent(form, user.id)
      }
    },
    [user, selectedOriginalStartAt, fetchMasterEvent, updateEvent, updateRecurringEvent, createEvent],
  )

  const handleDelete = useCallback(
    async (eventId: string) => {
      if (selectedOriginalStartAt) {
        const master = await fetchMasterEvent(eventId)
        if (master.recurrence_freq) {
          setPendingRecurringAction({
            mode: 'delete',
            master,
            originalStartAt: selectedOriginalStartAt,
          })
          setIsModalOpen(false)
          return
        }
      }

      await deleteEvent(eventId)
    },
    [deleteEvent, fetchMasterEvent, selectedOriginalStartAt],
  )

  const closeModal = () => {
    setIsModalOpen(false)
    setSelectedEvent(null)
    setSelectedOriginalStartAt(null)
    setInitialRange(null)
  }

  return (
    <div className="calendar-container">
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
        editable
        selectable
        selectMirror
        dayMaxEvents
        weekends
        events={filteredCalendarEvents}
        datesSet={handleDatesSet}
        select={handleSelect}
        eventClick={handleEventClick}
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
        <RecurrenceScopeDialog
          mode={pendingRecurringAction.mode}
          onSelect={(scope) => void applyScope(scope)}
          onClose={() => {
            setPendingRecurringAction(null)
            if (!isModalOpen) {
              setSelectedEvent(null)
              setSelectedOriginalStartAt(null)
            }
          }}
        />
      )}
    </div>
  )
},
)
