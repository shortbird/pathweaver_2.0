import React, { useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import { useUpdateDeadline, getPillarColor } from '../../hooks/api/useCalendar'
import { useQueryClient } from '@tanstack/react-query'

const CalendarView = ({ data, userId, selectedPillar }) => {
  const calendarRef = useRef(null)
  const queryClient = useQueryClient()
  const updateDeadline = useUpdateDeadline()

  // Filter and transform items for calendar
  const events = (data?.items || [])
    .filter(item => !selectedPillar || item.pillar === selectedPillar)
    .filter(item => item.scheduled_date || item.completed_at) // Only show scheduled or completed
    .map(item => {
      const pillarColors = getPillarColor(item.pillar)

      return {
        id: item.id,
        title: item.task_title,
        date: item.scheduled_date || item.completed_at,
        backgroundColor: pillarColors.hex,
        borderColor: pillarColors.hex,
        extendedProps: {
          ...item,
          questTitle: item.quest_title,
          questImage: item.quest_image,
          pillar: item.pillar,
          xpValue: item.xp_value,
          status: item.status,
          evidenceUrl: item.evidence_url,
          evidenceText: item.evidence_text
        }
      }
    })

  // Handle event drop (drag and drop rescheduling)
  const handleEventDrop = async (info) => {
    const { event } = info
    const newDate = event.start.toISOString().split('T')[0]

    try {
      await updateDeadline.mutateAsync({
        userId,
        questId: event.extendedProps.quest_id,
        taskId: event.id,
        scheduledDate: newDate
      })
    } catch (error) {
      // Revert on error
      info.revert()
      console.error('Failed to update deadline:', error)
    }
  }

  // Handle date click (selecting a date)
  const handleDateClick = (info) => {
    console.log('Date clicked:', info.dateStr)
    // Could open a modal to select tasks to schedule on this date
  }

  // Handle event click (viewing task details)
  const handleEventClick = (info) => {
    const props = info.event.extendedProps
    // Navigate to quest detail
    window.location.href = `/quests/${props.quest_id}`
  }

  // Custom event content with quest image and status
  const renderEventContent = (eventInfo) => {
    const props = eventInfo.event.extendedProps
    const isCompleted = props.status === 'completed'

    return (
      <div className="flex items-center gap-2 p-1 overflow-hidden">
        {props.questImage && (
          <img
            src={props.questImage}
            alt=""
            className="w-6 h-6 rounded object-cover flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">
            {eventInfo.event.title}
            {isCompleted && ' ✓'}
          </div>
          {props.xpValue && (
            <div className="text-xs opacity-90">{props.xpValue} XP</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6" id="calendar-panel" role="tabpanel">
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        events={events}
        editable={true}
        droppable={true}
        eventDrop={handleEventDrop}
        dateClick={handleDateClick}
        eventClick={handleEventClick}
        eventContent={renderEventContent}
        height="auto"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,dayGridWeek'
        }}
        buttonText={{
          today: 'Today',
          month: 'Month',
          week: 'Week'
        }}
        eventClassNames={(arg) => {
          const status = arg.event.extendedProps.status
          if (status === 'completed') {
            return ['opacity-60', 'cursor-pointer']
          }
          if (status === 'wandering') {
            return ['ring-2', 'ring-yellow-400', 'cursor-move']
          }
          return ['cursor-move']
        }}
        // Accessibility
        navLinks={true}
      />

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="text-gray-600">Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span className="text-gray-600">On Track</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-500 ring-2 ring-yellow-400"></div>
          <span className="text-gray-600">Ready for a Pivot</span>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-4 p-3 bg-purple-50 rounded-lg">
        <p className="text-sm text-purple-900">
          <strong>Tip:</strong> Drag and drop events to reschedule them. Click an event to view quest details.
        </p>
      </div>
    </div>
  )
}

export default CalendarView
