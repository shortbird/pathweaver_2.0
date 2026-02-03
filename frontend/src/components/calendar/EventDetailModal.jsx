import React from 'react'
import { Link } from 'react-router-dom'
import { CheckCircleIcon, CalendarIcon } from '@heroicons/react/24/outline'
import { getPillarColor } from '../../hooks/api/useCalendar'
import UnifiedEvidenceDisplay from '../evidence/UnifiedEvidenceDisplay'
import { Modal } from '../ui'

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
    <Modal
      isOpen={true}
      onClose={onClose}
      size="md"
      showCloseButton={true}
      header={
        props.questImage && (
          <img
            src={props.questImage}
            alt={`${props.questTitle} quest banner`}
            className="w-full h-48 object-cover rounded-t-lg -m-6 mb-0"
          />
        )
      }
      headerClassName={props.questImage ? "p-0" : ""}
    >
      <div className="space-y-6">
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
                  {pillarColors.display}
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
            {isCompleted && (props.evidenceText || props.evidenceUrl || (props.evidenceBlocks && props.evidenceBlocks.length > 0)) && (
              <div className="mb-6">
                <h4 className="font-semibold text-gray-900 mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Evidence Submitted
                </h4>
                <UnifiedEvidenceDisplay
                  evidence={{
                    evidence_type: props.evidenceType || (props.evidenceBlocks?.length > 0 ? 'multi_format' : 'legacy_text'),
                    evidence_blocks: props.evidenceBlocks,
                    evidence_text: props.evidenceText,
                    evidence_url: props.evidenceUrl
                  }}
                  displayMode="full"
                  showMetadata={false}
                  allowPrivateBlocks={true}
                />
              </div>
            )}

        {/* Actions */}
        <div className="flex gap-3">
          <Link
            to={`/quests/${props.quest_id}`}
            className="flex-1 px-4 py-2 bg-gradient-primary text-white rounded-lg text-center font-medium hover:opacity-90 transition-opacity"
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
    </Modal>
  )
}

export default EventDetailModal
