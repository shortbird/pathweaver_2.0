import { useState, useEffect, useMemo } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Bars3Icon,
  CheckCircleIcon,
  ClockIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  XMarkIcon,
  ClipboardDocumentListIcon,
  SparklesIcon,
  LockClosedIcon,
  LockOpenIcon,
  PlayIcon,
  DocumentTextIcon,
  LinkIcon,
  ArrowDownTrayIcon,
  PaperClipIcon,
  ArrowTopRightOnSquareIcon,
  ArrowPathIcon,
  TrophyIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import { getPillarData, PILLAR_KEYS } from '../../utils/pillarMappings';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

/**
 * Parse lesson content into steps
 * Handles both legacy (blocks/HTML) and new (steps array) formats
 */
const parseContentToSteps = (content) => {
  if (!content) return []

  // New format: version 2 with steps array
  if (content.version === 2 && Array.isArray(content.steps)) {
    return content.steps
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(step => ({
        ...step,
        type: step.type || 'text',
      }))
  }

  // Legacy: blocks format
  if (content.blocks && Array.isArray(content.blocks)) {
    const html = content.blocks
      .filter(block => block.type === 'text')
      .map(block => block.content || '')
      .join('')
    if (html) {
      return [{ id: 'legacy', type: 'text', title: 'Content', content: html, order: 0 }]
    }
  }

  // Legacy: raw HTML string
  if (typeof content === 'string' && content.trim()) {
    return [{ id: 'legacy', type: 'text', title: 'Content', content, order: 0 }]
  }

  return []
}

/**
 * Get file type from filename or URL
 */
const getFileType = (file) => {
  const name = (file.name || file.url || '').toLowerCase()
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name)) return 'image'
  if (/\.pdf$/i.test(name)) return 'pdf'
  if (/\.(mp4|webm|ogg|mov)$/i.test(name)) return 'video'
  if (/\.(mp3|wav|ogg|m4a)$/i.test(name)) return 'audio'
  return 'other'
}

/**
 * Get video embed URL from various providers
 */
const getVideoEmbedUrl = (url) => {
  if (!url) return null

  // YouTube
  const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
  const youtubeMatch = url.match(youtubeRegex)
  if (youtubeMatch) {
    return `https://www.youtube-nocookie.com/embed/${youtubeMatch[1]}?rel=0&modestbranding=1`
  }

  // Vimeo
  const vimeoRegex = /vimeo\.com\/(?:video\/)?(\d+)/
  const vimeoMatch = url.match(vimeoRegex)
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`
  }

  // Google Drive
  const driveRegex = /drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/
  const driveMatch = url.match(driveRegex)
  if (driveMatch) {
    return `https://drive.google.com/file/d/${driveMatch[1]}/preview`
  }

  // Loom
  const loomRegex = /loom\.com\/share\/([a-zA-Z0-9]+)/
  const loomMatch = url.match(loomRegex)
  if (loomMatch) {
    return `https://www.loom.com/embed/${loomMatch[1]}`
  }

  return null
}

/**
 * Inline wizard for adding tasks - either manually or with AI assistance
 */
