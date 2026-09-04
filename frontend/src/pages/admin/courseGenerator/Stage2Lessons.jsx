/**
 * Extracted from admin/CourseGeneratorWizard.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import React, { useState, useEffect, useCallback } from 'react'

const Stage2Lessons = ({
  courseId,
  projects,
  onGenerateLessons,
  onRegenerateLessons,
  onNext,
  loading
}) => {
  const [expandedProject, setExpandedProject] = useState(null)
  const [regeneratingLesson, setRegeneratingLesson] = useState(null)

  const hasLessons = projects.some(p => p.lessons && p.lessons.length > 0)

  return (
    <div className="space-y-6">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Just-in-Time Teaching:</strong> Lessons provide just enough info to make a competent first attempt.
          Students learn by doing - these lessons prepare them for hands-on tasks.
        </p>
      </div>

      {!hasLessons ? (
        <div className="text-center py-12">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Generate Lessons</h3>
          <p className="text-gray-500 mb-6">
            Create lessons for all {projects.length} projects in your course
          </p>
          <button
            onClick={onGenerateLessons}
            disabled={loading}
            className="px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                Generating Lessons...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate All Lessons
              </>
            )}
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {projects.map((project, pIndex) => (
              <div key={project.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedProject(expandedProject === project.id ? null : project.id)}
                  className="w-full p-4 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 bg-optio-purple text-white rounded-full flex items-center justify-center font-medium">
                      {pIndex + 1}
                    </span>
                    <div className="text-left">
                      <h4 className="font-medium text-gray-900">{project.title}</h4>
                      <p className="text-sm text-gray-500">
                        {project.lessons?.length || 0} lessons
                      </p>
                    </div>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      expandedProject === project.id ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {expandedProject === project.id && (
                  <div className="p-4 space-y-3">
                    {project.lessons?.map((lesson, lIndex) => (
                      <div key={lesson.id || lIndex} className="p-3 bg-white border border-gray-100 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div>
                            <h5 className="font-medium text-gray-900 text-sm">
                              {lIndex + 1}. {lesson.title}
                            </h5>
                            <p className="text-xs text-gray-500 mt-1">{lesson.description}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {lesson.steps?.length || lesson.content?.steps?.length || 0} steps
                            </p>
                          </div>
                          <button
                            onClick={() => onRegenerateLessons(project.id, lesson.id)}
                            disabled={regeneratingLesson === lesson.id}
                            className="text-optio-purple hover:underline text-xs"
                          >
                            {regeneratingLesson === lesson.id ? 'Regenerating...' : 'Regenerate'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={onNext}
            className="w-full py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 flex items-center justify-center gap-2"
          >
            Continue to Tasks
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
// STAGE 3: TASKS COMPONENT
// =============================================================================

export default Stage2Lessons
