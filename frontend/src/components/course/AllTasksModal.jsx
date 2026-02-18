import React, { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  XMarkIcon,
  TrashIcon,
  ArrowsRightLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  DocumentTextIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline'

const PILLAR_COLORS = {
  knowledge: 'bg-blue-100 text-blue-700',
  skill: 'bg-green-100 text-green-700',
  character: 'bg-purple-100 text-purple-700',
  mindset: 'bg-orange-100 text-orange-700',
}

/**
 * AllTasksModal - Shows all tasks across all lessons in a course,
 * grouped by project > lesson. Supports deleting and moving tasks.
 */
const AllTasksModal = ({
  isOpen,
  onClose,
  quests,
  lessonsMap,
  tasksMap,
  onUnlinkTask,
  onMoveTask,
  onSelectItem,
  onFetchAllTasks,
}) => {
  const [collapsedProjects, setCollapsedProjects] = useState({})
  const [movingTask, setMovingTask] = useState(null) // { task, lessonId }
  const [loading, setLoading] = useState(false)

  // Stable ref so the effect only fires when isOpen changes, not on callback identity changes
  const fetchRef = useRef(onFetchAllTasks)
  fetchRef.current = onFetchAllTasks

  // Fetch all tasks once when modal opens
  useEffect(() => {
    if (isOpen && fetchRef.current) {
      setLoading(true)
      Promise.resolve(fetchRef.current()).finally(() => setLoading(false))
    }
  }, [isOpen])

  // Build structured data: projects with lessons with tasks
  const projectData = useMemo(() => {
    return quests.map(quest => {
      const lessons = (lessonsMap[quest.id] || []).map(lesson => ({
        ...lesson,
        questId: quest.id,
        tasks: tasksMap[lesson.id] || [],
      }))
      const totalTasks = lessons.reduce((sum, l) => sum + l.tasks.length, 0)
      return { ...quest, lessons, totalTasks }
    })
  }, [quests, lessonsMap, tasksMap])

  const totalTaskCount = useMemo(
    () => projectData.reduce((sum, p) => sum + p.totalTasks, 0),
    [projectData]
  )

  // All lessons for the move dropdown, grouped by project
  const allLessons = useMemo(() => {
    return quests.map(quest => ({
      quest,
      lessons: lessonsMap[quest.id] || [],
    }))
  }, [quests, lessonsMap])

  const toggleProject = (projectId) => {
    setCollapsedProjects(prev => ({ ...prev, [projectId]: !prev[projectId] }))
  }

  const handleDelete = (task, lesson) => {
    onUnlinkTask(task, lesson)
  }

  const handleStartMove = (task, lessonId) => {
    setMovingTask({ task, lessonId })
  }

  const handleConfirmMove = (targetLessonId) => {
    if (movingTask) {
      onMoveTask(movingTask.task, movingTask.lessonId, targetLessonId)
      setMovingTask(null)
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center">
      <div className="bg-white w-full h-full md:rounded-2xl md:max-w-[95vw] md:max-h-[95vh] md:w-[95vw] md:h-[95vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-optio-purple to-optio-pink p-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardDocumentListIcon className="w-6 h-6" />
              <div>
                <h2 className="text-lg font-bold">All Course Tasks</h2>
                <p className="text-sm text-white/80">
                  {totalTaskCount} task{totalTaskCount !== 1 ? 's' : ''} across {quests.length} project{quests.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-gray-500">Loading tasks...</span>
            </div>
          ) : totalTaskCount === 0 ? (
            <div className="text-center py-12">
              <ClipboardDocumentListIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-lg font-medium">No tasks yet</p>
              <p className="text-gray-400 text-sm mt-1">Add tasks to lessons in the course builder</p>
            </div>
          ) : (
            <div className="space-y-4">
              {projectData.map(project => (
                <div key={project.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Project Header */}
                  <button
                    onClick={() => toggleProject(project.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                  >
                    {collapsedProjects[project.id] ? (
                      <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    )}
                    <FolderIcon className="w-5 h-5 text-optio-purple flex-shrink-0" />
                    <span className="font-semibold text-gray-900 flex-1">{project.title}</span>
                    <span className="text-sm text-gray-500">
                      {project.totalTasks} task{project.totalTasks !== 1 ? 's' : ''}
                    </span>
                  </button>

                  {/* Lessons with Tasks */}
                  {!collapsedProjects[project.id] && (
                    <div className="divide-y divide-gray-100">
                      {project.lessons.map(lesson => (
                        <div key={lesson.id}>
                          {/* Lesson Header */}
                          <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-100">
                            <DocumentTextIcon className="w-4 h-4 text-gray-400 flex-shrink-0 ml-6" />
                            <span className="text-sm font-medium text-gray-700">{lesson.title}</span>
                            <span className="text-xs text-gray-400">
                              ({lesson.tasks.length} task{lesson.tasks.length !== 1 ? 's' : ''})
                            </span>
                          </div>

                          {/* Tasks */}
                          {lesson.tasks.length > 0 ? (
                            <div className="bg-white">
                              {lesson.tasks.map(task => (
                                <div
                                  key={task.id}
                                  className="flex items-start gap-3 px-4 py-3 ml-10 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors group"
                                >
                                  {/* Task Info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium text-gray-900 text-sm">{task.title}</span>
                                      {task.pillar && (
                                        <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${PILLAR_COLORS[task.pillar] || 'bg-gray-100 text-gray-600'}`}>
                                          {task.pillar}
                                        </span>
                                      )}
                                      {task.xp_value && (
                                        <span className="text-xs text-gray-500">{task.xp_value} XP</span>
                                      )}
                                    </div>
                                    {task.description && (
                                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{task.description}</p>
                                    )}
                                  </div>

                                  {/* Actions */}
                                  <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => handleStartMove(task, lesson.id)}
                                      className="p-1.5 text-gray-400 hover:text-optio-purple hover:bg-optio-purple/10 rounded transition-colors"
                                      title="Move to another lesson"
                                    >
                                      <ArrowsRightLeftIcon className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(task, lesson)}
                                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                      title="Remove from lesson"
                                    >
                                      <TrashIcon className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="px-4 py-2 ml-10 text-xs text-gray-400 italic">
                              No tasks in this lesson
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Manage tasks across all projects and lessons
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>

      {/* Move Task Dropdown Overlay */}
      {movingTask && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[70vh] overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Move Task</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Move "<span className="font-medium">{movingTask.task.title}</span>" to:
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {allLessons.map(({ quest, lessons }) => (
                <div key={quest.id} className="mb-2">
                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <FolderIcon className="w-3.5 h-3.5" />
                    {quest.title}
                  </div>
                  {lessons.map(lesson => {
                    const isCurrent = lesson.id === movingTask.lessonId
                    return (
                      <button
                        key={lesson.id}
                        disabled={isCurrent}
                        onClick={() => handleConfirmMove(lesson.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          isCurrent
                            ? 'text-gray-400 cursor-not-allowed bg-gray-50'
                            : 'text-gray-700 hover:bg-optio-purple/10 hover:text-optio-purple'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <DocumentTextIcon className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{lesson.title}</span>
                          {isCurrent && <span className="text-xs text-gray-400 ml-auto">(current)</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setMovingTask(null)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}

export default AllTasksModal