const AddTaskWizard = ({
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

/**
 * Slide-based lesson content viewer
 * Shows one step at a time with navigation
 * Step state is managed externally for flexibility
 */
const LessonSlideViewer = ({
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
  nextLessonXpThreshold = 0,
  nextLessonTitle = null,
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
              <span className="font-semibold text-gray-900">Earn XP to Progress</span>
            </div>
            {nextLessonXpThreshold > 0 && nextLessonTitle ? (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  Earn <span className="font-semibold text-optio-purple">{nextLessonXpThreshold} XP</span> to unlock the next lesson: <span className="font-medium">{nextLessonTitle}</span>
                </p>
                <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
                  <p className="text-sm text-gray-500 mb-1">XP needed</p>
                  <p className="text-2xl font-bold text-optio-purple">{nextLessonXpThreshold} XP</p>
                </div>
              </>
            ) : nextLessonTitle ? (
              <p className="text-sm text-gray-600">
                Complete tasks to continue to the next lesson: <span className="font-medium">{nextLessonTitle}</span>
              </p>
            ) : (
              <p className="text-sm text-gray-600">
                Complete tasks to finish the project and earn XP!
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
            Select tasks that interest you. Complete them to earn XP and reinforce your learning.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {linkedTasks.map((task) => {
              const pillarData = getPillarData(task.pillar || 'wellness')
              const isTaskCompleted = task.approval_status === 'approved' || task.is_completed
              return (
                <button
                  key={task.id}
                  onClick={() => onTaskClick?.(task)}
                  className={`
                    p-4 rounded-xl border-2 text-left transition-all
                    hover:shadow-lg hover:scale-[1.02] active:scale-[0.99]
                    ${isTaskCompleted ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:border-optio-purple/50'}
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
                </button>
              )
            })}

            {/* Add Task Card */}
            {questId && !showPersonalizeWizard && (
              <button
                onClick={() => setShowPersonalizeWizard(true)}
                className="p-4 rounded-xl border-2 border-dashed border-gray-300 text-left transition-all hover:border-optio-purple hover:bg-optio-purple/5 hover:shadow-lg hover:scale-[1.02] active:scale-[0.99] group"
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
            <div
              className="prose prose-lg max-w-none prose-headings:font-bold prose-headings:text-gray-900 prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-gray-200 prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3 prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-6 prose-li:text-gray-700 prose-li:my-1 prose-strong:text-gray-900 prose-blockquote:border-l-4 prose-blockquote:border-optio-purple prose-blockquote:bg-optio-purple/5 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-a:text-optio-purple prose-a:no-underline hover:prose-a:underline [&>p+p]:mt-6"
              dangerouslySetInnerHTML={{ __html: currentStep.content }}
            />
          )}

          {/* VIDEO STEP */}
          {currentStep.type === 'video' && (
            <div className="space-y-6">
              {/* Optional description */}
              {currentStep.content && currentStep.content !== '<p></p>' && (
                <div
                  className="prose prose-lg max-w-none prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-6 [&>p+p]:mt-6"
                  dangerouslySetInnerHTML={{ __html: currentStep.content }}
                />
              )}

              {/* Video player */}
              {videoEmbedUrl ? (
                <div className="aspect-video rounded-xl overflow-hidden bg-gray-100 shadow-lg">
                  <iframe
                    src={videoEmbedUrl}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title={currentStep.title || lesson.title}
                  />
                </div>
              ) : (
                <div className="aspect-video rounded-xl bg-gray-100 flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <PlayIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                    <p>No video URL provided</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FILE STEP */}
          {currentStep.type === 'file' && (
            <div className="space-y-6">
              {/* Optional description */}
              {currentStep.content && currentStep.content !== '<p></p>' && (
                <div
                  className="prose prose-lg max-w-none prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-6 [&>p+p]:mt-6"
                  dangerouslySetInnerHTML={{ __html: currentStep.content }}
                />
              )}

              {/* Files displayed inline */}
              {currentStep.files && currentStep.files.length > 0 ? (
                <div className="space-y-6">
                  {currentStep.files.map((file, idx) => {
                    const fileType = getFileType(file)

                    return (
                      <div key={idx} className="space-y-2">
                        {/* IMAGE - display inline */}
                        {fileType === 'image' && (
                          <div className="rounded-xl overflow-hidden bg-gray-100 shadow-lg">
                            <img
                              src={file.url}
                              alt={file.name || 'Image'}
                              className="w-full h-auto max-h-[600px] object-contain"
                            />
                          </div>
                        )}

                        {/* PDF - embed viewer */}
                        {fileType === 'pdf' && (
                          <div className="rounded-xl overflow-hidden bg-gray-100 shadow-lg" style={{ height: '600px' }}>
                            <iframe
                              src={`${file.url}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
                              className="w-full h-full"
                              title={file.name || 'PDF Document'}
                            />
                          </div>
                        )}

                        {/* VIDEO - native player */}
                        {fileType === 'video' && (
                          <div className="rounded-xl overflow-hidden bg-gray-100 shadow-lg">
                            <video
                              src={file.url}
                              controls
                              className="w-full max-h-[500px]"
                            >
                              Your browser does not support the video tag.
                            </video>
                          </div>
                        )}

                        {/* AUDIO - native player */}
                        {fileType === 'audio' && (
                          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <p className="text-sm font-medium text-gray-900 mb-3">{file.name}</p>
                            <audio src={file.url} controls className="w-full">
                              Your browser does not support the audio tag.
                            </audio>
                          </div>
                        )}

                        {/* OTHER - download link */}
                        {fileType === 'other' && (
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors border border-gray-200"
                          >
                            <div className="w-12 h-12 flex items-center justify-center bg-optio-purple/10 rounded-lg flex-shrink-0">
                              <PaperClipIcon className="w-6 h-6 text-optio-purple" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                              {file.size && (
                                <p className="text-xs text-gray-500">
                                  {(file.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              )}
                            </div>
                            <ArrowDownTrayIcon className="w-5 h-5 text-optio-purple flex-shrink-0" />
                          </a>
                        )}

                        {/* File name caption for media files */}
                        {(fileType === 'image' || fileType === 'pdf' || fileType === 'video') && file.name && (
                          <p className="text-sm text-gray-500 text-center">{file.name}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <PaperClipIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p>No files attached</p>
                </div>
              )}
            </div>
          )}

          {/* LINKS - shown for any step type */}
          {currentStep.links && currentStep.links.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Resources</h4>
              <div className="flex flex-wrap gap-2">
                {currentStep.links.map((link, idx) => (
                  <a
                    key={idx}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-optio-purple/10 rounded-lg hover:bg-optio-purple/20 transition-colors text-sm"
                  >
                    <LinkIcon className="w-4 h-4 text-optio-purple" />
                    <span className="text-optio-purple font-medium">{link.displayText || link.text || link.url}</span>
                    <ArrowTopRightOnSquareIcon className="w-3 h-3 text-optio-purple/60" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* ATTACHMENTS - shown for any step type */}
          {currentStep.attachments && currentStep.attachments.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Attachments</h4>
              <div className="flex flex-wrap gap-2">
                {currentStep.attachments.map((file, idx) => (
                  <a
                    key={idx}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-700">{file.displayName || file.name}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      </div>

      {/* Navigation Footer */}
      {totalStepsWithTasks > 1 && (
        <div className="mt-8 pt-6 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={onPrevStep}
            disabled={currentStepIndex === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeftIcon className="w-4 h-4" />
            Previous
          </button>

          {currentStepIndex < totalContentSteps ? (
            <button
              onClick={onNextStep}
              className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-optio-purple rounded-lg hover:bg-optio-purple/90 transition-colors"
            >
              Continue
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          ) : !hasTasksStep ? (
            <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-lg border border-green-200">
              <CheckCircleSolidIcon className="w-5 h-5" />
              Complete
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

const LessonItem = ({ lesson, index, isSelected, isAdmin, isLocked, isUnlocked, xpProgress, onClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: lesson.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isCompleted = lesson.is_completed || false;
  const pillarData = getPillarData(lesson.pillar || 'art');

  return (
    <div
      ref={setNodeRef}
      onClick={isLocked ? undefined : onClick}
      className={`
        relative rounded-lg p-3 mb-2 transition-all duration-200
        ${isLocked
          ? 'cursor-not-allowed opacity-60'
          : 'cursor-pointer hover:border-gray-300 hover:shadow-lg hover:scale-[1.02]'
        }
        ${isSelected
          ? 'border-2 shadow-md scale-[1.02]'
          : 'border border-gray-200'
        }
      `}
      style={{
        ...style,
        borderColor: isSelected ? pillarData.color : undefined,
        backgroundColor: isLocked ? '#f3f4f6' : (isSelected ? `${pillarData.color}15` : (isCompleted ? '#f0fdf4' : 'white'))
      }}
    >
      {/* Drag Handle (Admin Only) */}
      {isAdmin && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <Bars3Icon className="w-4 h-4 text-gray-400" />
        </div>
      )}

      <div className={`flex items-center gap-2.5 ${isAdmin ? 'pl-6' : ''}`}>
        {/* Lesson Number Badge */}
        <div className="relative flex-shrink-0">
          <div
            className={`w-8 h-8 rounded-md flex items-center justify-center font-semibold text-sm ${isLocked ? 'bg-gray-400' : ''}`}
            style={!isLocked ? {
              backgroundImage: `linear-gradient(135deg, ${pillarData.color}ee, ${pillarData.color}88)`,
              color: 'white'
            } : { color: 'white' }}
          >
            {isLocked ? <LockClosedIcon className="w-4 h-4" /> : index + 1}
          </div>
          {/* Completion Overlay */}
          {isCompleted && !isLocked && (
            <div className="absolute inset-0 bg-green-600/30 rounded-md flex items-center justify-center">
              <CheckCircleIcon className="w-5 h-5 text-green-600" strokeWidth={2.5} />
            </div>
          )}
        </div>

        {/* Lesson Info */}
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold truncate mb-1 ${isLocked ? 'text-gray-500' : 'text-gray-900'}`}>
            {lesson.title || `Lesson ${index + 1}`}
          </div>
          {isLocked && xpProgress ? (
            <div className="flex items-center gap-1 text-xs text-amber-600">
              <span>Complete Lesson {xpProgress.blockingLessonIndex}: {xpProgress.earned}/{xpProgress.required} XP</span>
            </div>
          ) : isLocked ? (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <span>Complete previous lessons first</span>
            </div>
          ) : isUnlocked ? (
            <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <LockOpenIcon className="w-3 h-3" />
              <span>Unlocked</span>
            </div>
          ) : lesson.duration_minutes ? (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <ClockIcon className="w-3 h-3" />
              <span>{lesson.duration_minutes} min</span>
            </div>
          ) : null}
        </div>

        {isLocked ? (
          <LockClosedIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </div>
    </div>
  );
};

const CurriculumView = ({
  lessons: propLessons,
  selectedLessonId: propSelectedLessonId,
  onLessonSelect,
  onLessonsReorder,
  onTaskClick, // Callback when a linked task is clicked
  orderingMode = 'sequential', // 'sequential' or 'free'
  isAdmin = false,
  className = '',
  questId, // Optional: if provided, will fetch lessons automatically
  embedded = false, // When true, hides sidebar (used within CourseHomepage)
  initialLessonId // Optional: auto-select this lesson on mount
}) => {
  // Start collapsed on mobile, open on desktop
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [fetchedLessons, setFetchedLessons] = useState([]);
  const [questTasks, setQuestTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [internalSelectedId, setInternalSelectedId] = useState(null);

  // Step navigation state
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());

  // Lesson progress state (persisted)
  const [lessonProgress, setLessonProgress] = useState({});
  const [progressLoaded, setProgressLoaded] = useState(false);

  // Track which lesson we've initialized step state for (prevents re-init on save)
  const [initializedLessonId, setInitializedLessonId] = useState(null);

  // Use prop lessons if provided, otherwise use fetched lessons
  const lessons = propLessons || fetchedLessons;
  const selectedLessonId = propSelectedLessonId ?? internalSelectedId;

  // Fetch lessons, tasks, and progress when questId is provided (in parallel for speed)
  useEffect(() => {
    if (questId) {
      const fetchData = async () => {
        try {
          setLoading(true);

          // Build array of promises to run in parallel
          const promises = [];

          // Lessons fetch (if not provided via props)
          const lessonsPromise = !propLessons
            ? api.get(`/api/quests/${questId}/curriculum/lessons`).catch(err => {
                console.warn('Could not fetch lessons:', err);
                return { data: { lessons: [] } };
              })
            : Promise.resolve(null);
          promises.push(lessonsPromise);

          // Tasks fetch
          const tasksPromise = api.get(`/api/quests/${questId}/tasks`).catch(err => {
            console.warn('Could not fetch quest tasks:', err);
            return { data: { tasks: [] } };
          });
          promises.push(tasksPromise);

          // Progress fetch
          const progressPromise = api.get(`/api/quests/${questId}/curriculum/progress`).catch(err => {
            console.warn('Could not fetch lesson progress:', err);
            return { data: { progress: [] } };
          });
          promises.push(progressPromise);

          // Run all fetches in parallel
          const [lessonsResult, tasksResult, progressResult] = await Promise.all(promises);

          // Process lessons
          if (lessonsResult) {
            const lessonsData = lessonsResult.data.lessons || [];
            setFetchedLessons(lessonsData);
            if (lessonsData.length > 0 && !internalSelectedId) {
              setInternalSelectedId(lessonsData[0].id);
            }
          }

          // Process tasks
          setQuestTasks(tasksResult.data.tasks || []);

          // Process progress
          const progressData = progressResult.data.progress || [];
          const progressMap = {};
          progressData.forEach(p => {
            progressMap[p.lesson_id] = p;
          });
          setLessonProgress(progressMap);

          setProgressLoaded(true);
        } catch (error) {
          console.error('Failed to fetch curriculum data:', error);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }
  }, [questId, propLessons]);

  // Handle initialLessonId prop
  useEffect(() => {
    if (initialLessonId && !propSelectedLessonId) {
      setInternalSelectedId(initialLessonId);
    }
  }, [initialLessonId, propSelectedLessonId]);

  // Handle internal lesson selection
  const handleLessonSelect = (lesson) => {
    if (onLessonSelect) {
      onLessonSelect(lesson);
    } else {
      setInternalSelectedId(lesson.id);
    }
    // Close sidebar on mobile after selection
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (!over || !isAdmin) return;

    if (active.id !== over.id) {
      const oldIndex = lessons.findIndex(l => l.id === active.id);
      const newIndex = lessons.findIndex(l => l.id === over.id);

      // Create new order
      const reordered = [...lessons];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);

      if (onLessonsReorder) {
        onLessonsReorder(reordered);
      }
    }
  };

  const selectedLesson = lessons.find(l => l.id === selectedLessonId);

  // Parse steps for the selected lesson
  const lessonSteps = useMemo(() => parseContentToSteps(selectedLesson?.content), [selectedLesson?.content]);
  const totalSteps = lessonSteps.length;

  // Get linked tasks for a lesson (needed for totalSteps calculation)
  const getLinkedTasksForLesson = (lesson) => {
    if (!lesson?.linked_task_ids || lesson.linked_task_ids.length === 0) {
      return [];
    }
    return questTasks.filter(task => lesson.linked_task_ids.includes(task.id));
  };

  // Calculate total steps including virtual "finished" and "tasks" steps if there are linked tasks
  const linkedTasksForLesson = selectedLesson ? getLinkedTasksForLesson(selectedLesson) : [];
  const hasTasksStep = linkedTasksForLesson.length > 0;
  // When there are tasks: content steps + finished step + tasks step = totalSteps + 2
  const totalStepsWithTasks = hasTasksStep ? totalSteps + 2 : totalSteps;

  // Find the next lesson's XP threshold
  const currentLessonIndex = lessons.findIndex(l => l.id === selectedLessonId);
  const nextLesson = currentLessonIndex >= 0 && currentLessonIndex < lessons.length - 1
    ? lessons[currentLessonIndex + 1]
    : null;
  const nextLessonXpThreshold = nextLesson?.xp_threshold || 0;

  // Save progress to API
  const saveProgress = async (lessonId, completedStepsArray, currentStep) => {
    if (!questId) {
      console.log('[Progress] Skipping save - no questId', { questId });
      return;
    }

    try {
      const allContentStepsComplete = totalSteps > 0 && completedStepsArray.length >= totalSteps;
      console.log('[Progress] Saving:', { lessonId, completedStepsArray, currentStep, allContentStepsComplete });

      const response = await api.post(`/api/quests/${questId}/curriculum/progress/${lessonId}`, {
        status: allContentStepsComplete ? 'completed' : 'in_progress',
        progress_percentage: totalSteps > 0 ? Math.round((completedStepsArray.length / totalSteps) * 100) : 0,
        last_position: {
          completed_steps: completedStepsArray,
          current_step: currentStep
        }
      });

      console.log('[Progress] Saved successfully:', response.data);

      // Update local progress state
      setLessonProgress(prev => ({
        ...prev,
        [lessonId]: {
          ...prev[lessonId],
          status: allContentStepsComplete ? 'completed' : 'in_progress',
          last_position: {
            completed_steps: completedStepsArray,
            current_step: currentStep
          }
        }
      }));
    } catch (err) {
      console.error('[Progress] Failed to save:', err);
    }
  };

  // Load saved progress when a NEW lesson is selected (not on every progress update)
  useEffect(() => {
    if (!selectedLessonId || !progressLoaded) return;

    // Only initialize if this is a different lesson than what we've already initialized
    if (initializedLessonId === selectedLessonId) {
      return;
    }

    const savedProgress = lessonProgress[selectedLessonId];
    const savedPosition = savedProgress?.last_position;
    const contentSteps = lessonSteps.length;

    console.log('[Progress] Initializing for lesson:', {
      selectedLessonId,
      savedProgress,
      savedPosition,
      contentSteps
    });

    // Mark this lesson as initialized
    setInitializedLessonId(selectedLessonId);

    if (savedPosition && savedPosition.completed_steps) {
      const savedCompletedSteps = new Set(savedPosition.completed_steps);
      setCompletedSteps(savedCompletedSteps);

      // Check if all content steps are complete
      const allContentComplete = contentSteps > 0 && savedCompletedSteps.size >= contentSteps;

      console.log('[Progress] Restored completed steps:', {
        completedSteps: savedPosition.completed_steps,
        allContentComplete,
        hasTasksStep
      });

      if (allContentComplete) {
        // Lesson is complete - go to tasks step if available, otherwise step 0
        setCurrentStepIndex(hasTasksStep ? contentSteps : 0);
      } else {
        // Find next incomplete step
        let nextIncomplete = 0;
        for (let i = 0; i < contentSteps; i++) {
          if (!savedCompletedSteps.has(i)) {
            nextIncomplete = i;
            break;
          }
        }
        setCurrentStepIndex(nextIncomplete);
      }
    } else {
      // No saved progress - start at step 0
      console.log('[Progress] No saved progress, starting at step 0');
      setCurrentStepIndex(0);
      setCompletedSteps(new Set());
    }
  }, [selectedLessonId, progressLoaded, lessonProgress, lessonSteps.length, hasTasksStep, initializedLessonId]);

  // Step navigation handlers
  const goToNextStep = () => {
    if (currentStepIndex < totalStepsWithTasks - 1) {
      const newCompleted = new Set([...completedSteps, currentStepIndex]);
      setCompletedSteps(newCompleted);
      setCurrentStepIndex(currentStepIndex + 1);

      // Save progress (only track content steps, not tasks step)
      if (selectedLessonId && currentStepIndex < totalSteps) {
        saveProgress(selectedLessonId, Array.from(newCompleted).filter(s => s < totalSteps), currentStepIndex + 1);
      }
    }
  };

  const goToPrevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const goToStep = (index) => {
    setCurrentStepIndex(index);
  };

  // Reset progress for current lesson (admin only)
  const resetLessonProgress = async () => {
    if (!selectedLessonId || !questId) return;

    try {
      // Call backend to delete progress
      await api.delete(`/api/quests/${questId}/curriculum/progress/${selectedLessonId}`);

      // Reset local state
      setCompletedSteps(new Set());
      setCurrentStepIndex(0);

      // Remove from lessonProgress map
      setLessonProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[selectedLessonId];
        return newProgress;
      });

      // Reset initialized flag so we don't restore old progress
      setInitializedLessonId(null);

      console.log('[Progress] Reset successfully for lesson:', selectedLessonId);
    } catch (err) {
      console.error('[Progress] Failed to reset:', err);
    }
  };

  // Get linked tasks for the selected lesson
  const getLinkedTasks = (lesson) => {
    if (!lesson?.linked_task_ids || lesson.linked_task_ids.length === 0) {
      return [];
    }
    return questTasks.filter(task => lesson.linked_task_ids.includes(task.id));
  };

  // Calculate earned XP for a lesson from completed linked tasks
  const getLessonEarnedXP = (lesson) => {
    const tasks = getLinkedTasks(lesson);
    return tasks.reduce((total, task) => {
      const isCompleted = task.approval_status === 'approved' || task.is_completed;
      return total + (isCompleted ? (task.xp_value || 0) : 0);
    }, 0);
  };

  // Check if a lesson is accessible based on previous lesson XP thresholds
  const isLessonAccessible = (lessonIndex) => {
    if (isAdmin) return true; // Admins can access all lessons
    if (lessonIndex === 0) return true; // First lesson is always accessible

    // Check the PREVIOUS lesson's XP threshold requirement
    // Each lesson's xp_threshold determines the XP needed to unlock the NEXT lesson
    const prevLesson = lessons[lessonIndex - 1];
    if (prevLesson?.xp_threshold && prevLesson.xp_threshold > 0) {
      const earnedXP = getLessonEarnedXP(prevLesson);
      if (earnedXP < prevLesson.xp_threshold) {
        return false;
      }
    }

    // Also check all prior lessons are unlocked (cascading requirement)
    if (lessonIndex > 1) {
      return isLessonAccessible(lessonIndex - 1);
    }

    return true;
  };

  const linkedTasks = selectedLesson ? getLinkedTasks(selectedLesson) : [];
  const selectedLessonEarnedXP = selectedLesson ? getLessonEarnedXP(selectedLesson) : 0;
  const selectedLessonXPThreshold = selectedLesson?.xp_threshold || 0;

  // Calculate progress
  const completedCount = lessons.filter(l => l.is_completed).length;
  const progressPercent = lessons.length > 0 ? (completedCount / lessons.length) * 100 : 0;

  return (
    <div className={`flex h-full relative ${className}`}>
      {/* Mobile overlay when sidebar is open - hidden in embedded mode */}
      {!embedded && isSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/30 z-10"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Lesson List - hidden in embedded mode */}
      {!embedded && (
      <div
        className={`
          ${isSidebarOpen ? 'w-80 min-w-[280px] max-w-[320px]' : 'w-0'}
          transition-all duration-300 overflow-hidden
          border-r border-gray-200 bg-gray-50 flex flex-col
          ${isSidebarOpen ? 'absolute md:relative z-20 h-full md:h-auto' : ''}
        `}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-gray-900">Lessons</h3>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <XMarkIcon className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Progress Bar with Lesson Dots */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-600">
              <span>Progress</span>
              <span>{completedCount} / {lessons.length}</span>
            </div>
            <div className="relative w-full h-4 bg-gray-200 rounded-full">
              {/* Progress Fill */}
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-optio-purple to-optio-pink transition-all duration-500 ease-out rounded-full"
                style={{
                  width: `${progressPercent}%`
                }}
              />
              {/* Progress Dots - N+1 dots: start position + one per lesson */}
              {/* Start dot at 0% */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 transition-all duration-300 z-10 bg-white border-optio-purple"
                style={{ left: '0%', transform: 'translate(-50%, -50%)' }}
                title="Start"
              />
              {/* Lesson dots positioned from 1/N to N/N (100%) */}
              {lessons.map((lesson, index) => {
                const position = ((index + 1) / lessons.length) * 100
                const isCompleted = lesson.is_completed || false
                const isFilled = progressPercent >= position
                return (
                  <div
                    key={lesson.id}
                    className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 transition-all duration-300 cursor-pointer hover:scale-125 z-10 ${
                      isCompleted
                        ? 'bg-white border-optio-purple shadow-sm'
                        : isFilled
                        ? 'bg-white border-optio-purple/50'
                        : 'bg-white border-gray-400'
                    }`}
                    style={{ left: `${position}%`, transform: 'translate(-50%, -50%)' }}
                    title={`${lesson.title || `Lesson ${index + 1}`}${isCompleted ? ' (Completed)' : ''}`}
                    onClick={() => handleLessonSelect(lesson)}
                  />
                )
              })}
            </div>
          </div>
        </div>

        {/* Lesson List */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
            </div>
          ) : lessons.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No lessons yet
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={lessons.map(l => l.id)}
                strategy={verticalListSortingStrategy}
              >
                {lessons.map((lesson, index) => {
                  const isLocked = !isLessonAccessible(index);

                  // Check if this lesson was unlocked by meeting XP threshold
                  // (not first lesson, previous lesson had threshold, and it was met)
                  let isUnlocked = false;
                  if (!isLocked && index > 0 && !isAdmin) {
                    const prevLesson = lessons[index - 1];
                    if (prevLesson?.xp_threshold && prevLesson.xp_threshold > 0) {
                      isUnlocked = true; // Previous lesson had a threshold that was met
                    }
                  }

                  // Get XP progress for locked lessons (threshold from the previous lesson)
                  let xpProgress = null;
                  if (isLocked && index > 0) {
                    // Find which previous lesson is blocking access
                    for (let i = index - 1; i >= 0; i--) {
                      const prevLesson = lessons[i];
                      if (prevLesson.xp_threshold && prevLesson.xp_threshold > 0) {
                        const earned = getLessonEarnedXP(prevLesson);
                        if (earned < prevLesson.xp_threshold) {
                          xpProgress = {
                            earned: earned,
                            required: prevLesson.xp_threshold,
                            blockingLessonIndex: i + 1
                          };
                          break;
                        }
                      }
                    }
                  }
                  return (
                    <LessonItem
                      key={lesson.id}
                      lesson={lesson}
                      index={index}
                      isSelected={lesson.id === selectedLessonId}
                      isAdmin={isAdmin}
                      isLocked={isLocked}
                      isUnlocked={isUnlocked}
                      xpProgress={xpProgress}
                      onClick={() => handleLessonSelect(lesson)}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Ordering Mode Indicator (Admin Only) */}
        {isAdmin && (
          <div className="p-3 border-t border-gray-200 bg-white text-xs text-gray-600 flex-shrink-0">
            Mode: <span className="font-semibold ml-1">{orderingMode === 'sequential' ? 'Sequential' : 'Free Choice'}</span>
          </div>
        )}
      </div>
      )}

      {/* Main Content - Lesson Viewer */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {/* Mobile Header Bar - Shows current lesson and toggle - hidden in embedded mode */}
        {!embedded && (
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            aria-label="Open lessons menu"
          >
            <Bars3Icon className="w-5 h-5" />
          </button>
          {selectedLesson ? (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">
                {selectedLesson.title}
              </div>
              <div className="text-xs text-gray-500">
                Lesson {lessons.findIndex(l => l.id === selectedLesson.id) + 1} of {lessons.length}
              </div>
            </div>
          ) : (
            <div className="flex-1 text-sm text-gray-500">Select a lesson</div>
          )}
          {/* Progress indicator */}
          {lessons.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-shrink-0">
              <CheckCircleIcon className="w-4 h-4 text-green-500" />
              <span>{completedCount}/{lessons.length}</span>
            </div>
          )}
        </div>
        )}

        {/* Desktop toggle button (hidden on mobile since we have header bar) - hidden in embedded mode */}
        {!embedded && !isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="hidden md:flex absolute top-4 left-4 z-10 p-2 bg-white rounded-lg shadow-lg border border-gray-200 hover:bg-gray-50"
            aria-label="Open lessons menu"
          >
            <Bars3Icon className="w-6 h-6 text-gray-700" />
          </button>
        )}

        {/* Lesson Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:p-6">
          {!selectedLesson ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500 px-4">
                <ClockIcon className="w-10 sm:w-12 h-10 sm:h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-base sm:text-lg font-medium">Select a lesson to view</p>
                <p className="text-sm mt-1">Choose from the menu</p>
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90"
                >
                  <Bars3Icon className="w-4 h-4" />
                  View Lessons
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              {/* Lesson Header - Hero Treatment */}
              <div className="mb-6 sm:mb-8 pb-4 sm:pb-6 border-b border-gray-200">
                {/* Pillar Badge */}
                {selectedLesson.pillar && (
                  <div className="mb-2 sm:mb-3">
                    <span
                      className="inline-flex items-center px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-sm"
                      style={{
                        backgroundColor: getPillarData(selectedLesson.pillar).color
                      }}
                    >
                      {getPillarData(selectedLesson.pillar).name}
                    </span>
                  </div>
                )}

                {/* Large Title - Responsive size */}
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 leading-tight">
                  {selectedLesson.title}
                </h1>

                {selectedLesson.description && (
                  <p className="text-base sm:text-lg text-gray-600 mb-3 sm:mb-4">{selectedLesson.description}</p>
                )}

                {/* Meta Bar with Icons */}
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm text-gray-600">
                  {selectedLesson.duration_minutes && (
                    <div className="flex items-center gap-1.5">
                      <ClockIcon className="w-4 h-4 text-gray-500" />
                      <span>{selectedLesson.duration_minutes} min</span>
                    </div>
                  )}
                  {selectedLesson.is_completed && (
                    <div className="flex items-center gap-1.5 text-green-600 font-medium">
                      <CheckCircleIcon className="w-4 h-4" />
                      <span>Completed</span>
                    </div>
                  )}
                  {/* Reset Progress Button - Admin only */}
                  {isAdmin && completedSteps.size > 0 && (
                    <button
                      onClick={resetLessonProgress}
                      className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 transition-colors"
                      title="Reset lesson progress"
                    >
                      <ArrowPathIcon className="w-4 h-4" />
                      <span>Reset Progress</span>
                    </button>
                  )}
                </div>

                {/* Step Progress Indicators - inside header, above border */}
                {totalStepsWithTasks > 1 && (
                  <div className="flex items-center gap-2 mt-4 flex-wrap">
                    {/* Content steps */}
                    {lessonSteps.map((step, index) => (
                      <button
                        key={step.id || index}
                        onClick={() => goToStep(index)}
                        className="flex items-center gap-1.5 group"
                        title={step.title || `Step ${index + 1}`}
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                            completedSteps.has(index)
                              ? 'bg-green-100 text-green-600 ring-2 ring-green-200'
                              : index === currentStepIndex
                              ? 'bg-optio-purple text-white ring-2 ring-optio-purple/30'
                              : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'
                          }`}
                        >
                          {completedSteps.has(index) ? (
                            <CheckCircleIcon className="w-5 h-5" />
                          ) : (
                            index + 1
                          )}
                        </div>
                      </button>
                    ))}
                    {/* Tasks step (if there are linked tasks) - at index totalSteps + 1 */}
                    {hasTasksStep && (
                      <button
                        onClick={() => goToStep(totalSteps + 1)}
                        className="flex items-center gap-1.5 group"
                        title="Practice Tasks"
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                            currentStepIndex === totalSteps + 1
                              ? 'bg-optio-purple text-white ring-2 ring-optio-purple/30'
                              : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'
                          }`}
                        >
                          <ClipboardDocumentListIcon className="w-4 h-4" />
                        </div>
                      </button>
                    )}
                    <span className="ml-2 text-sm text-gray-500">
                      {currentStepIndex < totalSteps
                        ? `Step ${currentStepIndex + 1} of ${totalSteps}`
                        : currentStepIndex === totalSteps
                        ? 'Complete'
                        : 'Practice'}
                    </span>
                  </div>
                )}
              </div>

              {/* Lesson Content - Slide-based */}
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
                nextLessonXpThreshold={nextLessonXpThreshold}
                nextLessonTitle={nextLesson?.title}
                onTaskCreated={(newTask) => {
                  // Add new task to questTasks list
                  setQuestTasks(prev => [...prev, newTask])
                  // Also update the lesson's linked_task_ids so task appears immediately
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
    </div>
  );
};

export default CurriculumView;
