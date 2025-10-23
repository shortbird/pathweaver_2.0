import React from 'react'
import { Link } from 'react-router-dom'
import { XMarkIcon, CheckCircleIcon, CalendarIcon } from '@heroicons/react/24/outline'
import { getPillarColor } from '../../hooks/api/useCalendar'

const EventDetailModal = ({ event, onClose }) => {
  if (!event) return null

  const props = event.extendedProps
  const pillarColors = getPillarColor(props.pillar)
  const isCompleted = props.status === 'completed'

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Not scheduled'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" />

        {/* Modal */}
        <div
          className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative">
            {/* Quest Image */}
            {props.questImage && (
              <img
                src={props.questImage}
                alt=""
                className="w-full h-48 object-cover rounded-t-lg"
              />
            )}

            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors"
              aria-label="Close modal"
            >
              <XMarkIcon className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Status Badge */}
            {isCompleted && (
              <div className="flex items-center gap-2 mb-4 text-green-700">
                <CheckCircleIcon className="w-5 h-5" />
                <span className="font-medium">Completed</span>
              </div>
            )}

            {/* Quest Title */}
            <div className="mb-2">
              <span className="text-sm text-gray-600">Quest</span>
              <h2 className="text-xl font-bold text-gray-900">{props.questTitle}</h2>
            </div>

            {/* Task Title */}
            <div className="mb-4">
              <span className="text-sm text-gray-600">Task</span>
              <h3 className="text-lg font-semibold text-gray-800">{event.title}</h3>
            </div>

            {/* Task Description */}
            {props.task_description && (
              <div className="mb-4">
                <p className="text-gray-700">{props.task_description}</p>
              </div>
            )}

            {/* Metadata */}
            <div className="flex flex-wrap gap-4 mb-6">
              {/* Pillar */}
              <div>
                <span className="text-xs text-gray-600 block mb-1">Pillar</span>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${pillarColors.bg} ${pillarColors.text}`}>
                  {props.pillar}
                </span>
              </div>

              {/* XP Value */}
              {props.xpValue && (
                <div>
                  <span className="text-xs text-gray-600 block mb-1">XP Reward</span>
                  <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                    {props.xpValue} XP
                  </span>
                </div>
              )}

              {/* Scheduled Date */}
              {props.scheduled_date && (
                <div>
                  <span className="text-xs text-gray-600 block mb-1">Scheduled For</span>
                  <div className="flex items-center gap-1 text-sm text-gray-800">
                    <CalendarIcon className="w-4 h-4" />
                    <span>{formatDate(props.scheduled_date)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Evidence (if completed) */}
            {isCompleted && (props.evidenceText || props.evidenceUrl) && (
              <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
                <h4 className="font-semibold text-green-900 mb-2">Evidence Submitted</h4>
                {props.evidenceText && (
                  <p className="text-sm text-green-800 mb-2">{props.evidenceText}</p>
                )}
                {props.evidenceUrl && (
                  <a
                    href={props.evidenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-green-700 hover:text-green-900 underline"
                  >
                    View Evidence
                  </a>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <Link
                to={`/quests/${props.quest_id}`}
                className="flex-1 px-4 py-2 bg-gradient-to-r bg-gradient-primary text-white rounded-lg text-center font-medium hover:opacity-90 transition-opacity"
              >
                View Quest Details
              </Link>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default EventDetailModal
