import React, { useState, useEffect, useRef } from 'react'
import {
  XMarkIcon,
  SparklesIcon,
  CheckIcon,
  PencilIcon,
  TrophyIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { getPillarData, PILLAR_KEYS } from '../../utils/pillarMappings'

// Task preview card for bulk generation
const TaskPreviewCard = ({ task, onAccept, onReject, onEdit, isAccepted }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editedTask, setEditedTask] = useState(task)
  const pillarData = getPillarData(task.pillar)

  const handleSaveEdit = () => {
    onEdit(task.id, editedTask)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className="border border-gray-200 bg-gray-50 rounded-lg p-3 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={editedTask.title}
            onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={editedTask.description}
            onChange={(e) => setEditedTask({ ...editedTask, description: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">Pillar</label>
            <select
              value={editedTask.pillar}
              onChange={(e) => setEditedTask({ ...editedTask, pillar: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            >
              {PILLAR_KEYS.map(key => (
                <option key={key} value={key}>{getPillarData(key).name}</option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <label className="block text-xs font-medium text-gray-700 mb-1">XP</label>
            <input
              type="number"
              min="50"
              max="300"
              step="25"
              value={editedTask.xp_value}
              onChange={(e) => setEditedTask({ ...editedTask, xp_value: parseInt(e.target.value) || 100 })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              setEditedTask(task)
              setIsEditing(false)
            }}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveEdit}
            className="px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90"
          >
            Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`border border-gray-200 bg-white rounded-lg p-3 transition-colors hover:border-gray-300 ${!isAccepted ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 text-sm mb-1">{task.title}</h4>
          <p className="text-xs text-gray-600 mb-2 line-clamp-2">{task.description}</p>
          <div className="flex items-center gap-2">
            <span
              className="px-2 py-0.5 text-xs font-semibold rounded"
              style={{ backgroundColor: `${pillarData.color}20`, color: pillarData.color }}
            >
              {pillarData.name}
            </span>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <TrophyIcon className="w-3 h-3" />
              {task.xp_value} XP
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
            title="Edit task"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => isAccepted ? onReject(task.id) : onAccept(task)}
            className={`p-1.5 rounded transition-colors ${isAccepted ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}
            title={isAccepted ? 'Reject task' : 'Accept task'}
          >
            {isAccepted ? <XMarkIcon className="w-4 h-4" /> : <CheckIcon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}

const BulkTaskGenerationModal = ({
  isOpen,
  onClose,
  quests,
  onTasksUpdated
}) => {
  const [phase, setPhase] = useState('loading') // loading, idle, generating, preview, creating
  const [allLessonsData, setAllLessonsData] = useState([]) // { questId, questTitle, lessonId, lessonTitle, content }
  const [currentIndex, setCurrentIndex] = useState(0)
  const [generatedTasks, setGeneratedTasks] = useState({}) // { lessonId: [tasks] }
  const [acceptedTasks, setAcceptedTasks] = useState({}) // { lessonId: [tasks] }
  const [errors, setErrors] = useState([])
  const [creatingProgress, setCreatingProgress] = useState(0)
  const abortRef = useRef(false)

  // Fetch all lessons for all quests when modal opens
  useEffect(() => {
    if (isOpen && quests?.length > 0) {
      fetchAllLessons()
    } else if (isOpen) {
      setPhase('idle')
      setAllLessonsData([])
    }
  }, [isOpen, quests])

  const fetchAllLessons = async () => {
    setPhase('loading')

    // Fetch all lessons in parallel
    const results = await Promise.allSettled(
      quests.map(async (quest) => {
        const response = await api.get(`/api/quests/${quest.id}/curriculum/lessons?include_unpublished=true`)
        const lessons = response.data.lessons || []

        // Filter to only lessons without linked tasks
        return lessons
          .filter(l => !l.linked_task_ids || l.linked_task_ids.length === 0)
          .map(lesson => ({
            questId: quest.id,
            questTitle: quest.title,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            content: lesson.content
          }))
      })
    )

    // Flatten successful results
    const lessonsData = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)

    setAllLessonsData(lessonsData)
    setPhase('idle')
    setCurrentIndex(0)
    setGeneratedTasks({})
    setAcceptedTasks({})
    setErrors([])
    setCreatingProgress(0)
    abortRef.current = false
  }

  // Extract text content from lesson for AI context
  const getLessonTextContent = (content) => {
    if (!content) return ''

    if (typeof content === 'string') return content

    // Handle version 2 step-based content
    if (content.version === 2 && content.steps) {
      return content.steps
        .map(step => `${step.title || ''}\n${step.content || ''}`)
        .join('\n\n')
    }

    // Handle legacy blocks format
    if (content.blocks) {
      return content.blocks
        .filter(block => block.type === 'text')
        .map(block => block.content || '')
        .join('\n\n')
    }

    return ''
  }

  // Process a single lesson's task generation
  const generateTasksForLesson = async (lessonData) => {
    const lessonContent = getLessonTextContent(lessonData.content)
    if (!lessonContent.trim()) {
      return { lessonData, error: 'No content' }
    }

    try {
      const response = await api.post(`/api/quests/${lessonData.questId}/curriculum/lessons/${lessonData.lessonId}/generate-tasks`, {
        lesson_content: lessonContent,
        lesson_title: lessonData.lessonTitle,
        num_tasks: 3
      })

      if (response.data.success && response.data.tasks) {
        const tasksWithIds = response.data.tasks.map((task, idx) => ({
          ...task,
          id: `bulk_${lessonData.lessonId}_${idx}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          lessonId: lessonData.lessonId,
          questId: lessonData.questId,
          xp_value: task.xp_value || 100
        }))
        return { lessonData, tasks: tasksWithIds }
      }
      return { lessonData, error: 'No tasks returned' }
    } catch (error) {
      return { lessonData, error: error.response?.data?.error || 'Generation failed' }
    }
  }

  // Start generating tasks for all empty lessons (sequential to avoid rate limits)
  const handleStartGeneration = async () => {
    setPhase('generating')
    setCurrentIndex(0)
    setGeneratedTasks({})
    setErrors([])
    abortRef.current = false

    const results = {}
    const errorList = []

    // Process sequentially to avoid AI rate limits
    for (let i = 0; i < allLessonsData.length; i++) {
      if (abortRef.current) break

      setCurrentIndex(i)
      const lessonData = allLessonsData[i]
      const result = await generateTasksForLesson(lessonData)

      if (result.tasks) {
        results[lessonData.lessonId] = result.tasks
      } else if (result.error) {
        errorList.push({
          lessonId: lessonData.lessonId,
          lessonTitle: lessonData.lessonTitle,
          questTitle: lessonData.questTitle,
          error: result.error
        })
      }
    }

    if (!abortRef.current) {
      setGeneratedTasks(results)
      setAcceptedTasks(results) // Initially all tasks are accepted
      setErrors(errorList)
      setPhase('preview')
    }
  }

  // Handle accepting a single task
  const handleAcceptTask = (lessonId, task) => {
    setAcceptedTasks(prev => ({
      ...prev,
      [lessonId]: [...(prev[lessonId] || []), task]
    }))
  }

  // Handle rejecting a single task
  const handleRejectTask = (lessonId, taskId) => {
    setAcceptedTasks(prev => ({
      ...prev,
      [lessonId]: (prev[lessonId] || []).filter(t => t.id !== taskId)
    }))
  }

  // Handle editing a task
  const handleEditTask = (lessonId, taskId, updatedTask) => {
    setAcceptedTasks(prev => ({
      ...prev,
      [lessonId]: (prev[lessonId] || []).map(t =>
        t.id === taskId ? { ...t, ...updatedTask } : t
      )
    }))
    setGeneratedTasks(prev => ({
      ...prev,
      [lessonId]: (prev[lessonId] || []).map(t =>
        t.id === taskId ? { ...t, ...updatedTask } : t
      )
    }))
  }

  // Accept all tasks
  const handleAcceptAll = () => {
    setAcceptedTasks({ ...generatedTasks })
  }

  // Reject all tasks
  const handleRejectAll = () => {
    const empty = {}
    Object.keys(generatedTasks).forEach(lessonId => {
      empty[lessonId] = []
    })
    setAcceptedTasks(empty)
  }

  // Create all accepted tasks (parallel with concurrency limit)
  const handleCreateTasks = async () => {
    setPhase('creating')
    setCreatingProgress(0)

    const lessonIds = Object.keys(acceptedTasks).filter(id => acceptedTasks[id]?.length > 0)
    let created = 0
    let failed = 0
    const CONCURRENCY = 5
    let completed = 0

    // Build task creation requests
    const createRequests = lessonIds.map(lessonId => {
      const tasks = acceptedTasks[lessonId]
      const lessonData = allLessonsData.find(l => l.lessonId === lessonId)
      return { lessonId, tasks, lessonData }
    }).filter(r => r.tasks?.length > 0 && r.lessonData)

    // Process in batches
    for (let i = 0; i < createRequests.length; i += CONCURRENCY) {
      const batch = createRequests.slice(i, i + CONCURRENCY)

      const batchResults = await Promise.allSettled(
        batch.map(async ({ lessonId, tasks, lessonData }) => {
          const taskData = tasks.map(t => ({
            title: t.title,
            description: t.description,
            pillar: t.pillar,
            xp_value: t.xp_value
          }))

          await api.post(`/api/quests/${lessonData.questId}/curriculum/lessons/${lessonId}/create-tasks`, {
            tasks: taskData,
            link_to_lesson: true
          })

          return tasks.length
        })
      )

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          created += result.value
        } else {
          failed += batch[batchResults.indexOf(result)]?.tasks?.length || 0
        }
        completed++
      }

      setCreatingProgress(Math.round((completed / createRequests.length) * 100))
    }

    if (created > 0) {
      toast.success(`Created ${created} task${created !== 1 ? 's' : ''} across the course`)
    }
    if (failed > 0) {
      toast.error(`Failed to create ${failed} task${failed !== 1 ? 's' : ''}`)
    }

    onTasksUpdated?.()
    onClose()
  }

  // Handle cancel during generation
  const handleCancel = () => {
    if (phase === 'generating') {
      abortRef.current = true
    }
    onClose()
  }

  // Count total accepted tasks
  const totalAcceptedTasks = Object.values(acceptedTasks).reduce((sum, tasks) => sum + (tasks?.length || 0), 0)
  const totalGeneratedTasks = Object.values(generatedTasks).reduce((sum, tasks) => sum + (tasks?.length || 0), 0)

  // Group lessons by quest for display
  const lessonsByQuest = allLessonsData.reduce((acc, lesson) => {
    if (!acc[lesson.questId]) {
      acc[lesson.questId] = {
        questTitle: lesson.questTitle,
        lessons: []
      }
    }
    acc[lesson.questId].lessons.push(lesson)
    return acc
  }, {})

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-optio-purple" />
            <h2 className="text-lg font-bold text-gray-900">Generate Tasks for Course</h2>
          </div>
          <button
            onClick={handleCancel}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Loading state */}
          {phase === 'loading' && (
            <div className="text-center py-8">
              <div className="w-12 h-12 border-4 border-optio-purple border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-gray-500">Loading lessons from all projects...</p>
            </div>
          )}

          {/* Idle state - show empty lessons info */}
          {phase === 'idle' && (
            <div className="space-y-4">
              {allLessonsData.length === 0 ? (
                <div className="text-center py-8">
                  <CheckIcon className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">All lessons have tasks</h3>
                  <p className="text-sm text-gray-500">
                    Every lesson across all projects already has linked tasks.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600">
                    Found <span className="font-semibold">{allLessonsData.length}</span> lesson{allLessonsData.length !== 1 ? 's' : ''} without tasks across <span className="font-semibold">{Object.keys(lessonsByQuest).length}</span> project{Object.keys(lessonsByQuest).length !== 1 ? 's' : ''}.
                    AI will generate 3 task suggestions for each.
                  </p>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-4 max-h-[300px] overflow-y-auto">
                    {Object.entries(lessonsByQuest).map(([questId, data]) => (
                      <div key={questId}>
                        <h4 className="text-sm font-medium text-gray-900 mb-2">{data.questTitle}</h4>
                        <ul className="space-y-1 pl-4">
                          {data.lessons.map((lesson, idx) => (
                            <li key={lesson.lessonId} className="text-sm text-gray-600 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                              {lesson.lessonTitle}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Generating state - show progress */}
          {phase === 'generating' && (
            <div className="text-center py-8">
              <div className="w-12 h-12 border-4 border-optio-purple border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Generating tasks...
              </h3>
              <p className="text-sm text-gray-500 mb-1">
                {allLessonsData[currentIndex]?.questTitle}
              </p>
              <p className="text-sm text-gray-600 mb-4">
                "{allLessonsData[currentIndex]?.lessonTitle}"
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2 max-w-xs mx-auto">
                <div
                  className="bg-gradient-to-r from-optio-purple to-optio-pink h-2 rounded-full transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / allLessonsData.length) * 100}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {currentIndex + 1} of {allLessonsData.length} lessons
              </p>
            </div>
          )}

          {/* Preview state - show generated tasks */}
          {phase === 'preview' && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Generated <span className="font-semibold">{totalGeneratedTasks}</span> tasks.
                  <span className="ml-1 text-optio-purple font-medium">{totalAcceptedTasks} selected</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAcceptAll}
                    className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                  >
                    Accept All
                  </button>
                  <button
                    onClick={handleRejectAll}
                    className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    Reject All
                  </button>
                </div>
              </div>

              {/* Errors */}
              {errors.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800">
                        Could not generate tasks for {errors.length} lesson{errors.length !== 1 ? 's' : ''}
                      </p>
                      <ul className="mt-1 text-xs text-yellow-700">
                        {errors.slice(0, 5).map((err, idx) => (
                          <li key={idx}>{err.questTitle} / {err.lessonTitle}: {err.error}</li>
                        ))}
                        {errors.length > 5 && (
                          <li>...and {errors.length - 5} more</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Tasks grouped by quest > lesson */}
              {Object.entries(lessonsByQuest).map(([questId, questData]) => {
                const questHasTasks = questData.lessons.some(l => generatedTasks[l.lessonId]?.length > 0)
                if (!questHasTasks) return null

                return (
                  <div key={questId} className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2">
                      {questData.questTitle}
                    </h3>
                    {questData.lessons.map(lessonData => {
                      const tasks = generatedTasks[lessonData.lessonId] || []
                      if (tasks.length === 0) return null

                      const acceptedForLesson = acceptedTasks[lessonData.lessonId] || []

                      return (
                        <div key={lessonData.lessonId} className="border border-gray-200 rounded-lg overflow-hidden ml-2">
                          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                            <h4 className="text-sm font-medium text-gray-700">
                              {lessonData.lessonTitle}
                              <span className="ml-2 text-xs font-normal text-gray-500">
                                ({acceptedForLesson.length}/{tasks.length} selected)
                              </span>
                            </h4>
                          </div>
                          <div className="p-3 space-y-2">
                            {tasks.map(task => {
                              const isAccepted = acceptedForLesson.some(t => t.id === task.id)
                              return (
                                <TaskPreviewCard
                                  key={task.id}
                                  task={task}
                                  isAccepted={isAccepted}
                                  onAccept={(t) => handleAcceptTask(lessonData.lessonId, t)}
                                  onReject={(taskId) => handleRejectTask(lessonData.lessonId, taskId)}
                                  onEdit={(taskId, updated) => handleEditTask(lessonData.lessonId, taskId, updated)}
                                />
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {totalGeneratedTasks === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>No tasks were generated. All lessons may have empty content.</p>
                </div>
              )}
            </div>
          )}

          {/* Creating state */}
          {phase === 'creating' && (
            <div className="text-center py-8">
              <div className="w-12 h-12 border-4 border-optio-purple border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Creating tasks...
              </h3>
              <div className="w-full bg-gray-200 rounded-full h-2 max-w-xs mx-auto">
                <div
                  className="bg-gradient-to-r from-optio-purple to-optio-pink h-2 rounded-full transition-all duration-300"
                  style={{ width: `${creatingProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">{creatingProgress}%</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          {phase === 'loading' && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          )}

          {phase === 'idle' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              {allLessonsData.length > 0 && (
                <button
                  onClick={handleStartGeneration}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity"
                >
                  <SparklesIcon className="w-4 h-4" />
                  Generate {allLessonsData.length * 3} Tasks
                </button>
              )}
            </>
          )}

          {phase === 'generating' && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          )}

          {phase === 'preview' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTasks}
                disabled={totalAcceptedTasks === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckIcon className="w-4 h-4" />
                Create {totalAcceptedTasks} Task{totalAcceptedTasks !== 1 ? 's' : ''}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default BulkTaskGenerationModal
