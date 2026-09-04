/**
 * Extracted from pages/courses/CourseHomepage.jsx on 2026-09-04 (QF-02).
 * That file was 1,654 lines with five components in it; this is one of them,
 * moved verbatim. No behaviour changed -- only the address.
 */

import React from 'react'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'

import stripHtml from './stripHtml'

/**
 * CourseOverview - Default content when no quest is selected
 */
const CourseOverview = ({ course, quests, progress, onSelectQuest }) => {
  return (
    <div className="p-6">
      {/* Hero Image */}
      {course.cover_image_url && (
        <div className="mb-6 -mx-6 -mt-6">
          <img
            src={course.cover_image_url}
            alt={course.title}
            className="w-full h-48 sm:h-64 object-cover"
          />
        </div>
      )}

      {/* Course Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{course.title}</h1>
        {course.description && (
          <p className="text-gray-600">{stripHtml(course.description)}</p>
        )}
      </div>

      {/* Progress Card */}
      <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-2xl font-bold text-gray-900">
              {progress.earned_xp || 0}
            </span>
            <span className="text-sm text-gray-500 ml-1">/ {progress.total_xp || 0} XP</span>
          </div>
          <div className="text-right">
            {progress.percentage >= 100 ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-green-600">
                <CheckCircleSolid className="w-5 h-5" />
                Course Complete
              </span>
            ) : (
              <span className="text-sm text-gray-600">
                {progress.completed_quests} / {progress.total_quests} Projects
              </span>
            )}
          </div>
        </div>
        <div className="w-full bg-white/60 rounded-full h-2.5 mb-3">
          <div
            className={`h-2.5 rounded-full transition-all ${
              progress.percentage >= 100
                ? 'bg-green-500'
                : 'bg-gradient-primary'
            }`}
            style={{ width: `${Math.min(100, progress.percentage)}%` }}
          />
        </div>
        <p className="text-sm text-gray-500">
          Complete tasks in each project to earn XP and finish the course.
        </p>
      </div>

      {/* Projects Grid */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Projects</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {quests.map((quest, index) => {
          const isCompleted = quest.progress?.is_completed

          return (
            <div
              key={quest.id}
              onClick={() => onSelectQuest(quest)}
              className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-optio-purple/50 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-3">
                {/* Order Number */}
                <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-optio-purple/10 text-optio-purple rounded-full text-sm font-semibold">
                  {index + 1}
                </span>

                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 mb-1">{quest.title}</h3>
                  {quest.description && (
                    <p className="text-sm text-gray-500 line-clamp-2">
                      {stripHtml(quest.description)}
                    </p>
                  )}

                  {/* Progress */}
                  <div className="mt-3 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {(isCompleted || quest.progress?.can_complete) ? (
                        <span className="inline-flex items-center gap-1 text-sm text-green-600 font-medium">
                          <CheckCircleSolid className="w-4 h-4" />
                          Complete
                        </span>
                      ) : quest.progress?.total_xp > 0 ? (
                        <>
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-gradient-primary h-2 rounded-full"
                              style={{ width: `${quest.progress.percentage}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">
                            {quest.progress.earned_xp || 0}/{quest.progress.total_xp} XP
                          </span>
                        </>
                      ) : (
                        <span className="text-sm text-gray-500">Not started</span>
                      )}
                    </div>
                    {/* Task count */}
                    {quest.progress?.total_tasks > 0 && !isCompleted && (
                      <span className="text-xs text-gray-400">
                        {quest.progress.completed_tasks}/{quest.progress.total_tasks} tasks completed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default CourseOverview
