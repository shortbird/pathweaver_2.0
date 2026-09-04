/**
 * Extracted from pages/courses/CourseHomepage.jsx on 2026-09-04 (QF-02).
 * That file was 1,654 lines with five components in it; this is one of them,
 * moved verbatim. No behaviour changed -- only the address.
 */

import React from 'react'
import { CheckCircleIcon as CheckCircleSolid, ExclamationCircleIcon } from '@heroicons/react/24/solid'

/**
 * ExpandableQuestItem - Sidebar quest item with XP and task progress
 */
const ExpandableQuestItem = ({
  quest,
  index,
  isSelected,
  onSelectQuest,
  isNextStep,
}) => {
  const isCompleted = quest.progress?.is_completed
  const canComplete = quest.progress?.can_complete
  const hasXP = quest.progress?.total_xp > 0
  const xpText = hasXP
    ? `${quest.progress.earned_xp || 0}/${quest.progress.total_xp} XP`
    : null

  const progressPercent = quest.progress?.percentage || 0

  // Show incomplete required tasks warning
  const hasIncompleteRequired = quest.progress?.total_required_tasks > 0 &&
    quest.progress?.completed_required_tasks < quest.progress?.total_required_tasks

  return (
    <div className="mb-2">
      {/* Quest Header */}
      <div
        onClick={() => onSelectQuest(quest)}
        className={`relative overflow-hidden flex items-center gap-2 p-3 rounded-lg transition-all cursor-pointer ${
          isSelected
            ? 'bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 border-2 border-optio-purple'
            : isNextStep && !isCompleted && !canComplete
              ? 'bg-white border border-gray-200 border-l-[3px] border-l-optio-purple hover:border-optio-purple/50'
              : 'bg-white border border-gray-200 hover:border-optio-purple/50'
        }`}
      >
        {/* Progress bar background */}
        {progressPercent > 0 && !isCompleted && !canComplete && (
          <div
            className="absolute inset-y-0 left-0 bg-optio-purple/15 transition-all duration-300"
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
        )}

        {/* Order Number */}
        <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-optio-purple/10 text-optio-purple rounded-full text-xs font-medium">
          {index + 1}
        </span>

        {/* Quest Title and Info */}
        <div className="flex-1 min-w-0 relative">
          <h4 className="font-medium text-gray-900 text-sm leading-snug truncate">
            {quest.title || 'Untitled Project'}
          </h4>
          {/* XP and Progress on same row */}
          {(xpText || (hasXP && !isCompleted && !canComplete)) && (
            <div className="flex justify-between items-center">
              {xpText && (
                <span className="text-xs text-gray-500">{xpText}</span>
              )}
              {hasXP && !isCompleted && !canComplete && (
                <span className="text-xs text-gray-500">
                  {Math.round(Math.min(progressPercent, 100))}%
                </span>
              )}
            </div>
          )}
          {/* Task progress */}
          {quest.progress?.total_tasks > 0 && !isCompleted && !canComplete && (
            <span className="text-xs text-gray-400">
              {quest.progress.completed_tasks}/{quest.progress.total_tasks} tasks
            </span>
          )}
          {/* Show required tasks warning if XP met but required tasks incomplete */}
          {hasIncompleteRequired && progressPercent >= 100 && !isCompleted && (
            <span className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
              <ExclamationCircleIcon className="w-3 h-3" />
              {quest.progress?.completed_required_tasks}/{quest.progress?.total_required_tasks} required
            </span>
          )}
        </div>

        {/* Completion Status */}
        {(isCompleted || canComplete) ? (
          <CheckCircleSolid className="w-5 h-5 text-green-500 flex-shrink-0" />
        ) : null}
      </div>
    </div>
  )
}

export default ExpandableQuestItem
