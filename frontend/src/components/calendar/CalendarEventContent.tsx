import type { EventContentArg } from '@fullcalendar/core'
import { TimerReset } from 'lucide-react'

function RecurringIcon() {
  return (
    <TimerReset
      className="fc-event-recurring-icon"
      size={12}
      strokeWidth={2.25}
      aria-hidden="true"
    />
  )
}

export function renderCalendarEventContent(arg: EventContentArg) {
  const isRecurringInstance = Boolean(arg.event.extendedProps.isRecurringInstance)
  const title = arg.event.title
  const showTime = Boolean(arg.timeText) && !arg.event.allDay
  const isListView = arg.view.type.startsWith('list')

  if (isListView) {
    return (
      <div className="fc-event-title fc-sticky">
        <span className="fc-event-inline-content">
          {isRecurringInstance && <RecurringIcon />}
          <span className="fc-event-title-text">{title}</span>
        </span>
      </div>
    )
  }

  return (
    <div className="fc-event-main-frame">
      {isRecurringInstance && <RecurringIcon />}
      {showTime && <div className="fc-event-time">{arg.timeText}</div>}
      <div className="fc-event-title-container">
        <div className="fc-event-title fc-sticky">
          <span className="fc-event-title-text">{title}</span>
        </div>
      </div>
    </div>
  )
}
