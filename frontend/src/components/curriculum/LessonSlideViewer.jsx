/**
 * LessonSlideViewer Component
 *
 * Slide-based lesson content viewer.
 * Shows one step at a time with navigation.
 * Handles content, finished, and tasks steps.
 */

import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  TrophyIcon,
  SparklesIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolidIcon, ExclamationCircleIcon } from '@heroicons/react/24/solid'
import { getPillarData } from '../../utils/pillarMappings'
import { getVideoEmbedUrl } from './utils/contentUtils'
import {
  TextStepContent,
  VideoStepContent,
  FileStepContent,
  StepLinks,
  StepAttachments
} from './content'
import AddTaskWizard from './AddTaskWizard'
import LessonHelperModal from './LessonHelperModal'
import SuggestedTasksModal from './SuggestedTasksModal'
import { useAIAccess } from '../../contexts/AIAccessContext'

export const LessonSlideViewer = ({
  lesson,
  steps = [],
  currentStepIndex = 0,
  completedSteps = new Set(),
  onNextStep,
  onPrevStep,
  linkedTasks = [],
  onTaskClick,
  hasTasksStep = false,
  totalStepsWithTasks = 0,
  questId,
  onTaskCreated,
  lessonXpThreshold = 0,
  lessonEarnedXP = 0,
  allLessons = [],
  allTasks = [],
  onLessonSelect,
}) => {
  const [showPersonalizeWizard, setShowPersonalizeWizard] = useState(false)
  const [showHelperModal, setShowHelperModal] = useState(false)
  const [showSuggestedTasksModal, setShowSuggestedTasksModal] = useState(false)
  const { canUseLessonHelper } = useAIAccess()

  // Calculate lesson data for project overview
  const projectLessonsData = useMemo(() => {
    if (!allLessons || allLessons.length === 0) return []

    return allLessons.map(lessonItem => {
      const lessonTasks = lessonItem.linked_task_ids?.length > 0
        ? allTasks.filter(task => lessonItem.linked_task_ids.includes(task.id))
        : []
      const requiredTasks = lessonTasks.filter(t => t.is_required === true)
      const completedRequiredTasks = requiredTasks.filter(t => t.is_completed === true)
      const earnedXp = lessonTasks.reduce((sum, t) => sum + (t.is_completed ? (t.xp_value || 0) : 0), 0)
      const completedTasks = lessonTasks.filter(t => t.is_completed === true)

      return {
        ...lessonItem,
        tasks: lessonTasks,
        requiredTasks,
        completedRequiredTasks,
        completedTasks,
        earnedXp,
        allRequiredComplete: requiredTasks.length === 0 || completedRequiredTasks.length === requiredTasks.length,
        isCurrentLesson: lessonItem.id === lesson?.id
      }
    })
  }, [allLessons, allTasks, lesson?.id])

  const totalContentSteps = steps.length
  // Tasks step is directly after content (no "finished" step in between)
  const isOnTasksStep = hasTasksStep && currentStepIndex === totalContentSteps
  const currentStep = isOnTasksStep ? null : (steps[currentStepIndex] || null)

  // Check if any step has content (or if there are tasks)
  const hasContent = (steps.length > 0 && steps.some(s =>
    (s.type === 'text' && s.content && s.content !== '<p></p>') ||
    (s.type === 'video' && s.video_url) ||
    (s.type === 'file' && s.files && s.files.length > 0)
  )) || hasTasksStep

  // Get video embed URL for video steps
  const videoEmbedUrl = currentStep?.type === 'video' ? getVideoEmbedUrl(currentStep?.video_url) : null

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500">
        <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          <DocumentTextIcon className="w-8 h-8 text-gray-400" />
        </div>
        <p className="text-lg font-medium">No content yet</p>
        <p className="text-sm">This lesson doesn't have any content.</p>
      </div>
    )
  }

  // Render Tasks Step
  if (isOnTasksStep) {
    // Separate required and optional tasks for current lesson
    const requiredTasks = linkedTasks.filter(t => t.is_required === true)
    const optionalTasks = linkedTasks.filter(t => t.is_required !== true)

    return (
      <div className="flex flex-col min-h-[400px]">
        <div className="flex-1">
          <div className="mb-4">
            <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <ClipboardDocumentListIcon className="w-6 h-6 text-optio-purple" />
              Apply What You Learned
            </h3>
          </div>

          {/* XP Requirement Info with Completion Status */}
          {lessonXpThreshold > 0 && (() => {
            const xpMet = lessonEarnedXP >= lessonXpThreshold
            // Calculate all required tasks across all lessons
            const allRequiredTasks = projectLessonsData.flatMap(l => l.requiredTasks || [])
            const allCompletedRequired = projectLessonsData.flatMap(l => l.completedRequiredTasks || [])
            const requiredTasksMet = allRequiredTasks.length === 0 || allCompletedRequired.length >= allRequiredTasks.length
            const canComplete = xpMet && requiredTasksMet

            return (
              <div className={`mb-6 p-4 rounded-xl border ${
                canComplete
                  ? 'bg-green-50 border-green-200'
                  : 'bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 border-optio-purple/20'
              }`}>
                <div className="flex items-center gap-3">
                  <TrophyIcon className={`w-8 h-8 flex-shrink-0 ${canComplete ? 'text-green-600' : 'text-optio-purple'}`} />
                  <div>
                    <p className="font-semibold text-gray-900">
                      Project XP Goal: <span className={xpMet ? 'text-green-600' : 'text-optio-purple'}>{lessonEarnedXP} / {lessonXpThreshold} XP</span>
                    </p>
                    {/* Completion status messaging */}
                    {canComplete ? (
                      <p className="text-sm text-green-700 mt-0.5 font-medium">
                        Ready to complete! You've met all requirements for this project.
                      </p>
                    ) : xpMet && !requiredTasksMet ? (
                      <p className="text-sm text-amber-700 mt-0.5">
                        XP goal reached! Complete all required tasks to finish this project.
                        <span className="font-medium"> ({allCompletedRequired.length}/{allRequiredTasks.length} required tasks done)</span>
                      </p>
                    ) : !xpMet && requiredTasksMet ? (
                      <p className="text-sm text-gray-600 mt-0.5">
                        All required tasks done! Earn {lessonXpThreshold - lessonEarnedXP} more XP to complete this project.
                      </p>
                    ) : (
                      <p className="text-sm text-gray-600 mt-0.5">
                        Complete tasks from any lesson to earn XP. Required tasks must be completed.
                      </p>
                    )}
                  </div>
                </div>
                {canComplete && (
                  <div className="mt-3 flex items-center gap-2 text-green-600">
                    <CheckCircleSolidIcon className="w-5 h-5" />
                    <span className="font-medium">All requirements met!</span>
                  </div>
                )}
              </div>
            )
          })()}

          {lessonXpThreshold === 0 && (
            <p className="text-gray-600 mb-6">
              Complete tasks to earn XP and progress through this project. Required tasks must be completed, but you can choose which optional tasks interest you.
            </p>
          )}

          {/* Required Tasks Section - Current Lesson */}
          {requiredTasks.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-red-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Required Task{requiredTasks.length !== 1 ? 's' : ''} for This Lesson ({requiredTasks.length})
              </h4>
              <div className="grid gap-4 sm:grid-cols-2">
                {requiredTasks.map((task) => {
                  const pillarData = getPillarData(task.pillar || 'wellness')
                  const isTaskCompleted = task.is_completed === true
                  const taskQuestId = task.quest_id || questId
                  return (
                    <Link
                      key={task.id}
                      to={`/quests/${taskQuestId}?task=${task.id}`}
                      onClick={() => {
                        // Store task title for matching on quest page (template ID -> title lookup)
                        sessionStorage.setItem(`task_title_${task.id}`, task.title)
                        onTaskClick?.(task)
                      }}
                      className={`
                        block p-4 rounded-xl border-2 text-left cursor-pointer w-full
                        transition-colors transition-shadow duration-150
                        hover:shadow-lg hover:border-optio-purple/50 active:scale-[0.98]
                        ${isTaskCompleted ? 'bg-green-50 border-green-200' : 'bg-white border-red-200'}
                      `}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${pillarData.color}20` }}
                        >
                          {isTaskCompleted ? (
                            <CheckCircleSolidIcon className="w-6 h-6 text-green-500" />
                          ) : (
                            <ClipboardDocumentListIcon className="w-5 h-5" style={{ color: pillarData.color }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-gray-900">{task.title}</p>
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded uppercase">
                              Required
                            </span>
                          </div>
                          {task.description && (
                            <p className="text-sm text-gray-600 line-clamp-2 mb-2">{task.description}</p>
                          )}
                          <div className="flex items-center gap-2">
                            <span
                              className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                              style={{ backgroundColor: pillarData.color }}
                            >
                              {pillarData.name}
                            </span>
                            {task.xp_value && (
                              <span className="text-xs font-semibold text-optio-purple">
                                +{task.xp_value} XP
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRightIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-2" />
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Optional Tasks Section - Current Lesson */}
          {questId && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                Optional Tasks
              </h4>
              <p className="text-sm text-gray-600 mb-4">
                Choose how you want to earn extra XP for this lesson.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Browse Suggested Tasks */}
                {optionalTasks.length > 0 && (
                  <button
                    onClick={() => setShowSuggestedTasksModal(true)}
                    className="p-4 rounded-xl border-2 border-gray-200 text-left transition-all duration-150 hover:shadow-lg hover:border-optio-purple/50 bg-white"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-50">
                        <ClipboardDocumentListIcon className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 mb-1">Browse Suggested Tasks</p>
                        <p className="text-sm text-gray-500">
                          View curated task ideas for this lesson
                        </p>
                      </div>
                      <ChevronRightIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-2" />
                    </div>
                  </button>
                )}

                {/* Create Your Own / AI Help */}
                <Link
                  to={`/quests/${questId}?showPersonalize=true`}
                  onClick={() => onTaskClick?.(null)}
                  className="p-4 rounded-xl border-2 border-dashed border-gray-300 text-left transition-all duration-150 hover:border-optio-purple hover:bg-optio-purple/5 hover:shadow-lg group"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-optio-purple/20 to-optio-pink/20 group-hover:from-optio-purple/30 group-hover:to-optio-pink/30 transition-colors">
                      <SparklesIcon className="w-5 h-5 text-optio-purple" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 mb-1">Create Your Own</p>
                      <p className="text-sm text-gray-500">
                        Design a task or get AI suggestions
                      </p>
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-2" />
                  </div>
                </Link>
              </div>
            </div>
          )}

          {/* Project Lessons Overview Section */}
          {projectLessonsData.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-4">
                <BookOpenIcon className="w-5 h-5 text-optio-purple" />
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Earn XP Across All Lessons
                </h4>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Complete tasks in any lesson to earn XP toward the project goal. Required tasks must be finished in every lesson.
              </p>
              <div className="space-y-3">
                {projectLessonsData.map((lessonItem, index) => {
                  const hasNoTasks = lessonItem.tasks.length === 0

                  return (
                    <button
                      key={lessonItem.id}
                      onClick={() => onLessonSelect?.(lessonItem)}
                      className={`
                        w-full p-4 rounded-xl border-2 text-left transition-all duration-150
                        hover:shadow-md hover:border-optio-purple/40
                        ${lessonItem.isCurrentLesson
                          ? 'bg-optio-purple/5 border-optio-purple/30 ring-2 ring-optio-purple/20'
                          : 'bg-white border-gray-200'
                        }
                      `}
                    >
                      <div className="flex items-start gap-3">
                        {/* Lesson number indicator */}
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold bg-gray-100 text-gray-600">
                          {index + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className={`font-semibold ${lessonItem.isCurrentLesson ? 'text-optio-purple' : 'text-gray-900'}`}>
                              {lessonItem.title}
                            </p>
                            {lessonItem.isCurrentLesson && (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-optio-purple/20 text-optio-purple rounded uppercase">
                                Current
                              </span>
                            )}
                          </div>

                          {/* Completed tasks and XP earned */}
                          <div className="flex items-center gap-3 text-sm text-gray-600">
                            <span>
                              {lessonItem.completedTasks.length} task{lessonItem.completedTasks.length !== 1 ? 's' : ''} completed
                            </span>
                            {lessonItem.earnedXp > 0 && (
                              <>
                                <span className="text-gray-300">|</span>
                                <span className="flex items-center gap-1">
                                  <TrophyIcon className="w-3.5 h-3.5 text-optio-purple" />
                                  <span className="font-medium text-optio-purple">{lessonItem.earnedXp} XP</span>
                                  <span>earned</span>
                                </span>
                              </>
                            )}
                          </div>

                          {/* Required tasks status */}
                          {lessonItem.requiredTasks.length > 0 && (
                            <div className={`flex items-center gap-1.5 mt-2 text-xs font-medium ${
                              lessonItem.allRequiredComplete ? 'text-green-600' : 'text-amber-600'
                            }`}>
                              {lessonItem.allRequiredComplete ? (
                                <>
                                  <CheckCircleSolidIcon className="w-4 h-4" />
                                  <span>{lessonItem.requiredTasks.length === 1 ? 'Required task complete' : `All ${lessonItem.requiredTasks.length} required tasks complete`}</span>
                                </>
                              ) : (
                                <>
                                  <ExclamationCircleIcon className="w-4 h-4" />
                                  <span>
                                    {lessonItem.completedRequiredTasks.length} of {lessonItem.requiredTasks.length} required task{lessonItem.requiredTasks.length !== 1 ? 's' : ''} complete
                                  </span>
                                </>
                              )}
                            </div>
                          )}

                          {hasNoTasks && (
                            <p className="text-xs text-gray-400 mt-1">No tasks in this lesson</p>
                          )}
                        </div>

                        <ChevronRightIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Empty state if no tasks in current lesson */}
          {linkedTasks.length === 0 && projectLessonsData.length === 0 && !questId && (
            <div className="text-center py-8 text-gray-500">
              <ClipboardDocumentListIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No tasks linked to this lesson yet.</p>
            </div>
          )}
        </div>

        {/* Navigation Footer for Tasks Step */}
        {totalStepsWithTasks > 1 && (
          <div className="mt-8 pt-6 border-t border-gray-200 flex items-center justify-between">
            <button
              onClick={onPrevStep}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              Previous
            </button>
            <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-lg border border-green-200">
              <CheckCircleSolidIcon className="w-5 h-5" />
              Lesson Complete
            </div>
          </div>
        )}

        {/* Suggested Tasks Modal - for tasks step */}
        <SuggestedTasksModal
          isOpen={showSuggestedTasksModal}
          onClose={() => setShowSuggestedTasksModal(false)}
          questId={questId}
          lessonTitle={lesson?.title}
          tasks={optionalTasks}
          onTaskActivated={() => {
            setShowSuggestedTasksModal(false)
          }}
        />
      </div>
    )
  }

  // Render Content Step
  return (
    <div className="flex flex-col min-h-[400px]">
      <div className="flex-1">
        {/* Step Title with Helper Button */}
        {currentStep && totalContentSteps > 1 && currentStep.title && (
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-900">
              {currentStep.title}
            </h3>
            {canUseLessonHelper && (
              <button
                onClick={() => setShowHelperModal(true)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-optio-purple hover:bg-optio-purple/5 transition-colors"
                title="Need help with this?"
              >
                <SparklesIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Helper button for steps without title */}
        {currentStep && (totalContentSteps === 1 || !currentStep.title) && canUseLessonHelper && (
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowHelperModal(true)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-optio-purple hover:bg-optio-purple/5 transition-colors"
              title="Need help with this?"
            >
              <SparklesIcon className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Step Content */}
        {currentStep && (
          <>
            {/* TEXT STEP */}
            {currentStep.type === 'text' && currentStep.content && currentStep.content !== '<p></p>' && (
              <TextStepContent content={currentStep.content} />
            )}

            {/* VIDEO STEP */}
            {currentStep.type === 'video' && (
              <VideoStepContent step={currentStep} lessonTitle={lesson.title} />
            )}

            {/* FILE STEP */}
            {currentStep.type === 'file' && (
              <FileStepContent step={currentStep} />
            )}

            {/* LINKS - shown for any step type */}
            <StepLinks links={currentStep.links} />

            {/* ATTACHMENTS - shown for any step type */}
            <StepAttachments attachments={currentStep.attachments} />
          </>
        )}
      </div>

      {/* Navigation Footer */}
      {totalStepsWithTasks > 1 && (
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <button
              onClick={onPrevStep}
              disabled={currentStepIndex === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors group"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              Previous
              <kbd className="hidden sm:inline-flex ml-1 px-1.5 py-0.5 text-xs font-mono text-gray-400 bg-gray-100 rounded group-hover:bg-gray-200 group-disabled:hidden">
                &larr;
              </kbd>
            </button>

            {currentStepIndex < totalContentSteps ? (
              <button
                onClick={onNextStep}
                className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-optio-purple rounded-lg hover:bg-optio-purple/90 transition-colors group"
              >
                Continue
                <kbd className="hidden sm:inline-flex ml-1 px-1.5 py-0.5 text-xs font-mono text-white/60 bg-white/20 rounded">
                  &rarr;
                </kbd>
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            ) : !hasTasksStep ? (
              <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-lg border border-green-200">
                <CheckCircleSolidIcon className="w-5 h-5" />
                Complete
              </div>
            ) : null}
          </div>
          {/* Keyboard hint */}
          <p className="hidden sm:block text-center text-xs text-gray-400 mt-3">
            Use arrow keys to navigate
          </p>
        </div>
      )}

      {/* Lesson Helper Modal */}
      <LessonHelperModal
        isOpen={showHelperModal}
        onClose={() => setShowHelperModal(false)}
        lessonId={lesson?.id}
        blockIndex={currentStepIndex}
        stepTitle={currentStep?.title || ''}
        totalSteps={totalContentSteps}
        currentStepIndex={currentStepIndex}
      />

      {/* Suggested Tasks Modal */}
      <SuggestedTasksModal
        isOpen={showSuggestedTasksModal}
        onClose={() => setShowSuggestedTasksModal(false)}
        questId={questId}
        lessonTitle={lesson?.title}
        tasks={linkedTasks.filter(t => t.is_required !== true)}
        onTaskActivated={() => {
          // Optionally refresh tasks after activation
          setShowSuggestedTasksModal(false)
        }}
      />
    </div>
  )
}

export default LessonSlideViewer
