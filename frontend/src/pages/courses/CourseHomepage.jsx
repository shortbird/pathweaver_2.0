import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import {
  ChevronLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  LockClosedIcon,
  PlayCircleIcon,
  BookOpenIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  ArrowRightStartOnRectangleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid, ExclamationCircleIcon } from '@heroicons/react/24/solid'
import { useCourseHomepage } from '../../hooks/api/useCourseData'
import CurriculumView from '../../components/curriculum/CurriculumView'
import { endCourse, enrollInCourse, unenrollFromCourse } from '../../services/courseService'
import toast from 'react-hot-toast'

/**
 * ExpandableQuestItem - Sidebar quest item with nested lessons
 * Matches CourseBuilder styling but without drag/edit actions
 */
const ExpandableQuestItem = ({
  quest,
  index,
  isExpanded,
  isSelected,
  onToggleExpand,
  onSelectQuest,
  onSelectLesson,
  selectedLessonId,
}) => {
  const isCompleted = quest.progress?.is_completed
  const canComplete = quest.progress?.can_complete
  const hasXP = quest.progress?.total_xp > 0
  const xpText = hasXP
    ? `${quest.progress.earned_xp || 0}/${quest.progress.total_xp} XP`
    : null

  const progressPercent = quest.progress?.percentage || 0

  // Show incomplete required tasks warning
  const hasIncompleteRequired = quest.progress?.total_required_tasks > 0 &&
    quest.progress?.completed_required_tasks < quest.progress?.total_required_tasks

  return (
    <div className="mb-2">
      {/* Quest Header */}
      <div
        className={`relative overflow-hidden flex items-center gap-2 p-3 rounded-lg transition-all cursor-pointer ${
          isSelected && !selectedLessonId
            ? 'bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 border-2 border-optio-purple'
            : 'bg-white border border-gray-200 hover:border-optio-purple/50'
        }`}
      >
        {/* Progress bar background */}
        {progressPercent > 0 && !isCompleted && !canComplete && (
          <div
            className="absolute inset-y-0 left-0 bg-optio-purple/15 transition-all duration-300"
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
        )}
        {/* Expand/Collapse Chevron */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand(quest.id)
          }}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
        >
          {isExpanded ? (
            <ChevronDownIcon className="w-4 h-4" />
          ) : (
            <ChevronRightIcon className="w-4 h-4" />
          )}
        </button>

        {/* Order Number */}
        <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-optio-purple/10 text-optio-purple rounded-full text-xs font-medium">
          {index + 1}
        </span>

        {/* Quest Title */}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => onSelectQuest(quest)}
        >
          <h4 className="font-medium text-gray-900 text-sm leading-snug truncate">
            {quest.title || 'Untitled Project'}
          </h4>
          {/* XP and Progress on same row */}
          {(xpText || (hasXP && !isCompleted && !canComplete)) && (
            <div className="flex justify-between items-center">
              {xpText && (
                <span className="text-xs text-gray-500">{xpText}</span>
              )}
              {hasXP && !isCompleted && !canComplete && (
                <span className="text-xs text-gray-500">
                  {Math.round(Math.min(progressPercent, 100))}%
                </span>
              )}
            </div>
          )}
          {/* Show required tasks warning if XP met but required tasks incomplete */}
          {hasIncompleteRequired && progressPercent >= 100 && !isCompleted && (
            <span className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
              <ExclamationCircleIcon className="w-3 h-3" />
              {quest.progress?.completed_required_tasks}/{quest.progress?.total_required_tasks} required
            </span>
          )}
        </div>

        {/* Completion Status */}
        {isCompleted ? (
          <CheckCircleSolid className="w-5 h-5 text-green-500 flex-shrink-0" />
        ) : canComplete ? (
          <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded flex-shrink-0">
            Ready
          </span>
        ) : null}
      </div>

      {/* Nested Lessons */}
      {isExpanded && quest.lessons && quest.lessons.length > 0 && (
        <div className="ml-8 mt-1 space-y-1">
          {quest.lessons.map((lesson, idx) => {
            const isLessonCompleted = lesson.progress?.status === 'completed'
            const isLessonSelected = selectedLessonId === lesson.id
            const hasIncompleteRequired = lesson.progress?.has_incomplete_required

            return (
              <div
                key={lesson.id}
                onClick={() => onSelectLesson(quest, lesson)}
                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors min-h-[56px] ${
                  isLessonSelected
                    ? 'bg-optio-purple/10 border border-optio-purple'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                {/* Lesson Number */}
                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-xs text-gray-500">
                  {idx + 1}
                </span>

                {/* Lesson Title */}
                <span className="flex-1 text-sm text-gray-700 truncate">
                  {lesson.title}
                </span>

                {/* Status */}
                {isLessonCompleted ? (
                  <CheckCircleSolid className="w-4 h-4 text-green-500 flex-shrink-0" />
                ) : hasIncompleteRequired ? (
                  <span className="flex items-center gap-1 text-xs text-amber-600 flex-shrink-0" title={`${lesson.progress?.completed_required_tasks || 0}/${lesson.progress?.total_required_tasks || 0} required tasks`}>
                    <ExclamationCircleIcon className="w-4 h-4" />
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{course.title}</h1>
        {course.description && (
          <p className="text-gray-600">{course.description}</p>
        )}
      </div>

      {/* Progress Summary */}
      <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Progress</h2>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">
                {progress.completed_quests} of {progress.total_quests} projects completed
              </span>
              {progress.percentage >= 100 ? (
                <span className="inline-flex items-center gap-1 font-semibold text-green-600">
                  <CheckCircleSolid className="w-5 h-5" />
                  Complete
                </span>
              ) : (
                <span className="font-semibold text-gray-900">
                  {Math.round(progress.percentage)}%
                </span>
              )}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  progress.percentage >= 100
                    ? 'bg-green-500'
                    : 'bg-gradient-to-r from-optio-purple to-optio-pink'
                }`}
                style={{ width: `${Math.min(100, progress.percentage)}%` }}
              />
            </div>
          </div>
        </div>
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
                      {quest.description}
                    </p>
                  )}

                  {/* Progress */}
                  <div className="mt-3 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1 text-sm text-green-600 font-medium">
                          <CheckCircleSolid className="w-4 h-4" />
                          Completed
                        </span>
                      ) : quest.progress?.can_complete ? (
                        <span className="inline-flex items-center gap-1 text-sm text-green-600 font-medium">
                          <CheckCircleSolid className="w-4 h-4" />
                          Ready to Complete
                        </span>
                      ) : quest.progress?.total_tasks > 0 ? (
                        <>
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-optio-purple to-optio-pink h-2 rounded-full"
                              style={{ width: `${quest.progress.percentage}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">
                            {Math.round(quest.progress.percentage)}%
                          </span>
                        </>
                      ) : (
                        <span className="text-sm text-gray-500">Not started</span>
                      )}
                    </div>
                    {/* Show warning if XP met but required tasks incomplete */}
                    {!isCompleted && quest.progress?.xp_met && !quest.progress?.required_tasks_met && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                        <ExclamationCircleIcon className="w-3.5 h-3.5" />
                        {quest.progress?.completed_required_tasks}/{quest.progress?.total_required_tasks} required tasks
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

/**
 * QuestDetail - Content when a quest is selected but no lesson
 */
const QuestDetail = ({ quest, onSelectLesson, onStartQuest, fallbackImageUrl }) => {
  const isCompleted = quest.progress?.is_completed
  const hasLessons = quest.lessons && quest.lessons.length > 0
  const headerImage = quest.header_image_url || quest.image_url || fallbackImageUrl

  return (
    <div className="p-6">
      {/* Header Image */}
      {headerImage && (
        <div className="mb-6 -mx-6 -mt-6">
          <img
            src={headerImage}
            alt={quest.title}
            className="w-full h-48 object-cover"
          />
        </div>
      )}

      {/* Quest Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{quest.title}</h1>
        {quest.description && (
          <p className="text-gray-600">{quest.description}</p>
        )}
      </div>

      {/* Progress Bar */}
      {quest.progress?.total_tasks > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600">
              {quest.progress.completed_tasks} of {quest.progress.total_tasks} tasks completed
            </span>
            {isCompleted ? (
              <span className="inline-flex items-center gap-1 font-semibold text-green-600">
                <CheckCircleSolid className="w-5 h-5" />
                Complete
              </span>
            ) : quest.progress?.can_complete ? (
              <span className="inline-flex items-center gap-1 font-semibold text-green-600">
                <CheckCircleSolid className="w-5 h-5" />
                Ready to Complete
              </span>
            ) : (
              <span className="font-semibold text-gray-900">
                {Math.round(quest.progress.percentage)}%
              </span>
            )}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                isCompleted || quest.progress?.can_complete
                  ? 'bg-green-500'
                  : 'bg-gradient-to-r from-optio-purple to-optio-pink'
              }`}
              style={{ width: `${Math.min(100, quest.progress.percentage)}%` }}
            />
          </div>
        </div>
      )}

      {/* Lessons List */}
      {hasLessons && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Lessons</h2>
          <div className="space-y-2">
            {quest.lessons.map((lesson, idx) => {
              const isLessonCompleted = lesson.progress?.status === 'completed'

              return (
                <div
                  key={lesson.id}
                  onClick={() => onSelectLesson(quest, lesson)}
                  className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-optio-purple/50 hover:shadow-sm transition-all min-h-[56px]"
                >
                  {/* Lesson Number */}
                  <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-optio-purple/10 text-optio-purple rounded-full text-sm font-medium">
                    {idx + 1}
                  </span>

                  {/* Lesson Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900">{lesson.title}</h3>
                    {lesson.estimated_duration_minutes && (
                      <span className="text-sm text-gray-500">
                        {lesson.estimated_duration_minutes} min
                      </span>
                    )}
                  </div>

                  {/* Status */}
                  {isLessonCompleted ? (
                    <CheckCircleSolid className="w-5 h-5 text-green-500" />
                  ) : (
                    <PlayCircleIcon className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Action Button */}
      {!isCompleted && (
        <button
          onClick={onStartQuest}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:opacity-90 transition-opacity min-h-[44px]"
        >
          <PlayCircleIcon className="w-5 h-5" />
          {quest.enrollment ? 'Continue Project' : 'Start Project'}
        </button>
      )}
    </div>
  )
}

/**
 * CourseHomepage - Main course homepage with sidebar navigation
 */
const CourseHomepage = () => {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()

  // Fetch course data
  const { data, isLoading, error, refetch } = useCourseHomepage(courseId)

  // State for sidebar navigation
  const [expandedQuestIds, setExpandedQuestIds] = useState(new Set())
  const [selectedQuest, setSelectedQuest] = useState(null)
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [saveProgressFn, setSaveProgressFn] = useState(null)
  const [initialStepIndex, setInitialStepIndex] = useState(null)
  const [isEnding, setIsEnding] = useState(false)
  const [isEnrolling, setIsEnrolling] = useState(false)
  const [isUnenrolling, setIsUnenrolling] = useState(false)
  const [incompleteProjectsModal, setIncompleteProjectsModal] = useState(null)

  // Handle enroll in course (for creators testing their course)
  const handleEnroll = async () => {
    try {
      setIsEnrolling(true)
      await enrollInCourse(courseId)
      toast.success('Enrolled in course!')
      // Refetch course data to update enrollment status
      refetch()
    } catch (error) {
      console.error('Failed to enroll:', error)
      toast.error(error.response?.data?.error || 'Failed to enroll in course')
    } finally {
      setIsEnrolling(false)
    }
  }

  // Handle end course (preserves progress)
  const handleEndCourse = async () => {
    if (!window.confirm('Are you sure you want to end this course? Your progress and XP will be preserved.')) {
      return
    }

    try {
      setIsEnding(true)
      const result = await endCourse(courseId)
      toast.success(result.message || 'Course completed!')
      navigate('/')
    } catch (error) {
      console.error('Failed to end course:', error)

      // Check if this is an INCOMPLETE_PROJECTS error
      const responseData = error.response?.data
      if (responseData?.reason === 'INCOMPLETE_PROJECTS' && responseData?.incomplete_projects) {
        // Show the incomplete projects modal
        setIncompleteProjectsModal({
          message: responseData.message,
          projects: responseData.incomplete_projects
        })
      } else {
        toast.error(responseData?.error || 'Failed to end course')
      }
    } finally {
      setIsEnding(false)
    }
  }

  // Handle unenroll from course (deletes all progress)
  const handleUnenroll = async () => {
    if (!window.confirm('Are you sure you want to unenroll from this course? This will DELETE all your progress, tasks, and XP from this course. This cannot be undone.')) {
      return
    }

    try {
      setIsUnenrolling(true)
      await unenrollFromCourse(courseId)
      toast.success('Successfully unenrolled from course')
      navigate('/courses')
    } catch (error) {
      console.error('Failed to unenroll:', error)
      toast.error(error.response?.data?.error || 'Failed to unenroll from course')
    } finally {
      setIsUnenrolling(false)
    }
  }

  // Navigate to a project with incomplete requirements
  const handleGoToProject = (questId) => {
    const quest = data?.quests?.find(q => q.id === questId)
    if (quest) {
      setIncompleteProjectsModal(null)
      setSelectedQuest(quest)
      setSelectedLesson(null)
      setSearchParams({ quest: questId })
    }
  }

  // Restore state from URL params (for back button support)
  useEffect(() => {
    if (!data?.quests) return

    const questId = searchParams.get('quest')
    const lessonId = searchParams.get('lesson')
    const step = searchParams.get('step')

    if (questId) {
      const quest = data.quests.find(q => q.id === questId)
      if (quest) {
        setSelectedQuest(quest)
        setExpandedQuestIds(prev => new Set([...prev, questId]))

        if (lessonId && quest.lessons) {
          const lesson = quest.lessons.find(l => l.id === lessonId)
          if (lesson) {
            setSelectedLesson(lesson)
            // Set initial step if coming back from task page
            if (step !== null && step !== undefined) {
              setInitialStepIndex(parseInt(step, 10))
            }
          }
        }
      }
    }
  }, [data?.quests, searchParams])

  // Also check location.state for return navigation from quest page
  useEffect(() => {
    if (!data?.quests || !location.state?.returnToLesson) return

    const { questId, lessonId, stepIndex } = location.state.returnToLesson
    const quest = data.quests.find(q => q.id === questId)

    if (quest) {
      setSelectedQuest(quest)
      setExpandedQuestIds(prev => new Set([...prev, questId]))

      if (lessonId && quest.lessons) {
        const lesson = quest.lessons.find(l => l.id === lessonId)
        if (lesson) {
          setSelectedLesson(lesson)
          if (stepIndex !== null && stepIndex !== undefined) {
            setInitialStepIndex(stepIndex)
          }
        }
      }
    }

    // Clear the location state after restoring
    window.history.replaceState({}, document.title)
  }, [data?.quests, location.state])

  // Auto-expand first quest with lessons on load (only if no URL state)
  useEffect(() => {
    if (data?.quests?.length > 0 && expandedQuestIds.size === 0 && !searchParams.get('quest')) {
      const firstQuestWithLessons = data.quests.find(q => q.lessons?.length > 0)
      if (firstQuestWithLessons) {
        setExpandedQuestIds(new Set([firstQuestWithLessons.id]))
      }
    }
  }, [data?.quests, searchParams])

  const toggleQuestExpand = (questId) => {
    setExpandedQuestIds(prev => {
      const next = new Set(prev)
      if (next.has(questId)) {
        next.delete(questId)
      } else {
        next.add(questId)
      }
      return next
    })
  }

  // Track current step index from CurriculumView for back navigation
  const [currentStepIndex, setCurrentStepIndex] = useState(0)

  const handleSelectQuest = (quest) => {
    setSelectedQuest(quest)
    setSelectedLesson(null)
    setIsMobileSidebarOpen(false)
    setInitialStepIndex(null)
    // Update URL params
    setSearchParams({ quest: quest.id })
  }

  const handleSelectLesson = (quest, lesson) => {
    setSelectedQuest(quest)
    setSelectedLesson(lesson)
    setIsMobileSidebarOpen(false)
    setInitialStepIndex(null)
    // Update URL params
    setSearchParams({ quest: quest.id, lesson: lesson.id })
  }

  const handleStartQuest = () => {
    if (selectedQuest) {
      navigate(`/quests/${selectedQuest.id}`)
    }
  }

  const handleTaskClick = (task) => {
    // Store return info in sessionStorage for back navigation
    // Navigation is handled by the Link component in CurriculumView
    const returnInfo = {
      pathname: `/courses/${courseId}`,
      search: `?quest=${selectedQuest?.id}&lesson=${selectedLesson?.id}&step=${currentStepIndex}`,
      lessonTitle: selectedLesson?.title,
      questTitle: selectedQuest?.title
    }
    sessionStorage.setItem('courseTaskReturnInfo', JSON.stringify(returnInfo))
  }

  const handleBackToOverview = () => {
    setSelectedQuest(null)
    setSelectedLesson(null)
    setInitialStepIndex(null)
    // Clear URL params
    setSearchParams({})
  }

  const handleCloseLesson = () => {
    if (hasUnsavedChanges) {
      const shouldSave = window.confirm(
        'You have unsaved progress. Would you like to save before leaving?\n\nClick OK to save and close, or Cancel to discard changes.'
      )
      if (shouldSave && saveProgressFn) {
        saveProgressFn()
      }
    }
    if (isFullscreen) setIsFullscreen(false)
    setSelectedLesson(null)
    setHasUnsavedChanges(false)
    setInitialStepIndex(null)
    // Update URL to just show quest
    if (selectedQuest) {
      setSearchParams({ quest: selectedQuest.id })
    }
  }

  // Callback to track step changes from CurriculumView
  const handleStepChange = (stepIndex) => {
    setCurrentStepIndex(stepIndex)
    // Update URL with current step for bookmarking/sharing
    if (selectedQuest && selectedLesson) {
      setSearchParams({ quest: selectedQuest.id, lesson: selectedLesson.id, step: stepIndex.toString() })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  if (error) {
    const errorMessage = error?.response?.data?.error || error?.message || 'Unknown error'
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Unable to load course</h2>
          <p className="text-gray-600 mb-2">Please try again later</p>
          <p className="text-sm text-gray-400 mb-4 font-mono">{errorMessage}</p>
          <button
            onClick={() => navigate('/courses')}
            className="px-4 py-2 bg-optio-purple text-white rounded-lg hover:opacity-90"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  const { course, quests, progress, enrollment } = data
  // User is enrolled if they have a formal enrollment with 'active' status
  const isEnrolled = enrollment?.id != null && enrollment?.status === 'active'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto px-2 sm:px-4 lg:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            {/* Left: Back + Title (clickable together) */}
            <button
              onClick={() => navigate('/courses')}
              className="flex items-center gap-2 sm:gap-3 p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors min-w-0"
            >
              <ChevronLeftIcon className="w-5 h-5 flex-shrink-0" />
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                {course.title}
              </h1>
            </button>

            {/* Right: Progress */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="hidden sm:flex items-center gap-2">
                {progress.percentage >= 100 ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-600">
                    <CheckCircleSolid className="w-5 h-5" />
                    Complete
                  </span>
                ) : (
                  <>
                    <span className="text-sm text-gray-600">
                      {progress.earned_xp || 0}/{progress.total_xp || 0} XP
                    </span>
                    <div className="w-24 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-optio-purple to-optio-pink h-2 rounded-full"
                        style={{ width: `${progress.percentage}%` }}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Enroll, End Course, or Unenroll Buttons */}
              {isEnrolled ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleEndCourse}
                    disabled={isEnding || isUnenrolling}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 border border-gray-300 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                    title="Complete course (progress will be saved)"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">{isEnding ? 'Completing...' : 'Complete'}</span>
                  </button>
                  <button
                    onClick={handleUnenroll}
                    disabled={isUnenrolling || isEnding}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                    title="Unenroll from course (deletes all progress)"
                  >
                    <XMarkIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">{isUnenrolling ? 'Unenrolling...' : 'Unenroll'}</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleEnroll}
                  disabled={isEnrolling}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                  title="Enroll in this course"
                >
                  <PlayCircleIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">{isEnrolling ? 'Enrolling...' : 'Enroll'}</span>
                </button>
              )}

              {/* Mobile Sidebar Toggle */}
              <button
                onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
                className="lg:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              >
                <BookOpenIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-screen-2xl mx-auto px-2 sm:px-4 lg:px-6 py-4">
        <div className="flex gap-6">
          {/* Sidebar */}
          <div
            className={`
              lg:block lg:w-80 flex-shrink-0
              ${isMobileSidebarOpen ? 'fixed inset-0 z-40 bg-white p-4 overflow-y-auto' : 'hidden'}
            `}
          >
            {/* Mobile close overlay */}
            {isMobileSidebarOpen && (
              <div
                className="fixed inset-0 bg-black/50 -z-10 lg:hidden"
                onClick={() => setIsMobileSidebarOpen(false)}
              />
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-4 h-full lg:max-h-[calc(100vh-150px)] lg:overflow-y-auto">
              {/* Course Progress Summary - Clickable to go to overview */}
              <button
                onClick={() => {
                  setSelectedQuest(null)
                  setSelectedLesson(null)
                }}
                className="w-full mb-4 p-3 bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-lg hover:from-optio-purple/10 hover:to-optio-pink/10 transition-colors text-left"
              >
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Course Progress</span>
                  {progress.percentage >= 100 ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-green-600">
                      <CheckCircleSolid className="w-4 h-4" />
                      Complete
                    </span>
                  ) : (
                    <span className="font-semibold">{Math.round(progress.percentage)}%</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mb-2">
                  {progress.earned_xp || 0} / {progress.total_xp || 0} XP
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      progress.percentage >= 100
                        ? 'bg-green-500'
                        : 'bg-gradient-to-r from-optio-purple to-optio-pink'
                    }`}
                    style={{ width: `${Math.min(100, progress.percentage)}%` }}
                  />
                </div>
              </button>

              {/* Projects List */}
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Projects ({quests.length})
              </h2>

              {quests.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No projects in this course yet.
                </p>
              ) : (
                <div className="space-y-1">
                  {quests.map((quest, index) => (
                    <ExpandableQuestItem
                      key={quest.id}
                      quest={quest}
                      index={index}
                      isExpanded={expandedQuestIds.has(quest.id)}
                      isSelected={selectedQuest?.id === quest.id}
                      onToggleExpand={toggleQuestExpand}
                      onSelectQuest={handleSelectQuest}
                      onSelectLesson={handleSelectLesson}
                      selectedLessonId={selectedLesson?.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-gray-200 min-h-[600px]">
              {selectedLesson ? (
                /* Lesson View - Embed CurriculumView */
                <div className={`h-full ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : ''}`}>
                  <div className="p-4 border-b border-gray-200 flex items-center gap-2">
                    <button
                      onClick={handleCloseLesson}
                      className="flex items-center gap-2 p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <ChevronLeftIcon className="w-5 h-5" />
                      <span className="text-sm text-gray-500 truncate">
                        {selectedQuest?.title}
                      </span>
                    </button>
                    <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="font-medium text-gray-900 truncate flex-1">
                      {selectedLesson.title}
                    </span>
                    {/* Unsaved indicator */}
                    {hasUnsavedChanges && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                        Unsaved
                      </span>
                    )}
                    {/* Fullscreen Toggle */}
                    <button
                      onClick={() => setIsFullscreen(!isFullscreen)}
                      className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                      title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                    >
                      {isFullscreen ? (
                        <ArrowsPointingInIcon className="w-5 h-5" />
                      ) : (
                        <ArrowsPointingOutIcon className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  <div className={isFullscreen ? 'h-[calc(100vh-57px)] overflow-y-auto' : ''}>
                    <CurriculumView
                      questId={selectedQuest?.id}
                      lessons={selectedQuest?.lessons}
                      isAdmin={false}
                      initialLessonId={selectedLesson.id}
                      initialStepIndex={initialStepIndex}
                      embedded={true}
                      onUnsavedChangesChange={setHasUnsavedChanges}
                      onSaveProgress={setSaveProgressFn}
                      onTaskClick={handleTaskClick}
                      onStepChange={handleStepChange}
                      onLessonSelect={(lesson) => {
                        setSelectedLesson(lesson)
                        setSearchParams({ quest: selectedQuest.id, lesson: lesson.id })
                      }}
                    />
                  </div>
                </div>
              ) : selectedQuest ? (
                /* Quest Detail View */
                <QuestDetail
                  quest={selectedQuest}
                  onSelectLesson={handleSelectLesson}
                  onStartQuest={handleStartQuest}
                  fallbackImageUrl={course?.cover_image_url}
                />
              ) : (
                /* Course Overview (default) */
                <CourseOverview
                  course={course}
                  quests={quests}
                  progress={progress}
                  onSelectQuest={handleSelectQuest}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Incomplete Projects Modal */}
      {incompleteProjectsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-amber-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <ExclamationTriangleIcon className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Cannot Complete Course Yet</h2>
                  <p className="text-sm text-gray-600">Some projects still need work</p>
                </div>
              </div>
              <button
                onClick={() => setIncompleteProjectsModal(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-4 overflow-y-auto max-h-[50vh]">
              <p className="text-gray-600 mb-4">
                To complete this course, all required projects must meet their completion requirements:
              </p>
              <ul className="text-sm text-gray-600 mb-4 list-disc list-inside">
                <li>Reach the XP goal (if set)</li>
                <li>Complete all required tasks</li>
              </ul>

              <h3 className="font-medium text-gray-900 mb-3">
                Incomplete Projects ({incompleteProjectsModal.projects?.length || 0})
              </h3>

              <div className="space-y-3">
                {incompleteProjectsModal.projects?.map((project) => (
                  <div
                    key={project.quest_id}
                    className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 truncate">{project.title}</h4>
                        <div className="mt-2 space-y-1">
                          {/* XP Status */}
                          {project.requirements?.required_xp > 0 && (
                            <div className={`flex items-center gap-2 text-sm ${
                              project.requirements?.xp_met ? 'text-green-600' : 'text-amber-600'
                            }`}>
                              {project.requirements?.xp_met ? (
                                <CheckCircleSolid className="w-4 h-4" />
                              ) : (
                                <ExclamationCircleIcon className="w-4 h-4" />
                              )}
                              <span>
                                XP: {project.requirements?.earned_xp || 0}/{project.requirements?.required_xp || 0}
                              </span>
                            </div>
                          )}
                          {/* Required Tasks Status */}
                          {project.requirements?.total_required_tasks > 0 && (
                            <div className={`flex items-center gap-2 text-sm ${
                              project.requirements?.required_tasks_met ? 'text-green-600' : 'text-amber-600'
                            }`}>
                              {project.requirements?.required_tasks_met ? (
                                <CheckCircleSolid className="w-4 h-4" />
                              ) : (
                                <ExclamationCircleIcon className="w-4 h-4" />
                              )}
                              <span>
                                Required tasks: {project.requirements?.completed_required_tasks || 0}/{project.requirements?.total_required_tasks || 0}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleGoToProject(project.quest_id)}
                        className="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-optio-purple hover:text-white hover:bg-optio-purple border border-optio-purple rounded-lg transition-colors"
                      >
                        Go to Project
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setIncompleteProjectsModal(null)}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Got it, I'll finish my projects
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CourseHomepage
