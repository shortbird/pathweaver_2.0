import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  XMarkIcon,
  ChevronLeftIcon,
  FolderIcon,
  DocumentTextIcon,
  EyeIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import CurriculumView from '../curriculum/CurriculumView'
import { sanitizeHtml } from '../../utils/sanitize'

/**
 * StudentPreviewModal - Shows exactly what students see when viewing a course
 * Uses the actual CurriculumView component for authentic preview
 */
const StudentPreviewModal = ({
  course,
  projects, // Array of projects/quests in the course
  lessonsMap, // { projectId: lessons[] }
  tasksMap, // { lessonId: tasks[] }
  initialProjectId,
  initialLessonId,
  onClose,
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId || projects?.[0]?.id)
  const [selectedLessonId, setSelectedLessonId] = useState(initialLessonId)
  const [projectLessons, setProjectLessons] = useState({})
  const [loadingLessons, setLoadingLessons] = useState(false)
  const [viewMode, setViewMode] = useState('overview') // 'overview' | 'lesson'

  const selectedProject = projects?.find(p => p.id === selectedProjectId)

  // Fetch lessons when project is selected
  useEffect(() => {
    const fetchLessons = async () => {
      if (!selectedProjectId) return

      // Check if we have lessons from props
      if (lessonsMap?.[selectedProjectId]) {
        setProjectLessons(prev => ({
          ...prev,
          [selectedProjectId]: lessonsMap[selectedProjectId]
        }))
        return
      }

      // Check cache
      if (projectLessons[selectedProjectId]) return

      try {
        setLoadingLessons(true)
        const response = await api.get(`/api/quests/${selectedProjectId}/curriculum/lessons?include_unpublished=true`)
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
  }, [selectedProjectId, lessonsMap])

  // Get lessons for current project
  const currentLessons = projectLessons[selectedProjectId] || lessonsMap?.[selectedProjectId] || []

  // When opening lesson view, set the first lesson if none selected
  const handleViewLessons = () => {
    if (currentLessons.length > 0 && !selectedLessonId) {
      setSelectedLessonId(currentLessons[0].id)
    }
    setViewMode('lesson')
  }

  if (!course) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center">
      <div className="bg-white w-full h-full md:rounded-2xl md:max-w-[95vw] md:max-h-[95vh] md:w-[95vw] md:h-[95vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-optio-purple to-optio-pink p-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <EyeIcon className="w-6 h-6" />
              <div>
                <h2 className="text-lg font-bold">Student Preview</h2>
                <p className="text-sm text-white/80">
                  Exactly what students will see
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Close preview"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {viewMode === 'overview' ? (
            // Course Overview Mode
            <div className="h-full flex">
              {/* Left: Project List */}
              <div className="w-80 border-r border-gray-200 overflow-y-auto bg-gray-50">
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Course: {course.title}
                  </h3>
                  <div className="space-y-2">
                    {projects?.map((project, index) => {
                      const isSelected = selectedProjectId === project.id
                      const lessons = projectLessons[project.id] || lessonsMap?.[project.id] || []

                      return (
                        <button
                          key={project.id}
                          onClick={() => {
                            setSelectedProjectId(project.id)
                            setSelectedLessonId(null)
                          }}
                          className={`w-full text-left p-3 rounded-lg border transition-all ${
                            isSelected
                              ? 'border-optio-purple bg-white shadow-sm'
                              : 'border-transparent hover:bg-white hover:border-gray-200'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                              isSelected
                                ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
                                : 'bg-gray-200 text-gray-600'
                            }`}>
                              <FolderIcon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`font-medium truncate ${isSelected ? 'text-optio-purple' : 'text-gray-900'}`}>
                                {project.title}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {lessons.length} lesson{lessons.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Right: Project Details */}
              <div className="flex-1 overflow-y-auto">
                {selectedProject ? (
                  <div className="p-6">
                    {/* Project Header */}
                    {selectedProject.header_image_url && (
                      <div className="mb-6 rounded-xl overflow-hidden">
                        <img
                          src={selectedProject.header_image_url}
                          alt={selectedProject.title}
                          className="w-full h-48 object-cover"
                        />
                      </div>
                    )}

                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        {selectedProject.title}
                      </h2>
                      {selectedProject.description && (
                        <div
                          className="text-gray-600 prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedProject.description) }}
                        />
                      )}
                    </div>

                    {/* XP Threshold */}
                    {selectedProject.xp_threshold > 0 && (
                      <div className="mb-6 p-4 bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 rounded-xl">
                        <p className="text-sm font-medium text-gray-700">
                          Complete tasks worth <span className="font-bold text-optio-purple">{selectedProject.xp_threshold} XP</span> to finish this project
                        </p>
                      </div>
                    )}

                    {/* Lessons List */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">
                          Lessons ({currentLessons.length})
                        </h3>
                        {currentLessons.length > 0 && (
                          <button
                            onClick={handleViewLessons}
                            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity"
                          >
                            Start Lessons
                          </button>
                        )}
                      </div>

                      {loadingLessons ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="w-6 h-6 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : currentLessons.length > 0 ? (
                        <div className="space-y-3">
                          {currentLessons
                            .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0))
                            .map((lesson, index) => {
                              const steps = lesson.content?.steps || []

                              return (
                                <button
                                  key={lesson.id}
                                  onClick={() => {
                                    setSelectedLessonId(lesson.id)
                                    setViewMode('lesson')
                                  }}
                                  className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-optio-purple/50 hover:shadow-sm transition-all bg-white"
                                >
                                  <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
                                      {index + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-gray-900">
                                        {lesson.title}
                                      </p>
                                      {lesson.description && (
                                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                                          {lesson.description}
                                        </p>
                                      )}
                                      <p className="text-xs text-gray-500 mt-2">
                                        {steps.length} step{steps.length !== 1 ? 's' : ''}
                                      </p>
                                    </div>
                                    <DocumentTextIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                  </div>
                                </button>
                              )
                            })}
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <DocumentTextIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500">No lessons in this project yet</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <FolderIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">Select a project to preview</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Lesson View Mode - Use actual CurriculumView
            <div className="h-full flex flex-col">
              {/* Back button */}
              <div className="flex-shrink-0 px-4 py-2 border-b border-gray-200 bg-gray-50">
                <button
                  onClick={() => setViewMode('overview')}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                  Back to project overview
                </button>
              </div>

              {/* CurriculumView - The actual student view */}
              <div className="flex-1 overflow-hidden">
                <CurriculumView
                  lessons={currentLessons}
                  selectedLessonId={selectedLessonId}
                  onLessonSelect={(lesson) => setSelectedLessonId(lesson.id)}
                  questId={selectedProjectId}
                  isAdmin={false}
                  embedded={true}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Preview mode - changes will not be saved
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default StudentPreviewModal
