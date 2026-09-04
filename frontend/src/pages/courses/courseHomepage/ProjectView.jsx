/**
 * Extracted from pages/courses/CourseHomepage.jsx on 2026-09-04 (QF-02).
 * That file was 1,654 lines with five components in it; this is one of them,
 * moved verbatim. No behaviour changed -- only the address.
 */

import React, { useState, useEffect, lazy, Suspense } from 'react'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlayCircleIcon,
  PlusIcon,
  ClipboardDocumentListIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import toast from 'react-hot-toast'

import { getPillarData } from '../../../utils/pillarMappings'
import stripHtml from './stripHtml'
import CourseTaskItem from './CourseTaskItem'

const QuestPersonalizationWizard = lazy(() => import('../../../components/quests/QuestPersonalizationWizard'))

/**
 * ProjectView - Task-first project content view
 */
const ProjectView = ({ quest, onSelectLesson, fallbackImageUrl, questTasks, questTasksLoading, onTaskComplete, onTaskRemove, onAcceptSuggestion, onWizardComplete, refetchCourse, preview = false }) => {
  const isCompleted = quest.progress?.is_completed
  const hasLessons = quest.lessons && quest.lessons.length > 0
  const headerImage = quest.header_image_url || quest.image_url || fallbackImageUrl
  const totalXp = quest.progress?.total_xp || 0
  const earnedXp = quest.progress?.earned_xp || 0
  const [lessonsExpanded, setLessonsExpanded] = useState(true)
  const [addedSuggestionIds, setAddedSuggestionIds] = useState(new Set())
  const [showWizard, setShowWizard] = useState(false)
  const [localEarnedXp, setLocalEarnedXp] = useState(earnedXp)

  // Reset local XP when quest changes
  useEffect(() => {
    setLocalEarnedXp(quest.progress?.earned_xp || 0)
    setAddedSuggestionIds(new Set())
    setLessonsExpanded(true)
  }, [quest.id])

  const tasks = questTasks || []
  const userTaskTitles = new Set(tasks.map(t => t.title))
  const suggestedTasks = (quest.suggested_tasks || []).filter(
    t => !addedSuggestionIds.has(t.id) && !userTaskTitles.has(t.title)
  )
  const pct = totalXp > 0 ? Math.round((localEarnedXp / totalXp) * 100) : 0

  const handleLocalTaskComplete = (taskId, xpValue) => {
    setLocalEarnedXp(prev => prev + xpValue)
    onTaskComplete(quest.id, taskId, xpValue)
    toast.success(`+${xpValue} XP earned!`)
  }

  const handleAddSuggestion = async (suggestion) => {
    if (preview) {
      toast('Preview only - student actions are disabled here')
      return
    }
    setAddedSuggestionIds(prev => new Set(prev).add(suggestion.id))
    await onAcceptSuggestion(quest.id, suggestion)
    toast.success('Task added!')
  }

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

      {/* Project Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{quest.title}</h1>
        {quest.description && (
          <p className="text-gray-600">{stripHtml(quest.description)}</p>
        )}
      </div>

      {/* XP Progress Bar */}
      {totalXp > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600 font-medium">
              {localEarnedXp} / {totalXp} XP earned
            </span>
            {(isCompleted || quest.progress?.can_complete) ? (
              <span className="inline-flex items-center gap-1 font-semibold text-green-600">
                <CheckCircleSolid className="w-5 h-5" />
                Complete
              </span>
            ) : (
              <span className="font-semibold text-gray-900">
                {Math.min(pct, 100)}%
              </span>
            )}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                isCompleted || quest.progress?.can_complete
                  ? 'bg-green-500'
                  : 'bg-gradient-primary'
              }`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>

          {/* Callout (inside the XP container) — switches once the XP goal is met */}
          {(isCompleted || quest.progress?.can_complete) ? (
            <div className="flex items-center gap-3 mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
              <CheckCircleSolid className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-sm text-gray-700">
                You've met the XP goal for this project! Feel free to explore more here, or move on to the next one.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 mt-4 p-3 bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-lg border border-optio-purple/10">
              <SparklesIcon className="w-5 h-5 text-optio-purple flex-shrink-0" />
              <p className="text-sm text-gray-600">
                Complete tasks to earn XP. Reach <span className="font-semibold text-gray-900">{totalXp} XP</span> to complete this project.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Lessons */}
      {hasLessons && (
        <div className="mb-6">
          <button
            onClick={() => setLessonsExpanded(!lessonsExpanded)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 hover:text-gray-700 transition-colors"
          >
            {lessonsExpanded ? (
              <ChevronDownIcon className="w-4 h-4" />
            ) : (
              <ChevronRightIcon className="w-4 h-4" />
            )}
            Lessons ({quest.lessons.length})
          </button>
          {lessonsExpanded && (
            <div className="space-y-2">
              {quest.lessons.map((lesson, idx) => {
                const isLessonCompleted = lesson.progress?.status === 'completed'
                return (
                  <div
                    key={lesson.id}
                    onClick={() => onSelectLesson(quest, lesson)}
                    className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-optio-purple/50 hover:shadow-sm transition-all"
                  >
                    <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center bg-optio-purple/10 text-optio-purple rounded-full text-xs font-medium">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 text-sm">{lesson.title}</h3>
                      {lesson.estimated_duration_minutes && (
                        <span className="text-xs text-gray-500">{lesson.estimated_duration_minutes} min</span>
                      )}
                    </div>
                    {isLessonCompleted ? (
                      <CheckCircleSolid className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : (
                      <PlayCircleIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Your Tasks */}
      <div className="mb-6" data-onboarding="project-tasks">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Your Tasks
        </h2>
        {questTasksLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : tasks.length > 0 ? (
          <div className="space-y-2">
            {tasks.map(task => (
              <CourseTaskItem
                key={task.id}
                task={task}
                preview={preview}
                onComplete={handleLocalTaskComplete}
                onRemove={onTaskRemove ? (taskId) => onTaskRemove(quest.id, taskId) : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <ClipboardDocumentListIcon className="w-6 h-6 text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-700">No tasks yet</p>
              <p className="text-xs text-gray-500">Add a suggested task, or create your own below.</p>
            </div>
          </div>
        )}

        {/* Create your own (merged into Your Tasks) */}
        {!isCompleted && (
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200 mt-3">
            <p className="text-sm text-gray-600">
              Write a custom task or use AI to generate personalized ideas.
            </p>
            <button
              onClick={() => {
                if (preview) {
                  toast('Preview only - student actions are disabled here')
                  return
                }
                setShowWizard(true)
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-optio-purple bg-optio-purple/5 border border-optio-purple/20 rounded-lg hover:bg-optio-purple/10 transition-colors flex-shrink-0 ml-3"
            >
              <SparklesIcon className="w-4 h-4" />
              Create Tasks
            </button>
          </div>
        )}
      </div>

      {/* Suggested Tasks */}
      {suggestedTasks.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Suggested Tasks
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {suggestedTasks.map(suggestion => {
              const sPillar = getPillarData(suggestion.pillar)
              return (
                <div
                  key={suggestion.id}
                  className={`flex-shrink-0 w-52 bg-white border border-gray-200 rounded-xl p-3 border-l-4 ${sPillar?.border || 'border-l-gray-300'}`}
                >
                  <h4 className="text-sm font-medium text-gray-900 line-clamp-2 mb-2">{suggestion.title}</h4>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${sPillar?.bg || 'bg-gray-100'} ${sPillar?.text || 'text-gray-600'}`}>
                        {sPillar?.name || suggestion.pillar}
                      </span>
                      <span className="text-xs text-gray-500">{suggestion.xp_value || 0} XP</span>
                    </div>
                    <button
                      onClick={() => handleAddSuggestion(suggestion)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-optio-purple bg-optio-purple/5 rounded-lg hover:bg-optio-purple/10 transition-colors"
                    >
                      <PlusIcon className="w-3 h-3" />
                      Add
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Personalization Wizard Modal */}
      {showWizard && (
        <Suspense fallback={
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-8 flex flex-col items-center gap-4 shadow-2xl">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
              <p className="text-lg font-semibold text-gray-700">Loading task creator...</p>
            </div>
          </div>
        }>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
              <QuestPersonalizationWizard
                questId={quest.id}
                questTitle={quest.title}
                onComplete={() => {
                  setShowWizard(false)
                  onWizardComplete(quest.id)
                }}
                onCancel={() => setShowWizard(false)}
                hideDiplomaSubjects
              />
            </div>
          </div>
        </Suspense>
      )}

    </div>
  )
}

export default ProjectView
