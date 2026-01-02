import React, { useState, useEffect } from 'react'
import { XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import { sanitizeHtml } from '../utils/sanitize'

// Helper to extract HTML content from lesson content structure
const getLessonHtmlContent = (content) => {
  if (!content) return ''

  // If content is already a string (legacy or raw HTML), return it
  if (typeof content === 'string') return content

  // If content is an object with blocks array, extract text block content
  if (content.blocks && Array.isArray(content.blocks)) {
    return content.blocks
      .filter(block => block.type === 'text')
      .map(block => block.content || '')
      .join('')
  }

  return ''
}

const CoursePreview = ({ course, quests, onClose }) => {
  const [simulatedXp, setSimulatedXp] = useState(0)
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [projectLessons, setProjectLessons] = useState({}) // Cache lessons by project ID
  const [loadingLessons, setLoadingLessons] = useState(false)

  // Fetch lessons when a project is selected
  useEffect(() => {
    const fetchLessons = async () => {
      if (!selectedProjectId) return

      // Check cache first
      if (projectLessons[selectedProjectId]) return

      try {
        setLoadingLessons(true)
        const response = await api.get(`/api/quests/${selectedProjectId}/curriculum/lessons`)
        setProjectLessons(prev => ({
          ...prev,
          [selectedProjectId]: response.data.lessons || []
        }))
      } catch (error) {
        console.error('Failed to load lessons:', error)
        setProjectLessons(prev => ({
          ...prev,
          [selectedProjectId]: []
        }))
      } finally {
        setLoadingLessons(false)
      }
    }

    fetchLessons()
  }, [selectedProjectId])

  if (!course) return null

  // Calculate max XP needed based on all thresholds (project + lesson)
  const maxXpNeeded = Math.max(
    ...quests.map(q => q.xp_threshold || 0),
    ...quests.flatMap(q =>
      (q.curriculum_content?.lessons || []).map(l => l.xp_threshold || 0)
    ),
    100
  )

  const isProjectComplete = (project) => {
    // Project XP threshold is stored directly on the project object (from course_quests table)
    const projectXpThreshold = project.xp_threshold || 0
    return projectXpThreshold === 0 || simulatedXp >= projectXpThreshold
  }

  const isLessonComplete = (lesson) => {
    const lessonXpThreshold = lesson.xp_threshold || 0
    return lessonXpThreshold === 0 || simulatedXp >= lessonXpThreshold
  }

  const selectedProject = quests.find(q => q.id === selectedProjectId)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Student Preview</h2>
            <p className="text-sm text-gray-600 mt-1">
              See what your students will experience
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close preview"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* XP Simulator - Compact */}
        <div className="px-6 py-2 bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <label className="text-xs font-medium text-gray-600 whitespace-nowrap">
              Student XP: <span className="font-bold text-optio-purple">{simulatedXp}</span>
            </label>
            <input
              type="range"
              min="0"
              max={maxXpNeeded}
              value={simulatedXp}
              onChange={(e) => setSimulatedXp(parseInt(e.target.value))}
              className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-optio-purple"
            />
            <span className="text-xs text-gray-400">{maxXpNeeded} XP</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left: Course Overview */}
          <div className="w-2/5 border-r border-gray-200 overflow-y-auto p-6">
            {/* Cover Image */}
            {course.cover_url && (
              <div className="mb-6 rounded-lg overflow-hidden">
                <img
                  src={course.cover_url}
                  alt={course.title}
                  className="w-full h-48 object-cover"
                />
              </div>
            )}

            {/* Course Info */}
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">{course.title}</h3>
              {course.description && (
                <p className="text-gray-600 text-sm">{course.description}</p>
              )}
            </div>

            {/* Projects List */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Projects ({quests.length})
              </h4>
              <div className="space-y-2">
                {quests.map((project, index) => {
                  const isComplete = isProjectComplete(project)
                  const xpThreshold = project.xp_threshold || 0
                  const isSelected = selectedProjectId === project.id

                  return (
                    <button
                      key={project.id}
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`w-full text-left p-4 rounded-lg border transition-all ${
                        isSelected
                          ? 'border-optio-purple bg-optio-purple/5'
                          : 'border-gray-200 hover:border-optio-purple/50 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {isComplete ? (
                            <CheckCircleIcon className="w-5 h-5 text-green-600" />
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-500">
                              {index + 1}
                            </span>
                            <h5 className="font-medium truncate text-gray-900">
                              {project.title}
                            </h5>
                          </div>
                          {xpThreshold > 0 && (
                            <p className={`text-xs mt-1 ${isComplete ? 'text-green-600' : 'text-gray-500'}`}>
                              {isComplete ? `${xpThreshold} XP requirement met` : `Requires ${xpThreshold} XP to complete`}
                            </p>
                          )}
                          {project.description && (
                            <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                              {project.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right: Project Details */}
          <div className="flex-1 overflow-y-auto p-6">
            {selectedProject ? (
              <div>
                {/* Project Header */}
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {selectedProject.title}
                  </h3>
                  {selectedProject.description && (
                    <p className="text-gray-600">{selectedProject.description}</p>
                  )}
                </div>

                {/* Lessons */}
                {loadingLessons ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (projectLessons[selectedProjectId] || []).length > 0 ? (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                      Lessons ({(projectLessons[selectedProjectId] || []).length})
                    </h4>
                    <div className="space-y-3">
                      {(projectLessons[selectedProjectId] || [])
                        .sort((a, b) => (a.sequence_order || a.order || 0) - (b.sequence_order || b.order || 0))
                        .map((lesson, index) => {
                          const isComplete = isLessonComplete(lesson)
                          const xpThreshold = lesson.xp_threshold || 0

                          return (
                            <div
                              key={lesson.id || index}
                              className="p-4 rounded-lg border border-gray-200 bg-white"
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 mt-0.5">
                                  {isComplete ? (
                                    <CheckCircleIcon className="w-5 h-5 text-green-600" />
                                  ) : (
                                    <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <h5 className="font-medium text-gray-900">
                                    {lesson.title}
                                  </h5>
                                  {xpThreshold > 0 && (
                                    <p className={`text-xs mt-1 ${isComplete ? 'text-green-600' : 'text-gray-500'}`}>
                                      {isComplete ? `${xpThreshold} XP requirement met` : `Requires ${xpThreshold} XP to complete`}
                                    </p>
                                  )}
                                  {lesson.content && getLessonHtmlContent(lesson.content) && (
                                    <div
                                      className="prose prose-sm max-w-none mt-2 text-gray-600"
                                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(getLessonHtmlContent(lesson.content)) }}
                                    />
                                  )}
                                  {lesson.video_url && (
                                    <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                                      </svg>
                                      Includes video
                                    </div>
                                  )}
                                  {lesson.files && lesson.files.length > 0 && (
                                    <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                                      </svg>
                                      {lesson.files.length} attachment{lesson.files.length !== 1 ? 's' : ''}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500">No lessons added to this project yet</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                    </svg>
                  </div>
                  <p className="text-gray-500">Select a project to view its lessons</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  )
}

export default CoursePreview
