import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayCircleIcon,
  BookOpenIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  QuestionMarkCircleIcon,
  EyeIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid, ExclamationCircleIcon } from '@heroicons/react/24/solid'
import { useCourseHomepage } from '../../hooks/api/useCourseData'
import CurriculumView from '../../components/curriculum/CurriculumView'
import { endCourse, enrollInCourse, unenrollFromCourse } from '../../services/courseService'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { OnboardingProvider, useOnboarding } from '../../contexts/OnboardingContext'
import CourseOnboardingSteps from '../../components/onboarding/CourseOnboardingSteps'
import api from '../../services/api'
import { useConfirm } from '../../contexts/ConfirmContext'


// The presentational pieces this page is built from live in ./courseHomepage.
// They came out on 2026-09-04 (QF-02): this file was 1,654 lines, and the four
// components below accounted for 800 of them without touching the page's state.
import ExpandableQuestItem from './courseHomepage/ExpandableQuestItem'
import CourseOverview from './courseHomepage/CourseOverview'
import ProjectView from './courseHomepage/ProjectView'
/**
 * CourseHomepage - Main course homepage with sidebar navigation
 */
const CourseHomepageInner = ({ courseId: propCourseId, preview = false, onClose }) => {
  const confirm = useConfirm()
  const params = useParams()
  const courseId = propCourseId || params.courseId
  const navigate = useNavigate()
  const [urlSearchParams, setUrlSearchParams] = useSearchParams()
  // A preview renders this page inside a modal on another surface (the SIS
  // console), so its quest/lesson selection is kept in local state instead of
  // the address bar -- everything else on the page is the student view as-is.
  const [localSearchParams, setLocalSearchParams] = useState(() => new URLSearchParams())
  const searchParams = preview ? localSearchParams : urlSearchParams
  const setSearchParams = preview
    ? (next) => setLocalSearchParams(new URLSearchParams(next))
    : setUrlSearchParams
  const location = useLocation()
  const { user } = useAuth()
  const { isActive: isOnboarding, currentStep: onboardingStep, startOnboarding } = useOnboarding()

  // Fetch course data
  const { data, isLoading, error, refetch } = useCourseHomepage(courseId)

  // State for sidebar navigation
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

  // Task state management
  const [questTasks, setQuestTasks] = useState({}) // questId -> task[]
  const [questTasksLoading, setQuestTasksLoading] = useState(false)
  const sessionRefs = useRef({}) // questId -> session_id

  // Fetch user tasks when a quest is selected
  const fetchQuestTasks = useCallback(async (questId) => {
    if (questTasks[questId]) return // Already loaded
    setQuestTasksLoading(true)
    try {
      const { data } = await api.get(`/api/quests/${questId}`)
      const q = data.quest || data
      setQuestTasks(prev => ({ ...prev, [questId]: q.quest_tasks || [] }))
    } catch {
      setQuestTasks(prev => ({ ...prev, [questId]: [] }))
    } finally {
      setQuestTasksLoading(false)
    }
  }, [questTasks])

  // Handle task completion (optimistic update)
  const handleTaskComplete = useCallback((questId, taskId, xpValue) => {
    setQuestTasks(prev => ({
      ...prev,
      [questId]: (prev[questId] || []).map(t =>
        t.id === taskId ? { ...t, is_completed: true, completed_at: new Date().toISOString() } : t
      )
    }))
    // Refetch course data after a short delay for server sync
    setTimeout(() => refetch(), 1500)
  }, [refetch])

  // Handle accepting a suggested task
  const handleAcceptSuggestion = useCallback(async (questId, suggestion) => {
    try {
      // Ensure personalization session
      if (!sessionRefs.current[questId]) {
        const { data } = await api.post(`/api/quests/${questId}/start-personalization`, {})
        sessionRefs.current[questId] = data.session_id
      }
      const { data } = await api.post(`/api/quests/${questId}/personalization/accept-task`, {
        session_id: sessionRefs.current[questId],
        task: suggestion,
      })
      const newTask = data.task || {
        id: data.task_id || `temp-${Date.now()}`,
        title: suggestion.title,
        description: suggestion.description || '',
        pillar: suggestion.pillar || 'stem',
        xp_value: suggestion.xp_value || 50,
        is_completed: false,
        is_required: false,
      }
      setQuestTasks(prev => ({
        ...prev,
        [questId]: [...(prev[questId] || []), newTask]
      }))
    } catch (err) {
      toast.error('Failed to add task')
      throw err
    }
  }, [])

  // Handle removing a task from a project
  const handleTaskRemove = useCallback(async (questId, taskId) => {
    try {
      await api.delete(`/api/tasks/${taskId}`)
      setQuestTasks(prev => ({
        ...prev,
        [questId]: (prev[questId] || []).filter(t => t.id !== taskId)
      }))
      toast.success('Task removed')
      // Refetch course data so XP/progress stay in sync
      setTimeout(() => refetch(), 1000)
    } catch (err) {
      toast.error('Failed to remove task')
    }
  }, [refetch])

  // Handle wizard completion -- refetch tasks for the quest
  const handleWizardComplete = useCallback(async (questId) => {
    try {
      const { data } = await api.get(`/api/quests/${questId}`)
      const q = data.quest || data
      setQuestTasks(prev => ({ ...prev, [questId]: q.quest_tasks || [] }))
    } catch { /* error */ }
    refetch()
  }, [refetch])

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
    if (!(await confirm('Are you sure you want to end this course? Your progress and XP will be preserved.'))) {
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
    if (!(await confirm('Are you sure you want to unenroll from this course? This will DELETE all your progress, tasks, and XP from this course. This cannot be undone.'))) {
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
      fetchQuestTasks(quest.id)
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
        fetchQuestTasks(quest.id)

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
      fetchQuestTasks(quest.id)

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

  // Trigger onboarding walkthrough for first-time users (never in a preview --
  // the walkthrough is the student's, not the previewing admin's)
  useEffect(() => {
    if (preview) return
    if (!data?.quests?.length || !user) return
    if (user.tutorial_completed_at) return
    if (searchParams.get('quest')) return // Don't start if deep-linking
    startOnboarding()
  }, [data?.quests, user?.tutorial_completed_at])

  // Manage sidebar state during onboarding steps
  useEffect(() => {
    if (!isOnboarding || !data?.quests?.length) return

    // Steps 0-3: no quest selected (centered cards + quest-item highlight)
    if (onboardingStep < 4) {
      setSelectedQuest(null)
      setSelectedLesson(null)
      return
    }

    // Step 4+: select first quest to show the task-first project view
    const firstQuest = data.quests[0]
    if (firstQuest) {
      setSelectedQuest(firstQuest)
      setSelectedLesson(null)
      fetchQuestTasks(firstQuest.id)
    }
  }, [isOnboarding, onboardingStep, data?.quests])

  // Auto-select next-step quest on load (only if no URL state and not onboarding)
  useEffect(() => {
    if (isOnboarding) return
    if (!preview && user && !user.tutorial_completed_at) return // Onboarding about to start
    if (data?.quests?.length > 0 && !selectedQuest && !searchParams.get('quest')) {
      if (next_step) {
        const quest = data.quests.find(q => q.id === next_step.quest_id)
        if (quest) {
          setSelectedQuest(quest)
          fetchQuestTasks(quest.id)
          setSearchParams({ quest: quest.id })
        }
      }
    }
  }, [data?.quests, searchParams])

  // Track current step index from CurriculumView for back navigation
  const [currentStepIndex, setCurrentStepIndex] = useState(0)

  const handleSelectQuest = (quest) => {
    setSelectedQuest(quest)
    setSelectedLesson(null)
    setIsMobileSidebarOpen(false)
    setInitialStepIndex(null)
    // Update URL params
    setSearchParams({ quest: quest.id })
    // Fetch tasks for this quest
    fetchQuestTasks(quest.id)
  }

  const handleSelectLesson = (quest, lesson) => {
    setSelectedQuest(quest)
    setSelectedLesson(lesson)
    setIsMobileSidebarOpen(false)
    setInitialStepIndex(null)
    // Update URL params
    setSearchParams({ quest: quest.id, lesson: lesson.id })
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

  const handleCloseLesson = async () => {
    if (hasUnsavedChanges) {
      const shouldSave = await confirm({
        title: 'Save your progress before leaving?',
        body: 'You have unsaved progress on this lesson.',
        confirmLabel: 'Save and close',
        cancelLabel: 'Discard changes',
        destructive: false,
      })
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

  // Finishing the last lesson step returns the student to the project homepage
  // so they can move on to the tasks. Save progress silently (no prompt).
  const handleExitToProject = () => {
    if (hasUnsavedChanges && saveProgressFn) {
      saveProgressFn()
    }
    if (isFullscreen) setIsFullscreen(false)
    setSelectedLesson(null)
    setHasUnsavedChanges(false)
    setInitialStepIndex(null)
    setSearchParams(selectedQuest ? { quest: selectedQuest.id } : {})
    // Refetch so the project view reflects the lesson progress
    refetch()
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
            onClick={() => (preview ? onClose?.() : navigate('/courses'))}
            className="px-4 py-2 bg-optio-purple text-white rounded-lg hover:opacity-90"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  const { course, quests, progress, enrollment, next_step } = data
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
              onClick={() => (preview ? onClose?.() : navigate('/courses'))}
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
                        className="bg-gradient-primary h-2 rounded-full"
                        style={{ width: `${progress.percentage}%` }}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Enroll, End Course, or Unenroll Buttons. A staff preview shows
                  the student view without the enrollment controls -- previewing
                  must never enroll the admin (or bill their school for it). */}
              {preview ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-optio-purple/30 bg-optio-purple/5 text-optio-purple text-sm font-medium">
                  <EyeIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Student view</span>
                </span>
              ) : isEnrolled ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      localStorage.removeItem('optio-onboarding-step')
                      startOnboarding()
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-optio-purple hover:text-optio-purple/80 hover:bg-optio-purple/5 border border-optio-purple/30 rounded-lg transition-colors text-sm font-medium"
                    title="View course tutorial"
                  >
                    <QuestionMarkCircleIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">Tutorial</span>
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
                  className="btn-primary"
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
                data-onboarding="course-progress"
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
                        : 'bg-gradient-primary'
                    }`}
                    style={{ width: `${Math.min(100, progress.percentage)}%` }}
                  />
                </div>
              </button>

              {/* Projects List */}
              <div data-onboarding="quest-item-0">
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
                      isSelected={selectedQuest?.id === quest.id}
                      onSelectQuest={handleSelectQuest}
                      isNextStep={next_step?.quest_id === quest.id}
                    />
                  ))}
                </div>
              )}
              </div>
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
                      previewMode={preview}
                      initialLessonId={selectedLesson.id}
                      initialStepIndex={initialStepIndex}
                      embedded={true}
                      questXpThreshold={selectedQuest?.xp_threshold || selectedQuest?.progress?.total_xp || 0}
                      onUnsavedChangesChange={setHasUnsavedChanges}
                      onSaveProgress={setSaveProgressFn}
                      onTaskClick={handleTaskClick}
                      onStepChange={handleStepChange}
                      onExitToProject={handleExitToProject}
                      onLessonSelect={(lesson) => {
                        setSelectedLesson(lesson)
                        setSearchParams({ quest: selectedQuest.id, lesson: lesson.id })
                      }}
                    />
                  </div>
                </div>
              ) : selectedQuest ? (
                /* Task-First Project View */
                <ProjectView
                  quest={selectedQuest}
                  preview={preview}
                  onSelectLesson={handleSelectLesson}
                  fallbackImageUrl={course?.cover_image_url}
                  questTasks={questTasks[selectedQuest.id]}
                  questTasksLoading={questTasksLoading}
                  onTaskComplete={handleTaskComplete}
                  onTaskRemove={handleTaskRemove}
                  onAcceptSuggestion={handleAcceptSuggestion}
                  onWizardComplete={handleWizardComplete}
                  refetchCourse={refetch}
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

      {/* Onboarding Walkthrough */}
      <CourseOnboardingSteps />

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

/**
 * The student course view.
 *
 * Routed at /courses/:courseId for students, and also rendered directly (with a
 * `courseId` prop and `preview`) by the SIS console so staff can open the exact
 * same view to review a course or demo it -- see CoursePreviewModal.
 */
const CourseHomepage = (props) => (
  <OnboardingProvider>
    <CourseHomepageInner {...props} />
  </OnboardingProvider>
)

export default CourseHomepage
