import React, { useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import { useUpdateDeadline, getPillarColor } from '../../hooks/api/useCalendar'
import { useQueryClient } from '@tanstack/react-query'
import EventDetailModal from './EventDetailModal'
import logger from '../../utils/logger'

const CalendarView = ({ data, userId, selectedPillar }) => {
  const calendarRef = useRef(null)
  const queryClient = useQueryClient()
  const updateDeadline = useUpdateDeadline()
  const [selectedEvent, setSelectedEvent] = useState(null)

  // Helper to extract date-only portion (YYYY-MM-DD) from timestamps
  // This ensures tasks always appear on a single calendar day
  const extractDateOnly = (dateString) => {
    if (!dateString) return null
    // If already in YYYY-MM-DD format, return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString
    // Extract date portion from ISO timestamp (e.g., "2025-12-26T15:30:00Z" -> "2025-12-26")
    return dateString.split('T')[0]
  }

  // Filter and transform items for calendar
  const events = (data?.items || [])
    .filter(item => !selectedPillar || item.pillar === selectedPillar)
    .filter(item => item.scheduled_date || item.completed_at) // Show scheduled or completed tasks
    .map(item => {
      const pillarColors = getPillarColor(item.pillar)
      const isCompleted = item.status === 'completed'

      // Get the event date - use date-only format to ensure single-day rendering
      const eventDate = isCompleted
        ? extractDateOnly(item.completed_at)
        : extractDateOnly(item.scheduled_date)

      return {
        id: item.id,
        title: item.task_title,
        // Show completed tasks on their completion date, scheduled tasks on scheduled date
        date: eventDate,
        backgroundColor: pillarColors.hex,
        borderColor: pillarColors.hex,
        editable: !isCompleted, // Completed tasks cannot be dragged
        extendedProps: {
          ...item,
          questTitle: item.quest_title,
          questImage: item.quest_image,
          pillar: item.pillar,
          xpValue: item.xp_value,
          status: item.status,
          evidenceUrl: item.evidence_url,
          evidenceText: item.evidence_text,
          evidenceBlocks: item.evidence_blocks,
          evidenceType: item.evidence_type
        }
      }
    })

  // Handle event drop (drag and drop rescheduling)
  const handleEventDrop = async (info) => {
    const { event } = info
    const newDate = event.start.toISOString().split('T')[0]

    // Optimistically update the local cache to prevent snapback
    const previousData = queryClient.getQueryData(['calendar', userId])

    // Optimistically update the cache
    if (previousData) {
      queryClient.setQueryData(['calendar', userId], (old) => {
        return {
          ...old,
          items: old.items.map(item =>
            item.id === event.id
              ? { ...item, scheduled_date: newDate }
              : item
          )
        }
      })
    }

    try {
      // Mutate without automatic refetch
      await updateDeadline.mutateAsync({
        userId,
        questId: event.extendedProps.quest_id,
        taskId: event.id,
        scheduledDate: newDate
      })
      // Success - the cache is already updated
    } catch (error) {
      // Revert cache and UI on error
      queryClient.setQueryData(['calendar', userId], previousData)
      info.revert()
      logger.error('Failed to update deadline:', error)
    }
  }

  // Handle date click (selecting a date)
  const handleDateClick = (info) => {
    logger.debug('Date clicked:', info.dateStr)
    // Could open a modal to select tasks to schedule on this date
  }

  // Handle drop from external events (sidebar)
  const handleDrop = async (info) => {
    try {
      // Get the dropped item data
      const eventData = JSON.parse(info.draggedEl.dataset.event || '{}')
      const newDate = info.dateStr

      if (!eventData.id) {
        logger.error('No event data found')
        return
      }

      await updateDeadline.mutateAsync({
        userId,
        questId: eventData.questId,
        taskId: eventData.id,
        scheduledDate: newDate
      })
    } catch (error) {
      logger.error('Failed to schedule item:', error)
    }
  }

  // Handle drop zone styling
  const handleEventReceive = async (info) => {
    // This is called when an external event is dropped
    // But we're using handleDrop instead for better control
    info.event.remove()
  }

  // Handle event click (viewing task details)
  const handleEventClick = (info) => {
    setSelectedEvent(info.event)
  }

  // Custom event content - simple title only
  const renderEventContent = (eventInfo) => {
    const props = eventInfo.event.extendedProps
    const isCompleted = props.status === 'completed'

    return (
      <div className="flex items-center p-1 overflow-hidden">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">
            {eventInfo.event.title}
            {isCompleted && ' ✓'}
          </div>
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
        drop={handleDrop}
        eventReceive={handleEventReceive}
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
          week: 'Week',
          prev: '‹',
          next: '›'
        }}
        buttonIcons={{
          prev: 'none',
          next: 'none'
        }}
        eventClassNames={(arg) => {
          const status = arg.event.extendedProps.status
          if (status === 'completed') {
            return ['opacity-60', 'cursor-pointer', '!cursor-default']
          }
          if (status === 'wandering') {
            return ['ring-2', 'ring-yellow-400', 'cursor-move']
          }
          return ['cursor-move']
        }}
        // Accessibility
        navLinks={true}
      />

      {/* Legend - Pillar Colors */}
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#4BA3C3' }}></div>
          <span className="text-gray-600">STEM</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#B3393F' }}></div>
          <span className="text-gray-600">Wellness</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#58A55C' }}></div>
          <span className="text-gray-600">Communication</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#BE6B27' }}></div>
          <span className="text-gray-600">Civics</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#59189C' }}></div>
          <span className="text-gray-600">Art</span>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-4 p-3 bg-purple-50 rounded-lg">
        <p className="text-sm text-purple-900">
          <strong>Tip:</strong> Drag and drop events to reschedule them. Click an event to view details.
        </p>
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  )
}

export default CalendarView
