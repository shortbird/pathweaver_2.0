/**
 * LessonSlideViewer Component
 *
 * Slide-based lesson content viewer.
 * Shows one step at a time with navigation.
 * Handles content, finished, and tasks steps.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid'
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
}) => {
  const [showPersonalizeWizard, setShowPersonalizeWizard] = useState(false)

  const totalContentSteps = steps.length
  // Finished step is at index totalContentSteps (right after content)
  const isOnFinishedStep = hasTasksStep && currentStepIndex === totalContentSteps
  // Tasks step is at index totalContentSteps + 1 (after finished step)
  const isOnTasksStep = hasTasksStep && currentStepIndex === totalContentSteps + 1
  const currentStep = (isOnFinishedStep || isOnTasksStep) ? null : (steps[currentStepIndex] || null)

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

  // Render Lesson Finished Step
  if (isOnFinishedStep) {
    return (
      <div className="flex flex-col min-h-[400px]">
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          {/* Celebration Icon */}
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
            <CheckCircleSolidIcon className="w-12 h-12 text-green-600" />
          </div>

          <h3 className="text-2xl font-bold text-gray-900 mb-3">
            Lesson Complete!
          </h3>

          <p className="text-gray-600 mb-6 max-w-md">
            You've finished all the content in this lesson. Now it's time to apply what you've learned by completing tasks.
          </p>

          {/* XP Info Box */}
          <div className="bg-optio-purple/5 border border-optio-purple/20 rounded-xl p-6 max-w-md w-full mb-6">
            <div className="flex items-center justify-center gap-2 mb-3">
              <TrophyIcon className="w-5 h-5 text-optio-purple" />
              <span className="font-semibold text-gray-900">Complete Tasks to Earn XP</span>
            </div>
            {lessonXpThreshold > 0 ? (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  Earn <span className="font-semibold text-optio-purple">{lessonXpThreshold} XP</span> to complete this lesson
                </p>
                <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
                  <p className="text-sm text-gray-500 mb-1">Progress</p>
                  <p className="text-2xl font-bold text-optio-purple">{lessonEarnedXP} / {lessonXpThreshold} XP</p>
                  {lessonEarnedXP >= lessonXpThreshold && (
                    <p className="text-sm text-green-600 font-medium mt-2">Lesson Complete!</p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-600">
                Complete tasks to earn XP and finish the project!
              </p>
            )}
          </div>

          {/* CTA */}
          <button
            onClick={onNextStep}
            className="flex items-center gap-2 px-6 py-3 text-white bg-optio-purple rounded-xl hover:bg-optio-purple/90 transition-colors font-medium"
          >
            <ClipboardDocumentListIcon className="w-5 h-5" />
            View Tasks
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Footer */}
        {totalStepsWithTasks > 1 && (
          <div className="mt-8 pt-6 border-t border-gray-200 flex items-center justify-between">
            <button
              onClick={onPrevStep}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              Previous
            </button>
            <div />
          </div>
        )}
      </div>
    )
  }

  // Render Tasks Step
  if (isOnTasksStep) {
    return (
      <div className="flex flex-col min-h-[400px]">
        <div className="flex-1">
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <ClipboardDocumentListIcon className="w-6 h-6 text-optio-purple" />
              Apply What You Learned
            </h3>
          </div>

          <p className="text-gray-600 mb-6">
            Select tasks that interest you, or create your own. You don't need to complete all tasks - just enough to meet the project's XP requirements. If none of these tasks appeal to you, feel free to create your own!
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {linkedTasks.map((task) => {
              const pillarData = getPillarData(task.pillar || 'wellness')
              const isTaskCompleted = task.is_completed === true
              const taskQuestId = task.quest_id || questId
              return (
                <Link
                  key={task.id}
                  to={`/quests/${taskQuestId}?task=${task.id}`}
                  onClick={() => onTaskClick?.(task)}
                  className={`
                    block p-4 rounded-xl border-2 text-left cursor-pointer w-full
                    transition-colors transition-shadow duration-150
                    hover:shadow-lg hover:border-optio-purple/50 active:scale-[0.98]
                    ${isTaskCompleted ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}
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
                      <p className="font-semibold text-gray-900 mb-1">{task.title}</p>
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

            {/* Add Task Card */}
            {questId && !showPersonalizeWizard && (
              <button
                type="button"
                onClick={() => setShowPersonalizeWizard(true)}
                className="p-4 rounded-xl border-2 border-dashed border-gray-300 text-left transition-colors transition-shadow duration-150 hover:border-optio-purple hover:bg-optio-purple/5 hover:shadow-lg group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-optio-purple/20 to-optio-pink/20 group-hover:from-optio-purple/30 group-hover:to-optio-pink/30 transition-colors">
                    <ClipboardDocumentListIcon className="w-5 h-5 text-optio-purple" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 mb-1">Add Task</p>
                    <p className="text-sm text-gray-500 line-clamp-2">
                      Create your own or get ideas from AI
                    </p>
                  </div>
                </div>
              </button>
            )}
          </div>

          {/* Add Task Wizard */}
          {showPersonalizeWizard && questId && (
            <AddTaskWizard
              lesson={lesson}
              lessonSteps={steps}
              existingTasks={linkedTasks}
              questId={questId}
              onTaskCreated={onTaskCreated}
              onClose={() => setShowPersonalizeWizard(false)}
            />
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
      </div>
    )
  }

  // Render Content Step
  return (
    <div className="flex flex-col min-h-[400px]">
      <div className="flex-1">
        {/* Step Title */}
        {currentStep && totalContentSteps > 1 && currentStep.title && (
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            {currentStep.title}
          </h3>
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
    </div>
  )
}

export default LessonSlideViewer
