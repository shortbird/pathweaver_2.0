import { useState, useEffect, useCallback, Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import {
  SparklesIcon,
  XMarkIcon,
  TrashIcon,
  ArrowPathIcon,
  CameraIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { taskStepsAPI } from '../../services/api'
import { useAIAccess } from '../../contexts/AIAccessContext'
import StepItem from './StepItem'
import logger from '../../utils/logger'

/**
 * TaskStepsModal - Modal for AI-powered step breakdown
 *
 * Features:
 * - Generate steps with AI (Quick or Detailed granularity)
 * - Steps include evidence upload guidance
 * - Check off steps as completed
 * - "I'm stuck" drill-down for nested micro-steps
 * - Progress bar showing completion
 */
const TaskStepsModal = ({ isOpen, onClose, taskId, taskTitle, isTaskCompleted }) => {
  const { canUseTaskGeneration } = useAIAccess()

  // State
  const [steps, setSteps] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [granularity, setGranularity] = useState('quick')
  const [togglingStepId, setTogglingStepId] = useState(null)
  const [drillingDownStepId, setDrillingDownStepId] = useState(null)

  // Fetch existing steps when modal opens
  useEffect(() => {
    if (isOpen && taskId) {
      fetchSteps()
    }
  }, [isOpen, taskId])

  const fetchSteps = async () => {
    setIsLoading(true)
    try {
      const response = await taskStepsAPI.getSteps(taskId)
      if (response.data?.success) {
        setSteps(response.data.steps || [])
      }
    } catch (error) {
      logger.error('Failed to fetch steps:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      const response = await taskStepsAPI.generateSteps(taskId, granularity)
      if (response.data?.success) {
        setSteps(response.data.steps || [])
        toast.success(
          granularity === 'quick'
            ? 'Quick overview generated'
            : 'Detailed guide generated'
        )
      } else {
        toast.error(response.data?.error || 'Failed to generate steps')
      }
    } catch (error) {
      logger.error('Failed to generate steps:', error)
      toast.error('Failed to generate steps. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleToggleStep = async (stepId) => {
    setTogglingStepId(stepId)
    try {
      const response = await taskStepsAPI.toggleStep(taskId, stepId)
      if (response.data?.success) {
        setSteps(prevSteps => updateStepInTree(prevSteps, stepId, response.data.is_completed))
      }
    } catch (error) {
      logger.error('Failed to toggle step:', error)
      toast.error('Failed to update step')
    } finally {
      setTogglingStepId(null)
    }
  }

  const handleDrillDown = async (stepId) => {
    setDrillingDownStepId(stepId)
    try {
      const response = await taskStepsAPI.drillDown(taskId, stepId)
      if (response.data?.success) {
        await fetchSteps()
        toast.success('Step broken down further')
      } else {
        toast.error(response.data?.error || 'Failed to break down step')
      }
    } catch (error) {
      logger.error('Failed to drill down step:', error)
      toast.error('Failed to break down step')
    } finally {
      setDrillingDownStepId(null)
    }
  }

  const handleDeleteSteps = async () => {
    try {
      await taskStepsAPI.deleteSteps(taskId)
      setSteps([])
      toast.success('Steps cleared')
    } catch (error) {
      logger.error('Failed to delete steps:', error)
      toast.error('Failed to clear steps')
    }
  }

  // Helper to update step completion in nested tree
  const updateStepInTree = (steps, stepId, isCompleted) => {
    return steps.map(step => {
      if (step.id === stepId) {
        return { ...step, is_completed: isCompleted }
      }
      if (step.sub_steps && step.sub_steps.length > 0) {
        return {
          ...step,
          sub_steps: updateStepInTree(step.sub_steps, stepId, isCompleted)
        }
      }
      return step
    })
  }

  // Count all steps (including nested)
  const countSteps = useCallback((stepList) => {
    let total = 0
    let completed = 0
    const count = (items) => {
      for (const step of items) {
        total++
        if (step.is_completed) completed++
        if (step.sub_steps && step.sub_steps.length > 0) {
          count(step.sub_steps)
        }
      }
    }
    count(stepList)
    return { total, completed }
  }, [])

  const { total, completed } = countSteps(steps)
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0
  const hasSteps = steps.length > 0

  if (!canUseTaskGeneration) {
    return null
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <SparklesIcon className="w-5 h-5 text-optio-purple" />
                    <Dialog.Title
                      as="h3"
                      className="text-lg font-semibold text-gray-900"
                      style={{ fontFamily: 'Poppins' }}
                    >
                      Break into Steps
                    </Dialog.Title>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                {/* Task title */}
                <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                  <p className="text-sm font-medium text-gray-700" style={{ fontFamily: 'Poppins' }}>
                    {taskTitle}
                  </p>
                </div>

                {/* Content */}
                <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
                  {/* Progress bar (only show when steps exist) */}
                  {hasSteps && (
                    <div className="mb-4">
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-optio-purple to-optio-pink transition-all duration-300"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-500 text-right" style={{ fontFamily: 'Poppins' }}>
                        {completed}/{total} steps complete ({progressPercent}%)
                      </p>
                    </div>
                  )}

                  {/* Generate controls (show when no steps) */}
                  {!hasSteps && !isLoading && (
                    <div className="space-y-4">
                      {/* Evidence reminder */}
                      <div className="flex items-start gap-3 p-3 bg-optio-purple/5 rounded-lg">
                        <CameraIcon className="w-5 h-5 text-optio-purple flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-gray-600" style={{ fontFamily: 'Poppins' }}>
                          Each step will include what to capture for evidence. Upload photos, notes, or screenshots as you work - we want to see your process, not just the final result.
                        </p>
                      </div>

                      {/* Granularity toggle */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setGranularity('quick')}
                          className={`
                            flex-1 px-4 py-2 text-sm rounded-lg transition-all
                            ${granularity === 'quick'
                              ? 'bg-optio-purple text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }
                          `}
                          style={{ fontFamily: 'Poppins' }}
                        >
                          Quick Overview
                          <span className="block text-xs opacity-75 mt-0.5">3-5 steps</span>
                        </button>
                        <button
                          onClick={() => setGranularity('detailed')}
                          className={`
                            flex-1 px-4 py-2 text-sm rounded-lg transition-all
                            ${granularity === 'detailed'
                              ? 'bg-optio-purple text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }
                          `}
                          style={{ fontFamily: 'Poppins' }}
                        >
                          Detailed Guide
                          <span className="block text-xs opacity-75 mt-0.5">10-15 steps</span>
                        </button>
                      </div>

                      {/* Generate button */}
                      <button
                        onClick={handleGenerate}
                        disabled={isGenerating || isTaskCompleted}
                        className={`
                          w-full py-3 px-4 rounded-lg font-medium text-sm
                          flex items-center justify-center gap-2
                          bg-gradient-to-r from-optio-purple to-optio-pink text-white
                          hover:shadow-md transition-all
                          disabled:opacity-50 disabled:cursor-not-allowed
                          touch-manipulation
                        `}
                        style={{ fontFamily: 'Poppins' }}
                      >
                        {isGenerating ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Generating steps...
                          </>
                        ) : (
                          <>
                            <SparklesIcon className="w-4 h-4" />
                            Generate Steps
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Loading state */}
                  {isLoading && (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}

                  {/* Steps list */}
                  {hasSteps && !isLoading && (
                    <div className="space-y-1">
                      {/* Evidence reminder at top of steps */}
                      <div className="flex items-start gap-2 p-2 mb-3 bg-blue-50 rounded-lg text-xs text-blue-700">
                        <CameraIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span style={{ fontFamily: 'Poppins' }}>
                          Upload evidence as you complete each step - photos, screenshots, or notes showing your work in progress.
                        </span>
                      </div>

                      {steps.map((step) => (
                        <StepItem
                          key={step.id}
                          step={step}
                          onToggle={handleToggleStep}
                          onDrillDown={handleDrillDown}
                          isToggling={togglingStepId === step.id}
                          isDrillingDown={drillingDownStepId === step.id}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer actions (only when steps exist) */}
                {hasSteps && !isLoading && (
                  <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50">
                    <button
                      onClick={handleDeleteSteps}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      style={{ fontFamily: 'Poppins' }}
                    >
                      <TrashIcon className="w-4 h-4" />
                      Clear all
                    </button>

                    <button
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-optio-purple hover:bg-optio-purple/10 rounded-lg transition-colors"
                      style={{ fontFamily: 'Poppins' }}
                    >
                      <ArrowPathIcon className="w-4 h-4" />
                      Regenerate
                    </button>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}

export default TaskStepsModal
