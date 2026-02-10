import React from 'react'
import { TrashIcon, CheckCircleIcon, UserCircleIcon } from '@heroicons/react/24/outline'

/**
 * StudentProgressCard - Display student with XP progress bar
 */
export default function StudentProgressCard({ enrollment, xpThreshold, onWithdraw }) {
  const student = enrollment.student || {}
  const progress = enrollment.progress || {}

  const displayName =
    student.display_name ||
    `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
    student.email ||
    'Unknown Student'

  const earnedXp = progress.earned_xp || 0
  const percentage = progress.percentage || 0
  const isComplete = progress.is_complete || false

  return (
    <div
      className={`
        bg-white rounded-lg border p-4
        ${isComplete ? 'border-green-200 bg-green-50/50' : 'border-gray-200'}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
            <UserCircleIcon className="w-8 h-8 text-gray-400" />
          </div>
          <div>
            <p className="font-medium text-gray-900">{displayName}</p>
            {student.email && displayName !== student.email && (
              <p className="text-xs text-gray-500">{student.email}</p>
            )}
          </div>
        </div>
        {isComplete && (
          <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0" />
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-gray-600">Progress</span>
          <span className={`font-medium ${isComplete ? 'text-green-600' : 'text-optio-purple'}`}>
            {earnedXp} / {xpThreshold} XP
          </span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isComplete
                ? 'bg-green-500'
                : 'bg-gradient-to-r from-optio-purple to-optio-pink'
            }`}
            style={{ width: `${Math.min(100, percentage)}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {percentage}% complete
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            isComplete
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {isComplete ? 'Completed' : 'In Progress'}
        </span>
        {onWithdraw && (
          <button
            onClick={onWithdraw}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
            title="Withdraw student"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
