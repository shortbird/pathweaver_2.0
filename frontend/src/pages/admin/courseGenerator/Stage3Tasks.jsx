/**
 * Extracted from admin/CourseGeneratorWizard.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import React, { useState, useEffect, useCallback } from 'react'

const Stage3Tasks = ({
  courseId,
  projects,
  onGenerateTasks,
  onRegenerateTasks,
  onNext,
  loading
}) => {
  const [expandedLesson, setExpandedLesson] = useState(null)

  const hasTasks = projects.some(p =>
    p.lessons?.some(l => l.tasks && l.tasks.length > 0)
  )

  const totalTasks = projects.reduce((sum, p) =>
    sum + (p.lessons?.reduce((lSum, l) => lSum + (l.tasks?.length || 0), 0) || 0), 0
  )

  return (
    <div className="space-y-6">
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
        <p className="text-sm text-green-800">
          <strong>Tasks are where learning happens.</strong> Each task applies lesson knowledge through hands-on action.
          Students can also create their own tasks - these are starting suggestions.
        </p>
      </div>

      {!hasTasks ? (
        <div className="text-center py-12">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Generate Task Suggestions</h3>
          <p className="text-gray-500 mb-6">
            Create hands-on tasks for all lessons in your course
          </p>
          <button
            onClick={onGenerateTasks}
            disabled={loading}
            className="px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                Generating Tasks...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate All Tasks
              </>
            )}
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 text-center">
            {totalTasks} task suggestions generated
          </p>

          <div className="space-y-4">
            {projects.map((project, pIndex) => (
              <div key={project.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="p-4 bg-gray-50">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 bg-optio-purple text-white rounded-full flex items-center justify-center font-medium">
                      {pIndex + 1}
                    </span>
                    <h4 className="font-medium text-gray-900">{project.title}</h4>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {project.lessons?.map((lesson, lIndex) => (
                    <div key={lesson.id || lIndex} className="border border-gray-100 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedLesson(expandedLesson === lesson.id ? null : lesson.id)}
                        className="w-full p-3 bg-white flex items-center justify-between hover:bg-gray-50"
                      >
                        <span className="text-sm font-medium text-gray-700">
                          {lIndex + 1}. {lesson.title}
                          <span className="text-gray-400 ml-2">
                            ({lesson.tasks?.length || 0} tasks)
                          </span>
                        </span>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform ${
                            expandedLesson === lesson.id ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {expandedLesson === lesson.id && lesson.tasks && (
                        <div className="p-3 bg-gray-50 space-y-2">
                          {lesson.tasks.map((task, tIndex) => (
                            <div key={task.id || tIndex} className="p-3 bg-white rounded border border-gray-100">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <h6 className="text-sm font-medium text-gray-900">{task.title}</h6>
                                  <p className="text-xs text-gray-500 mt-1">{task.description}</p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className={`px-2 py-0.5 text-xs rounded ${
                                    task.pillar === 'creativity' ? 'bg-purple-100 text-purple-700' :
                                    task.pillar === 'knowledge' ? 'bg-blue-100 text-blue-700' :
                                    task.pillar === 'social' ? 'bg-green-100 text-green-700' :
                                    'bg-orange-100 text-orange-700'
                                  }`}>
                                    {task.pillar}
                                  </span>
                                  <span className="text-xs text-gray-400">{task.xp_value} XP</span>
                                </div>
                              </div>
                            </div>
                          ))}
                          <button
                            onClick={() => onRegenerateTasks(project.id, lesson.id)}
                            className="text-optio-purple hover:underline text-xs"
                          >
                            Regenerate tasks for this lesson
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={onNext}
            className="w-full py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 flex items-center justify-center gap-2"
          >
            Review and Publish
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}

// =============================================================================
// STAGE 4: REVIEW COMPONENT
// =============================================================================

export default Stage3Tasks
