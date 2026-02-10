import React from 'react'
import { UsersIcon, BookOpenIcon, UserGroupIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline'

/**
 * ClassCard - Summary card for a class
 *
 * Displays:
 * - Class name and description
 * - Student count
 * - Quest count
 * - Advisor count
 * - XP threshold
 */
export default function ClassCard({ classData, onClick, onArchive }) {
  const {
    name,
    description,
    xp_threshold,
    student_count = 0,
    quest_count = 0,
    advisor_count = 0,
    status,
  } = classData

  const isArchived = status === 'archived'

  return (
    <div
      className={`
        bg-white rounded-lg border border-gray-200 p-4
        hover:shadow-md hover:border-optio-purple/30
        transition-all cursor-pointer
        ${isArchived ? 'opacity-60' : ''}
      `}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{name}</h3>
          {description && (
            <p className="text-sm text-gray-500 line-clamp-2 mt-1">{description}</p>
          )}
        </div>
        {isArchived && (
          <span className="flex-shrink-0 ml-2 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
            Archived
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
        <div className="flex items-center gap-1.5">
          <UsersIcon className="w-4 h-4 text-optio-purple" />
          <span>{student_count} student{student_count !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <BookOpenIcon className="w-4 h-4 text-optio-pink" />
          <span>{quest_count} quest{quest_count !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <UserGroupIcon className="w-4 h-4 text-gray-400" />
          <span>{advisor_count}</span>
        </div>
      </div>

      {/* XP Threshold */}
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="text-gray-500">Completion:</span>
          <span className="ml-1 font-medium text-optio-purple">{xp_threshold} XP</span>
        </div>

        {/* Archive button */}
        {onArchive && !isArchived && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onArchive()
            }}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
            title="Archive class"
          >
            <ArchiveBoxIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
