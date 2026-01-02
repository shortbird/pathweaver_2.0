/**
 * AddTaskWizard Component
 *
 * Inline wizard for adding tasks - either manually or with AI assistance.
 * Used within the lesson slide viewer to create new tasks.
 */

import { useState } from 'react'
import {
  CheckCircleIcon,
  XMarkIcon,
  ClipboardDocumentListIcon,
  SparklesIcon,
  TrophyIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'
import { getPillarData, PILLAR_KEYS } from '../../utils/pillarMappings'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

export const AddTaskWizard = ({
  lesson,
  lessonSteps,
  existingTasks,
  questId,
  onTaskCreated,
  onClose
}) => {
  // 'choose' | 'manual' | 'ai-customize' | 'ai-generating' | 'ai-results'
  const [wizardStep, setWizardStep] = useState('choose')
  const [aiOptions, setAiOptions] = useState({
    focusPillars: [],
    customPrompt: ''
  })
  const [manualTask, setManualTask] = useState({
    title: '',
    description: '',
    pillar: 'stem',
    xp_value: 100
  })
  const [generatedTasks, setGeneratedTasks] = useState([])
  const [acceptingTaskId, setAcceptingTaskId] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Extract text content from lesson steps for context
  const getLessonTextContent = () => {
    if (!lessonSteps || lessonSteps.length === 0) return ''
    return lessonSteps
      .map(s => `${s.title || ''}\n${s.content || ''}`)
      .join('\n\n')
  }

  const togglePillar = (pillar) => {
    setAiOptions(prev => ({
      ...prev,
      focusPillars: prev.focusPillars.includes(pillar)
        ? prev.focusPillars.filter(p => p !== pillar)
        : [...prev.focusPillars, pillar]
    }))
  }

  // Manual task creation
  const handleCreateManualTask = async () => {
    if (!manualTask.title.trim()) {
      toast.error('Please enter a task title')
      return
    }

    try {
      setIsSubmitting(true)

      const response = await api.post(`/api/quests/${questId}/curriculum/lessons/${lesson.id}/create-tasks`, {
        tasks: [{
          title: manualTask.title,
          description: manualTask.description,
          pillar: manualTask.pillar,
          xp_value: manualTask.xp_value,
          evidence_prompt: 'Show your work through writing, video, or another format of your choice.'
        }],
        link_to_lesson: true
      })

      if (response.data.success && response.data.tasks?.length > 0) {
        toast.success('Task created')
        onTaskCreated?.(response.data.tasks[0])
        onClose()
      }
    } catch (error) {
      console.error('Failed to create task:', error)
      toast.error('Failed to create task')
    } finally {
      setIsSubmitting(false)
    }
  }

  // AI task generation
  const handleGenerate = async () => {
    const lessonContent = getLessonTextContent()
    if (!lessonContent.trim() && !aiOptions.customPrompt.trim()) {
      toast.error('No lesson content available')
      return
    }

    try {
      setWizardStep('ai-generating')

      const existingTaskContext = existingTasks.length > 0
        ? `Existing tasks for this lesson: ${existingTasks.map(t => t.title).join(', ')}`
        : ''

      const focusPillarStr = aiOptions.focusPillars.length > 0
        ? aiOptions.focusPillars.join(', ')
        : undefined

      const response = await api.post(`/api/quests/${questId}/curriculum/lessons/${lesson.id}/generate-tasks`, {
        lesson_content: lessonContent,
        lesson_title: lesson.title,
        num_tasks: 3,
        focus_pillar: focusPillarStr,
        custom_prompt: aiOptions.customPrompt || undefined,
        existing_tasks_context: existingTaskContext || undefined
      })

      if (response.data.success && response.data.tasks) {
        const tasksWithIds = response.data.tasks.map((task, idx) => ({
          ...task,
          id: `personalized_${Date.now()}_${idx}`,
          xp_value: task.xp_value || 100
        }))
        setGeneratedTasks(tasksWithIds)
        setWizardStep('ai-results')
      } else {
        toast.error('Failed to generate tasks')
        setWizardStep('ai-customize')
      }
    } catch (error) {
      console.error('Failed to generate tasks:', error)
      toast.error(error.response?.data?.error || 'Failed to generate tasks')
      setWizardStep('ai-customize')
    }
  }

  const handleAcceptTask = async (task) => {
    try {
      setAcceptingTaskId(task.id)

      const response = await api.post(`/api/quests/${questId}/curriculum/lessons/${lesson.id}/create-tasks`, {
        tasks: [{
          title: task.title,
          description: task.description,
          pillar: task.pillar,
          xp_value: task.xp_value,
          evidence_prompt: task.evidence_prompt
        }],
        link_to_lesson: true
      })

      if (response.data.success && response.data.tasks?.length > 0) {
        setGeneratedTasks(prev => prev.filter(t => t.id !== task.id))
        toast.success('Task added')
        onTaskCreated?.(response.data.tasks[0])
      }
    } catch (error) {
      console.error('Failed to accept task:', error)
      toast.error('Failed to add task')
    } finally {
      setAcceptingTaskId(null)
    }
  }

  const handleRejectTask = (taskId) => {
    setGeneratedTasks(prev => prev.filter(t => t.id !== taskId))
  }

  // Get header title based on step
  const getHeaderTitle = () => {
    if (wizardStep === 'manual') return 'Create Your Own Task'
    if (wizardStep.startsWith('ai-')) return 'AI Task Ideas'
    return 'Add Task'
  }

  return (
    <div className="mt-6 border-2 border-optio-purple/20 rounded-xl bg-gradient-to-br from-optio-purple/5 to-optio-pink/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/50 border-b border-optio-purple/10">
        <div className="flex items-center gap-2">
          {wizardStep === 'manual' ? (
            <PencilIcon className="w-5 h-5 text-optio-purple" />
          ) : wizardStep.startsWith('ai-') ? (
            <SparklesIcon className="w-5 h-5 text-optio-purple" />
          ) : (
            <ClipboardDocumentListIcon className="w-5 h-5 text-optio-purple" />
          )}
          <h4 className="font-semibold text-gray-900">{getHeaderTitle()}</h4>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4">
        {/* Choose Step */}
        {wizardStep === 'choose' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              How would you like to add a task?
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => setWizardStep('manual')}
                className="p-4 rounded-lg border-2 border-gray-200 hover:border-optio-purple hover:bg-optio-purple/5 transition-all text-left group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-optio-purple/20 flex items-center justify-center transition-colors">
                    <PencilIcon className="w-5 h-5 text-gray-600 group-hover:text-optio-purple" />
                  </div>
                  <span className="font-semibold text-gray-900">Create My Own</span>
                </div>
                <p className="text-sm text-gray-500">Write a custom task from scratch</p>
              </button>
              <button
                onClick={() => setWizardStep('ai-customize')}
                className="p-4 rounded-lg border-2 border-gray-200 hover:border-optio-purple hover:bg-optio-purple/5 transition-all text-left group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-optio-purple/20 to-optio-pink/20 group-hover:from-optio-purple/30 group-hover:to-optio-pink/30 flex items-center justify-center transition-colors">
                    <SparklesIcon className="w-5 h-5 text-optio-purple" />
                  </div>
                  <span className="font-semibold text-gray-900">Use AI</span>
                </div>
                <p className="text-sm text-gray-500">Generate ideas based on lesson content</p>
              </button>
            </div>
          </div>
        )}

        {/* Manual Task Creation */}
        {wizardStep === 'manual' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Task Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={manualTask.title}
                onChange={(e) => setManualTask(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Research local community resources"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={manualTask.description}
                onChange={(e) => setManualTask(prev => ({ ...prev, description: e.target.value }))}
                placeholder="What will you do for this task?"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
                rows={2}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Pillar
                </label>
                <select
                  value={manualTask.pillar}
                  onChange={(e) => setManualTask(prev => ({ ...prev, pillar: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                >
                  {PILLAR_KEYS.map(key => (
                    <option key={key} value={key}>{getPillarData(key).name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  XP Value
                </label>
                <select
                  value={manualTask.xp_value}
                  onChange={(e) => setManualTask(prev => ({ ...prev, xp_value: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                >
                  <option value={50}>50 XP</option>
                  <option value={75}>75 XP</option>
                  <option value={100}>100 XP</option>
                  <option value={150}>150 XP</option>
                  <option value={200}>200 XP</option>
                </select>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => setWizardStep('choose')}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                Back
              </button>
              <button
                onClick={handleCreateManualTask}
                disabled={isSubmitting || !manualTask.title.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircleIcon className="w-4 h-4" />
                )}
                Create Task
              </button>
            </div>
          </div>
        )}

        {/* AI Customize Step */}
        {wizardStep === 'ai-customize' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Generate personalized task ideas based on this lesson.
            </p>

            {/* Focus Areas - Multi-select pills */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Focus Areas (optional)
              </label>
              <div className="flex flex-wrap gap-2">
                {PILLAR_KEYS.map(key => {
                  const pillarData = getPillarData(key)
                  const isSelected = aiOptions.focusPillars.includes(key)
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => togglePillar(key)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                        isSelected
                          ? 'text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      style={isSelected ? { backgroundColor: pillarData.color } : {}}
                    >
                      {pillarData.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Custom Prompt */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Custom Request (optional)
              </label>
              <textarea
                value={aiOptions.customPrompt}
                onChange={(e) => setAiOptions(prev => ({ ...prev, customPrompt: e.target.value }))}
                placeholder="e.g., Focus on hands-on activities, Include journaling..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
                rows={2}
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => setWizardStep('choose')}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                Back
              </button>
              <button
                onClick={handleGenerate}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity"
              >
                <SparklesIcon className="w-4 h-4" />
                Generate Ideas
              </button>
            </div>
          </div>
        )}

        {/* AI Generating Step */}
        {wizardStep === 'ai-generating' && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-10 h-10 border-3 border-optio-purple border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-gray-600">Generating personalized task ideas...</p>
          </div>
        )}

        {/* AI Results Step */}
        {wizardStep === 'ai-results' && (
          <div className="space-y-4">
            {generatedTasks.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-gray-600 mb-3">All tasks have been added or dismissed.</p>
                <button
                  onClick={() => setWizardStep('ai-customize')}
                  className="text-sm text-optio-purple hover:underline"
                >
                  Generate more ideas
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  {generatedTasks.length} idea{generatedTasks.length !== 1 ? 's' : ''} generated. Accept the ones you like!
                </p>

                <div className="space-y-3">
                  {generatedTasks.map((task) => {
                    const pillarData = getPillarData(task.pillar)
                    const isAccepting = acceptingTaskId === task.id

                    return (
                      <div
                        key={task.id}
                        className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <h5 className="font-medium text-gray-900 text-sm">{task.title}</h5>
                          <p className="text-xs text-gray-600 mt-1 line-clamp-2">{task.description}</p>
                          <div className="flex items-center gap-2 mt-2">
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
                            onClick={() => handleAcceptTask(task)}
                            disabled={isAccepting}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                            title="Add this task"
                          >
                            {isAccepting ? (
                              <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <CheckCircleIcon className="w-5 h-5" />
                            )}
                          </button>
                          <button
                            onClick={() => handleRejectTask(task.id)}
                            disabled={isAccepting}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                            title="Dismiss"
                          >
                            <XMarkIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    onClick={() => setWizardStep('ai-customize')}
                    className="text-sm text-optio-purple hover:underline"
                  >
                    Generate more
                  </button>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default AddTaskWizard
