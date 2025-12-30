import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  LockClosedIcon,
  PlayCircleIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import { useCourseHomepage } from '../../hooks/api/useCourseData'
import CurriculumView from '../../components/curriculum/CurriculumView'

/**
 * ExpandableQuestItem - Sidebar quest item with nested lessons
 * Matches CourseBuilder styling but without drag/edit actions
 */
const ExpandableQuestItem = ({
  quest,
  isExpanded,
  isSelected,
  onToggleExpand,
  onSelectQuest,
  onSelectLesson,
  selectedLessonId,
}) => {
  const isCompleted = quest.progress?.is_completed
  const hasXP = quest.progress?.total_xp > 0
  const xpText = hasXP
    ? `${quest.progress.earned_xp || 0}/${quest.progress.total_xp} XP`
    : null

  return (
    <div className="mb-2">
      {/* Quest Header */}
      <div
        className={`flex items-center gap-2 p-3 rounded-lg transition-all cursor-pointer ${
          isSelected && !selectedLessonId
            ? 'bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 border-2 border-optio-purple'
            : 'bg-white border border-gray-200 hover:border-optio-purple/50'
        }`}
      >
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
          {quest.sequence_order + 1}
        </span>

        {/* Quest Title */}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => onSelectQuest(quest)}
        >
          <h4 className="font-medium text-gray-900 text-sm leading-snug truncate">
            {quest.title || 'Untitled Project'}
          </h4>
          {xpText && (
            <span className="text-xs text-gray-500">{xpText}</span>
          )}
        </div>

        {/* Completion Status */}
        {isCompleted ? (
          <CheckCircleSolid className="w-5 h-5 text-green-500 flex-shrink-0" />
        ) : hasXP ? (
          <span className="text-xs text-gray-500 flex-shrink-0">
            {Math.round(quest.progress.percentage)}%
          </span>
        ) : null}
      </div>

      {/* Nested Lessons */}
      {isExpanded && quest.lessons && quest.lessons.length > 0 && (
        <div className="ml-8 mt-1 space-y-1">
          {quest.lessons.map((lesson, idx) => {
            const isLessonCompleted = lesson.progress?.status === 'completed'
            const isLessonSelected = selectedLessonId === lesson.id

            return (
              <div
                key={lesson.id}
                onClick={() => onSelectLesson(quest, lesson)}
                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
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
              <span className="font-semibold text-gray-900">
                {Math.round(progress.percentage)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-optio-purple to-optio-pink h-3 rounded-full transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Projects Grid */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Projects</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quests.map((quest) => {
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
                  {quest.sequence_order + 1}
                </span>

                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 mb-1">{quest.title}</h3>
                  {quest.description && (
                    <p className="text-sm text-gray-500 line-clamp-2">
                      {quest.description}
                    </p>
                  )}

                  {/* Progress */}
                  <div className="mt-3 flex items-center gap-2">
                    {isCompleted ? (
                      <span className="inline-flex items-center gap-1 text-sm text-green-600 font-medium">
                        <CheckCircleSolid className="w-4 h-4" />
                        Completed
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
const QuestDetail = ({ quest, onSelectLesson, onStartQuest }) => {
  const isCompleted = quest.progress?.is_completed
  const hasLessons = quest.lessons && quest.lessons.length > 0

  return (
    <div className="p-6">
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
            <span className="font-semibold text-gray-900">
              {Math.round(quest.progress.percentage)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-optio-purple to-optio-pink h-2 rounded-full transition-all"
              style={{ width: `${quest.progress.percentage}%` }}
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
                  className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-optio-purple/50 hover:shadow-sm transition-all"
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
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:opacity-90 transition-opacity"
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

  // Fetch course data
  const { data, isLoading, error } = useCourseHomepage(courseId)

  // State for sidebar navigation
  const [expandedQuestIds, setExpandedQuestIds] = useState(new Set())
  const [selectedQuest, setSelectedQuest] = useState(null)
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  // Auto-expand first quest with lessons on load
  useEffect(() => {
    if (data?.quests?.length > 0 && expandedQuestIds.size === 0) {
      const firstQuestWithLessons = data.quests.find(q => q.lessons?.length > 0)
      if (firstQuestWithLessons) {
        setExpandedQuestIds(new Set([firstQuestWithLessons.id]))
      }
    }
  }, [data?.quests])

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

  const handleSelectQuest = (quest) => {
    setSelectedQuest(quest)
    setSelectedLesson(null)
    setIsMobileSidebarOpen(false)
  }

  const handleSelectLesson = (quest, lesson) => {
    setSelectedQuest(quest)
    setSelectedLesson(lesson)
    setIsMobileSidebarOpen(false)
  }

  const handleStartQuest = () => {
    if (selectedQuest) {
      navigate(`/quests/${selectedQuest.id}`)
    }
  }

  const handleBackToOverview = () => {
    setSelectedQuest(null)
    setSelectedLesson(null)
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
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-optio-purple text-white rounded-lg hover:opacity-90"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  const { course, quests, progress } = data

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            {/* Left: Back + Title (clickable together) */}
            <button
              onClick={() => navigate('/dashboard')}
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
                <span className="text-sm text-gray-600">
                  {progress.earned_xp || 0}/{progress.total_xp || 0} XP
                </span>
                <div className="w-24 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-optio-purple to-optio-pink h-2 rounded-full"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
              </div>

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
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6">
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
                  <span className="font-semibold">{Math.round(progress.percentage)}%</span>
                </div>
                <div className="text-xs text-gray-500 mb-2">
                  {progress.earned_xp || 0} / {progress.total_xp || 0} XP
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-optio-purple to-optio-pink h-2 rounded-full"
                    style={{ width: `${progress.percentage}%` }}
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
                  {quests.map((quest) => (
                    <ExpandableQuestItem
                      key={quest.id}
                      quest={quest}
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
                <div className="h-full">
                  <div className="p-4 border-b border-gray-200 flex items-center gap-2">
                    <button
                      onClick={() => setSelectedLesson(null)}
                      className="p-1 text-gray-600 hover:text-gray-900"
                    >
                      <ChevronLeftIcon className="w-5 h-5" />
                    </button>
                    <span className="text-sm text-gray-500">
                      {selectedQuest?.title}
                    </span>
                    <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-900">
                      {selectedLesson.title}
                    </span>
                  </div>
                  <CurriculumView
                    questId={selectedQuest?.id}
                    isAdmin={false}
                    initialLessonId={selectedLesson.id}
                    embedded={true}
                  />
                </div>
              ) : selectedQuest ? (
                /* Quest Detail View */
                <QuestDetail
                  quest={selectedQuest}
                  onSelectLesson={handleSelectLesson}
                  onStartQuest={handleStartQuest}
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
    </div>
  )
}

export default CourseHomepage
