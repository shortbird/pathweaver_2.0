/**
 * CurriculumView Component
 *
 * Main curriculum viewer with sidebar navigation and step-based content display.
 * Manages lesson selection, progress tracking, and step navigation.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
  Bars3Icon,
  CheckCircleIcon,
  ClockIcon,
  XMarkIcon,
  ArrowPathIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline'
import { getPillarData } from '../../utils/pillarMappings'
import api from '../../services/api'
import { parseContentToSteps } from './utils/contentUtils'
import LessonItem from './LessonItem'
import LessonSlideViewer from './LessonSlideViewer'

// Age Adaptations Modal Component
const ScaffoldingModal = ({ isOpen, onClose, scaffolding }) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AcademicCapIcon className="w-8 h-8" />
              <h2 className="text-xl font-bold" style={{ fontFamily: 'Poppins' }}>
                Age Adaptations
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
          <p className="mt-2 text-white/80 text-sm">
            Tips for adapting this lesson for different age groups
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh]">
          {/* Younger learners */}
          <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
            <h3 className="font-semibold text-blue-900 mb-3" style={{ fontFamily: 'Poppins' }}>
              Younger Learners
            </h3>
            <p className="text-blue-800 leading-relaxed">
              {scaffolding?.younger || 'No specific adaptations provided for younger learners.'}
            </p>
          </div>

          {/* Older learners */}
          <div className="bg-purple-50 rounded-xl p-5 border border-purple-100">
            <h3 className="font-semibold text-purple-900 mb-3" style={{ fontFamily: 'Poppins' }}>
              Older Learners
            </h3>
            <p className="text-purple-800 leading-relaxed">
              {scaffolding?.older || 'No specific adaptations provided for older learners.'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 p-4 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:shadow-lg transition-shadow"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

const CurriculumView = ({
  lessons: propLessons,
  selectedLessonId: propSelectedLessonId,
  onLessonSelect,
  onLessonsReorder,
  onTaskClick,
  orderingMode = 'sequential',
  isAdmin = false,
  className = '',
  questId,
  embedded = false,
  initialLessonId,
  initialStepIndex: propInitialStepIndex,
  onUnsavedChangesChange,
  onSaveProgress,
  onStepChange,
}) => {
  // React Router location for detecting navigation
  const location = useLocation()

  // Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768)

  // Data state
  const [fetchedLessons, setFetchedLessons] = useState([])
  const [questTasks, setQuestTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [internalSelectedId, setInternalSelectedId] = useState(null)

  // Step navigation state
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [completedSteps, setCompletedSteps] = useState(new Set())

  // Progress state
  const [lessonProgress, setLessonProgress] = useState({})
  const [progressLoaded, setProgressLoaded] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [lastAppliedInitialStep, setLastAppliedInitialStep] = useState(null)

  // Track initialized lesson to prevent re-init on save
  const initializedLessonIdRef = useRef(null)

  // Age adaptations modal state
  const [showScaffoldingModal, setShowScaffoldingModal] = useState(false)

  // Derived state
  const lessons = propLessons || fetchedLessons
  const selectedLessonId = propSelectedLessonId ?? internalSelectedId
  const selectedLesson = lessons.find(l => l.id === selectedLessonId)

  // Parse steps for the selected lesson
  const lessonSteps = useMemo(() => parseContentToSteps(selectedLesson?.content), [selectedLesson?.content])
  const totalSteps = lessonSteps.length

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  )

  // Get linked tasks for a lesson
  const getLinkedTasks = (lesson) => {
    if (!lesson?.linked_task_ids || lesson.linked_task_ids.length === 0) return []
    return questTasks.filter(task => lesson.linked_task_ids.includes(task.id))
  }

  // Calculate earned XP for a lesson (tasks linked to that specific lesson)
  const getLessonEarnedXP = (lesson) => {
    const tasks = getLinkedTasks(lesson)
    return tasks.reduce((total, task) => {
      return total + (task.is_completed ? (task.xp_value || 0) : 0)
    }, 0)
  }

  // Calculate project-wide earned XP (all completed tasks in the quest)
  const getProjectEarnedXP = () => {
    return questTasks.reduce((total, task) => {
      return total + (task.is_completed ? (task.xp_value || 0) : 0)
    }, 0)
  }

  // Calculate step counts
  const linkedTasksForLesson = selectedLesson ? getLinkedTasks(selectedLesson) : []
  const hasTasksStep = linkedTasksForLesson.length > 0
  const totalStepsWithTasks = hasTasksStep ? totalSteps + 1 : totalSteps

  // XP values - use project-wide XP for the "Project XP Goal" display
  const selectedLessonXpThreshold = selectedLesson?.xp_threshold || 0
  const selectedLessonEarnedXP = getProjectEarnedXP()

  // Fetch data when questId is provided
  useEffect(() => {
    if (!questId) return

    const fetchData = async () => {
      try {
        setLoading(true)

        const [lessonsResult, tasksResult, progressResult] = await Promise.all([
          !propLessons
            ? api.get(`/api/quests/${questId}/curriculum/lessons${isAdmin ? '?include_unpublished=true' : ''}`).catch(() => ({ data: { lessons: [] } }))
            : Promise.resolve(null),
          api.get(`/api/quests/${questId}/tasks`).catch(() => ({ data: { tasks: [] } })),
          api.get(`/api/quests/${questId}/curriculum/progress`).catch(() => ({ data: { progress: [] } }))
        ])

        if (lessonsResult) {
          const lessonsData = lessonsResult.data.lessons || []
          setFetchedLessons(lessonsData)
          if (lessonsData.length > 0 && !internalSelectedId) {
            setInternalSelectedId(lessonsData[0].id)
          }
        }

        setQuestTasks(tasksResult.data.tasks || [])

        const progressMap = {}
        ;(progressResult.data.progress || []).forEach(p => {
          progressMap[p.lesson_id] = p
        })
        setLessonProgress(progressMap)
        setProgressLoaded(true)
      } catch (error) {
        console.error('Failed to fetch curriculum data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [questId, propLessons])

  // Function to refresh just the tasks (not lessons/progress)
  const refreshQuestTasks = useCallback(async () => {
    if (!questId) return
    try {
      const tasksResult = await api.get(`/api/quests/${questId}/tasks`)
      setQuestTasks(tasksResult.data.tasks || [])
    } catch (error) {
      console.error('Failed to refresh tasks:', error)
    }
  }, [questId])

  // Refresh tasks when location changes (handles returning from quest page after completing a task)
  // This is the primary mechanism for detecting navigation back to this view
  useEffect(() => {
    if (!questId) return
    refreshQuestTasks()
  }, [questId, location.pathname, refreshQuestTasks])

  // Also refresh on window focus and visibility change for robustness
  useEffect(() => {
    if (!questId) return

    const handleFocus = () => {
      refreshQuestTasks()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshQuestTasks()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [questId, refreshQuestTasks])

  // Handle initialLessonId prop
  useEffect(() => {
    if (initialLessonId) {
      setInternalSelectedId(initialLessonId)
      initializedLessonIdRef.current = null
    }
  }, [initialLessonId])

  // Load saved progress when lesson is selected
  useEffect(() => {
    if (!selectedLessonId || !progressLoaded) return

    const savedProgress = lessonProgress[selectedLessonId]
    const savedPosition = savedProgress?.last_position
    const contentSteps = lessonSteps.length
    const tasksStepIndex = contentSteps // Tasks step is directly after content (no "finished" step)

    if (initializedLessonIdRef.current === selectedLessonId) {
      if (propInitialStepIndex !== null && propInitialStepIndex !== undefined &&
          propInitialStepIndex >= tasksStepIndex && propInitialStepIndex !== lastAppliedInitialStep) {
        setCurrentStepIndex(propInitialStepIndex)
        setLastAppliedInitialStep(propInitialStepIndex)
      }
      return
    }

    const currentLesson = lessons.find(l => l.id === selectedLessonId)
    initializedLessonIdRef.current = selectedLessonId

    if (savedPosition?.completed_steps) {
      setCompletedSteps(new Set(savedPosition.completed_steps))
    }

    const isLessonCompleted = currentLesson?.is_completed || currentLesson?.progress?.status === 'completed'

    if (isLessonCompleted && hasTasksStep) {
      if (propInitialStepIndex !== null && propInitialStepIndex !== undefined && propInitialStepIndex >= tasksStepIndex) {
        setCurrentStepIndex(propInitialStepIndex)
        setLastAppliedInitialStep(propInitialStepIndex)
      } else {
        setCurrentStepIndex(tasksStepIndex)
      }
      return
    }

    if (propInitialStepIndex !== null && propInitialStepIndex !== undefined) {
      setCurrentStepIndex(propInitialStepIndex)
      setLastAppliedInitialStep(propInitialStepIndex)
      return
    }

    if (savedPosition?.completed_steps) {
      const savedCompletedSteps = new Set(savedPosition.completed_steps)
      const allContentComplete = contentSteps > 0 && savedCompletedSteps.size >= contentSteps

      if (allContentComplete && hasTasksStep) {
        setCurrentStepIndex(contentSteps + 1)
      } else if (allContentComplete) {
        setCurrentStepIndex(0)
      } else {
        let nextIncomplete = 0
        for (let i = 0; i < contentSteps; i++) {
          if (!savedCompletedSteps.has(i)) {
            nextIncomplete = i
            break
          }
        }
        setCurrentStepIndex(nextIncomplete)
      }
    } else {
      setCurrentStepIndex(0)
      setCompletedSteps(new Set())
    }
  }, [selectedLessonId, progressLoaded, lessonProgress, lessonSteps.length, hasTasksStep, propInitialStepIndex, lastAppliedInitialStep, lessons])

  // Notify parent of unsaved changes
  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges)
  }, [hasUnsavedChanges, onUnsavedChangesChange])

  // Save progress to API
  const saveProgress = async (lessonId, completedStepsArray, currentStep) => {
    if (!questId) return
    try {
      const allComplete = totalSteps > 0 && completedStepsArray.length >= totalSteps
      await api.post(`/api/quests/${questId}/curriculum/progress/${lessonId}`, {
        status: allComplete ? 'completed' : 'in_progress',
        progress_percentage: totalSteps > 0 ? Math.round((completedStepsArray.length / totalSteps) * 100) : 0,
        last_position: { completed_steps: completedStepsArray, current_step: currentStep }
      })
      setLessonProgress(prev => ({
        ...prev,
        [lessonId]: { ...prev[lessonId], status: allComplete ? 'completed' : 'in_progress', last_position: { completed_steps: completedStepsArray, current_step: currentStep } }
      }))
    } catch (err) {
      console.error('[Progress] Failed to save:', err)
    }
  }

  // Expose save function to parent
  const saveStateRef = useRef({ completedSteps, currentStepIndex, selectedLessonId, totalSteps })
  saveStateRef.current = { completedSteps, currentStepIndex, selectedLessonId, totalSteps }

  useEffect(() => {
    if (onSaveProgress) {
      onSaveProgress(() => {
        const { completedSteps: steps, currentStepIndex: stepIdx, selectedLessonId: lessonId, totalSteps: total } = saveStateRef.current
        if (hasUnsavedChanges && lessonId) {
          saveProgress(lessonId, Array.from(steps).filter(s => s < total), stepIdx)
          setHasUnsavedChanges(false)
        }
      })
    }
  }, [onSaveProgress, hasUnsavedChanges])

  // Step navigation handlers
  const goToNextStep = () => {
    if (currentStepIndex < totalStepsWithTasks - 1) {
      const newCompleted = new Set([...completedSteps, currentStepIndex])
      setCompletedSteps(newCompleted)
      setCurrentStepIndex(currentStepIndex + 1)
      setHasUnsavedChanges(true)
      onStepChange?.(currentStepIndex + 1)
    }
  }

  const goToPrevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1)
      onStepChange?.(currentStepIndex - 1)
    }
  }

  const goToStep = (index) => {
    setCurrentStepIndex(index)
    onStepChange?.(index)
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        if (currentStepIndex < totalStepsWithTasks - 1) goToNextStep()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (currentStepIndex > 0) goToPrevStep()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentStepIndex, totalStepsWithTasks])

  // Reset progress (admin only)
  const resetLessonProgress = async () => {
    if (!selectedLessonId || !questId) return
    try {
      await api.delete(`/api/quests/${questId}/curriculum/progress/${selectedLessonId}`)
      setCompletedSteps(new Set())
      setCurrentStepIndex(0)
      setLessonProgress(prev => {
        const newProgress = { ...prev }
        delete newProgress[selectedLessonId]
        return newProgress
      })
      initializedLessonIdRef.current = null
    } catch (err) {
      console.error('[Progress] Failed to reset:', err)
    }
  }

  // Lesson selection handler
  const handleLessonSelect = (lesson) => {
    setInternalSelectedId(lesson.id)
    onLessonSelect?.(lesson)
    if (window.innerWidth < 768) setIsSidebarOpen(false)
  }

  // Drag and drop handler
  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || !isAdmin || active.id === over.id) return

    const oldIndex = lessons.findIndex(l => l.id === active.id)
    const newIndex = lessons.findIndex(l => l.id === over.id)
    const reordered = [...lessons]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)

    if (onLessonsReorder) onLessonsReorder(reordered)
  }

  // Progress calculations
  const completedCount = lessons.filter(l => l.is_completed).length
  const progressPercent = lessons.length > 0 ? (completedCount / lessons.length) * 100 : 0

  return (
    <div className={`flex h-full relative ${className}`}>
      {/* Mobile overlay */}
      {!embedded && isSidebarOpen && (
        <div className="md:hidden fixed inset-0 bg-black/30 z-10" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      {!embedded && (
        <div className={`${isSidebarOpen ? 'w-80 min-w-[280px] max-w-[320px]' : 'w-0'} transition-all duration-300 overflow-hidden border-r border-gray-200 bg-gray-50 flex flex-col ${isSidebarOpen ? 'absolute md:relative z-20 h-full md:h-auto' : ''}`}>
          <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-gray-900">Lessons</h3>
              <button onClick={() => setIsSidebarOpen(false)} className="p-1 hover:bg-gray-100 rounded">
                <XMarkIcon className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-600">
                <span>Progress</span>
                <span>{completedCount} / {lessons.length}</span>
              </div>
              <div className="relative w-full h-4 bg-gray-200 rounded-full">
                <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-optio-purple to-optio-pink transition-all duration-500 ease-out rounded-full" style={{ width: `${progressPercent}%` }} />
                <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 bg-white border-optio-purple z-10" style={{ left: '0%', transform: 'translate(-50%, -50%)' }} />
                {lessons.map((lesson, index) => {
                  const position = ((index + 1) / lessons.length) * 100
                  const isCompleted = lesson.is_completed || false
                  const isFilled = progressPercent >= position
                  return (
                    <div
                      key={lesson.id}
                      className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 transition-all duration-300 cursor-pointer hover:scale-125 z-10 ${isCompleted ? 'bg-white border-optio-purple shadow-sm' : isFilled ? 'bg-white border-optio-purple/50' : 'bg-white border-gray-400'}`}
                      style={{ left: `${position}%`, transform: 'translate(-50%, -50%)' }}
                      title={`${lesson.title || `Lesson ${index + 1}`}${isCompleted ? ' (Completed)' : ''}`}
                      onClick={() => handleLessonSelect(lesson)}
                    />
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
              </div>
            ) : lessons.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">No lessons yet</div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={lessons.map(l => l.id)} strategy={verticalListSortingStrategy}>
                  {lessons.map((lesson, index) => (
                    <LessonItem
                      key={lesson.id}
                      lesson={lesson}
                      index={index}
                      isSelected={lesson.id === selectedLessonId}
                      isAdmin={isAdmin}
                      xpThreshold={lesson?.xp_threshold || 0}
                      earnedXP={getLessonEarnedXP(lesson)}
                      taskCount={getLinkedTasks(lesson).length}
                      onClick={() => handleLessonSelect(lesson)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>

          {isAdmin && (
            <div className="p-3 border-t border-gray-200 bg-white text-xs text-gray-600 flex-shrink-0">
              Mode: <span className="font-semibold ml-1">{orderingMode === 'sequential' ? 'Sequential' : 'Free Choice'}</span>
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {!embedded && (
          <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Open lessons menu">
              <Bars3Icon className="w-5 h-5" />
            </button>
            {selectedLesson ? (
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{selectedLesson.title}</div>
                <div className="text-xs text-gray-500">Lesson {lessons.findIndex(l => l.id === selectedLesson.id) + 1} of {lessons.length}</div>
              </div>
            ) : (
              <div className="flex-1 text-sm text-gray-500">Select a lesson</div>
            )}
            {lessons.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-shrink-0">
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
                <span>{completedCount}/{lessons.length}</span>
              </div>
            )}
          </div>
        )}

        {!embedded && !isSidebarOpen && (
          <button onClick={() => setIsSidebarOpen(true)} className="hidden md:flex absolute top-4 left-4 z-10 p-2 bg-white rounded-lg shadow-lg border border-gray-200 hover:bg-gray-50" aria-label="Open lessons menu">
            <Bars3Icon className="w-6 h-6 text-gray-700" />
          </button>
        )}

        <div className="flex-1 overflow-y-auto px-2 py-2 sm:px-3 sm:py-4">
          {(loading || (initialLessonId && !selectedLesson)) ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center px-4">
                <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-optio-purple mx-auto mb-4" />
                <p className="text-base sm:text-lg font-medium text-gray-700">Loading lesson...</p>
              </div>
            </div>
          ) : !selectedLesson ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500 px-4">
                <ClockIcon className="w-10 sm:w-12 h-10 sm:h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-base sm:text-lg font-medium">Select a lesson to view</p>
                <button onClick={() => setIsSidebarOpen(true)} className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90">
                  <Bars3Icon className="w-4 h-4" /> View Lessons
                </button>
              </div>
            </div>
          ) : (
            <div>
              {/* Lesson Header */}
              <div className="mb-6 sm:mb-8 pb-4 sm:pb-6 border-b border-gray-200">
                {selectedLesson.pillar && (
                  <div className="mb-2 sm:mb-3">
                    <span className="inline-flex items-center px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-sm" style={{ backgroundColor: getPillarData(selectedLesson.pillar).color }}>
                      {getPillarData(selectedLesson.pillar).name}
                    </span>
                  </div>
                )}
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 leading-tight">{selectedLesson.title}</h1>
                {selectedLesson.description && <p className="text-base sm:text-lg text-gray-600 mb-3 sm:mb-4">{selectedLesson.description}</p>}
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm text-gray-600">
                  {selectedLesson.duration_minutes && (
                    <div className="flex items-center gap-1.5"><ClockIcon className="w-4 h-4 text-gray-500" /><span>{selectedLesson.duration_minutes} min</span></div>
                  )}
                  {selectedLesson.is_completed && (
                    <div className="flex items-center gap-1.5 text-green-600 font-medium"><CheckCircleIcon className="w-4 h-4" /><span>Completed</span></div>
                  )}
                  {isAdmin && completedSteps.size > 0 && (
                    <button onClick={resetLessonProgress} className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 transition-colors" title="Reset lesson progress">
                      <ArrowPathIcon className="w-4 h-4" /><span>Reset Progress</span>
                    </button>
                  )}
                </div>

                {/* Step Progress Indicators */}
                {totalStepsWithTasks > 1 && (
                  <div className="flex items-center gap-2 mt-4 flex-wrap">
                    {lessonSteps.map((step, index) => (
                      <button key={step.id || index} onClick={() => goToStep(index)} className="flex items-center gap-1.5 group" title={step.title || `Step ${index + 1}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${completedSteps.has(index) ? 'bg-green-100 text-green-600 ring-2 ring-green-200' : index === currentStepIndex ? 'bg-optio-purple text-white ring-2 ring-optio-purple/30' : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'}`}>
                          {completedSteps.has(index) ? <CheckCircleIcon className="w-5 h-5" /> : index + 1}
                        </div>
                      </button>
                    ))}
                    {hasTasksStep && (
                      <button onClick={() => goToStep(totalSteps)} className="flex items-center gap-1.5 group" title="Practice Tasks">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${currentStepIndex === totalSteps ? 'bg-optio-purple text-white ring-2 ring-optio-purple/30' : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'}`}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                        </div>
                      </button>
                    )}
                    <span className="ml-2 text-sm text-gray-500">
                      {currentStepIndex < totalSteps ? `Step ${currentStepIndex + 1} of ${totalSteps}` : hasTasksStep ? 'Tasks' : 'Complete'}
                    </span>
                    {/* Age Adaptations Button - right aligned */}
                    {selectedLesson.content?.scaffolding && (selectedLesson.content.scaffolding.younger || selectedLesson.content.scaffolding.older) && (
                      <button
                        onClick={() => setShowScaffoldingModal(true)}
                        className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 text-optio-purple rounded-full hover:from-optio-purple/20 hover:to-optio-pink/20 transition-colors font-medium text-sm"
                      >
                        <AcademicCapIcon className="w-4 h-4" />
                        <span>Age Adaptations</span>
                      </button>
                    )}
                  </div>
                )}
                {/* Age Adaptations Button - shown when no step indicators */}
                {totalStepsWithTasks <= 1 && selectedLesson.content?.scaffolding && (selectedLesson.content.scaffolding.younger || selectedLesson.content.scaffolding.older) && (
                  <div className="flex justify-end mt-4">
                    <button
                      onClick={() => setShowScaffoldingModal(true)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 text-optio-purple rounded-full hover:from-optio-purple/20 hover:to-optio-pink/20 transition-colors font-medium text-sm"
                    >
                      <AcademicCapIcon className="w-4 h-4" />
                      <span>Age Adaptations</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Lesson Content */}
              <LessonSlideViewer
                lesson={selectedLesson}
                steps={lessonSteps}
                currentStepIndex={currentStepIndex}
                completedSteps={completedSteps}
                onNextStep={goToNextStep}
                onPrevStep={goToPrevStep}
                linkedTasks={linkedTasksForLesson}
                onTaskClick={onTaskClick}
                hasTasksStep={hasTasksStep}
                totalStepsWithTasks={totalStepsWithTasks}
                questId={questId}
                lessonXpThreshold={selectedLessonXpThreshold}
                lessonEarnedXP={selectedLessonEarnedXP}
                allLessons={lessons}
                allTasks={questTasks}
                onLessonSelect={handleLessonSelect}
                onTaskCreated={(newTask) => {
                  setQuestTasks(prev => [...prev, newTask])
                  setFetchedLessons(prev => prev.map(lesson =>
                    lesson.id === selectedLesson.id
                      ? { ...lesson, linked_task_ids: [...(lesson.linked_task_ids || []), newTask.id] }
                      : lesson
                  ))
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Age Adaptations Modal */}
      <ScaffoldingModal
        isOpen={showScaffoldingModal}
        onClose={() => setShowScaffoldingModal(false)}
        scaffolding={selectedLesson?.content?.scaffolding}
      />
    </div>
  )
}

export default CurriculumView
