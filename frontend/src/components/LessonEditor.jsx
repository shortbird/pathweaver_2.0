import React, { useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { toast } from 'react-hot-toast'
import {
  PlusIcon,
  TrashIcon,
  Bars3Icon,
  ArrowUpTrayIcon,
  PlayIcon,
  SparklesIcon,
  ArrowUturnLeftIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  DocumentTextIcon,
  VideoCameraIcon,
  PaperClipIcon,
  EyeIcon,
} from '@heroicons/react/24/outline'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import StepEditor from './curriculum/StepEditor'
import LessonPreviewModal from './curriculum/LessonPreviewModal'
import AIEnhanceModal from './curriculum/AIEnhanceModal'

// Step types
const STEP_TYPES = {
  text: { label: 'Text', icon: DocumentTextIcon, color: 'text-blue-600 bg-blue-100' },
  video: { label: 'Video', icon: VideoCameraIcon, color: 'text-purple-600 bg-purple-100' },
  file: { label: 'File', icon: PaperClipIcon, color: 'text-green-600 bg-green-100' },
}

// Generate unique ID for steps
const generateStepId = () => `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

// Parse legacy content into steps
const parseContentToSteps = (content, legacyVideoUrl, legacyFiles) => {
  let steps = []

  if (!content) {
    steps = [{ id: generateStepId(), type: 'text', title: 'Introduction', content: '', order: 0 }]
  } else if (content.version === 2 && Array.isArray(content.steps)) {
    // Already in steps format
    steps = content.steps.map((step, idx) => ({
      ...step,
      id: step.id || generateStepId(),
      type: step.type || 'text',
      order: idx,
    }))
  } else if (content.blocks && Array.isArray(content.blocks)) {
    // Legacy blocks format
    const html = content.blocks
      .filter(block => block.type === 'text')
      .map(block => block.content || '')
      .join('')
    steps = [{ id: generateStepId(), type: 'text', title: 'Introduction', content: html, order: 0 }]
  } else if (typeof content === 'string') {
    // Legacy HTML string
    steps = [{ id: generateStepId(), type: 'text', title: 'Introduction', content, order: 0 }]
  } else {
    steps = [{ id: generateStepId(), type: 'text', title: 'Introduction', content: '', order: 0 }]
  }

  // Migrate legacy video_url to a video step
  if (legacyVideoUrl && !steps.some(s => s.type === 'video')) {
    steps.push({
      id: generateStepId(),
      type: 'video',
      title: 'Video',
      content: '',
      video_url: legacyVideoUrl,
      order: steps.length,
    })
  }

  // Migrate legacy files to a file step
  if (legacyFiles && legacyFiles.length > 0 && !steps.some(s => s.type === 'file')) {
    steps.push({
      id: generateStepId(),
      type: 'file',
      title: 'Resources',
      content: '',
      files: legacyFiles,
      order: steps.length,
    })
  }

  return steps
}

// Convert steps to storage format
const stepsToContent = (steps) => ({
  version: 2,
  steps: steps.map((step, idx) => ({
    id: step.id,
    type: step.type || 'text',
    title: step.title,
    content: step.content || '',
    video_url: step.video_url || null,
    files: step.files || null,
    attachments: step.attachments || null,
    links: step.links || null,
    order: idx,
  })),
})

// Get video embed URL
const getVideoEmbedUrl = (url) => {
  if (!url) return null
  const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
  const youtubeMatch = url.match(youtubeRegex)
  if (youtubeMatch) return `https://www.youtube-nocookie.com/embed/${youtubeMatch[1]}?rel=0&modestbranding=1`

  const vimeoRegex = /vimeo\.com\/(?:video\/)?(\d+)/
  const vimeoMatch = url.match(vimeoRegex)
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`

  const driveRegex = /drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/
  const driveMatch = url.match(driveRegex)
  if (driveMatch) return `https://drive.google.com/file/d/${driveMatch[1]}/preview`

  return null
}

// Sortable step item in the sidebar
const SortableStepItem = ({ step, isSelected, onSelect, onDelete, canDelete, index }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const stepType = STEP_TYPES[step.type] || STEP_TYPES.text
  const StepIcon = stepType.icon

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(step)}
      className={`group flex items-center gap-2 p-3 rounded-lg transition-all cursor-pointer ${
        isSelected
          ? 'bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 border-2 border-optio-purple'
          : 'bg-white border border-gray-200 hover:border-optio-purple/50'
      }`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1 flex-shrink-0"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
      >
        <Bars3Icon className="w-4 h-4" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded ${stepType.color}`}>
            <StepIcon className="w-3.5 h-3.5" />
          </span>
          <span className="text-sm font-medium text-gray-900 truncate">
            {step.title || 'Untitled Step'}
          </span>
        </div>
      </div>

      {canDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(step.id)
          }}
          className="opacity-0 group-hover:opacity-100 p-1.5 text-red-600 hover:bg-red-50 rounded transition-all flex-shrink-0"
          aria-label="Delete step"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

const LessonEditor = forwardRef(({
  questId,
  lesson = null,
  onSave,
  onCancel,
}, ref) => {
  const { user } = useAuth()
  const isSuperadmin = user?.role === 'superadmin'

  // Lesson metadata
  const [title, setTitle] = useState(lesson?.title || '')
  const [xpThreshold, setXpThreshold] = useState(lesson?.xp_threshold ?? 100)

  // Steps state - parse with legacy migration
  const [steps, setSteps] = useState(() =>
    parseContentToSteps(lesson?.content, lesson?.video_url, lesson?.files)
  )
  const [selectedStepId, setSelectedStepId] = useState(steps[0]?.id)
  const [preEnhanceContent, setPreEnhanceContent] = useState(null)

  // UI state
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showAIEnhance, setShowAIEnhance] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isEnhancing, setIsEnhancing] = useState(false)
  const fileInputRef = useRef(null)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const selectedStep = steps.find(s => s.id === selectedStepId) || steps[0]

  // Expose save function to parent via ref
  useImperativeHandle(ref, () => ({
    save: async () => {
      if (!title.trim()) {
        // Skip save if no title - nothing to save
        return
      }

      try {
        setIsSaving(true)
        const lessonData = {
          title: title.trim(),
          content: stepsToContent(steps),
          xp_threshold: parseInt(xpThreshold) || 0,
          video_url: null,
          files: null,
        }

        let response
        if (lesson?.id) {
          response = await api.put(
            `/api/quests/${questId}/curriculum/lessons/${lesson.id}`,
            lessonData
          )
        } else {
          response = await api.post(
            `/api/quests/${questId}/curriculum/lessons`,
            lessonData
          )
        }

        if (response.data.success) {
          onSave?.(response.data.lesson)
        }
      } catch (error) {
        console.error('Failed to auto-save lesson:', error)
      } finally {
        setIsSaving(false)
      }
    }
  }), [title, steps, xpThreshold, lesson?.id, questId, onSave])

  // Handle step content change
  const handleStepChange = useCallback((updatedStep) => {
    setSteps(prev => prev.map(s => s.id === updatedStep.id ? updatedStep : s))
  }, [])

  // Add new step
  const handleAddStep = (type) => {
    const titles = {
      text: `Step ${steps.length + 1}`,
      video: 'Video',
      file: 'Resources',
    }
    const newStep = {
      id: generateStepId(),
      type,
      title: titles[type],
      content: '',
      video_url: type === 'video' ? '' : null,
      files: type === 'file' ? [] : null,
      order: steps.length,
    }
    setSteps([...steps, newStep])
    setSelectedStepId(newStep.id)
    setShowAddMenu(false)
  }

  // Delete step
  const handleDeleteStep = (stepId) => {
    if (steps.length <= 1) {
      toast.error('Lesson must have at least one step')
      return
    }
    if (!confirm('Delete this step?')) return

    const newSteps = steps.filter(s => s.id !== stepId)
    setSteps(newSteps)

    if (selectedStepId === stepId) {
      setSelectedStepId(newSteps[0]?.id)
    }
  }

  // Reorder steps via drag and drop
  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = steps.findIndex(s => s.id === active.id)
    const newIndex = steps.findIndex(s => s.id === over.id)
    setSteps(arrayMove(steps, oldIndex, newIndex))
  }

  // Move step up/down with buttons
  const moveStep = (direction) => {
    const currentIndex = steps.findIndex(s => s.id === selectedStepId)
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= steps.length) return
    setSteps(arrayMove(steps, currentIndex, newIndex))
  }

  // File upload for file step
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !selectedStep || selectedStep.type !== 'file') return

    if (file.size > 25 * 1024 * 1024) {
      toast.error('File size exceeds 25MB limit')
      return
    }

    try {
      setIsUploading(true)
      const formData = new FormData()
      formData.append('file', file)

      const response = await api.post(
        `/api/quests/${questId}/curriculum/attachments`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )

      const fileUrl = response.data.url || response.data.attachment?.file_url
      if (fileUrl) {
        const newFile = { name: file.name, url: fileUrl, size: file.size }
        handleStepChange({
          ...selectedStep,
          files: [...(selectedStep.files || []), newFile]
        })
        toast.success('File uploaded')
      }
    } catch (error) {
      console.error('Failed to upload file:', error)
      toast.error('Failed to upload file')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveFile = (index) => {
    if (!selectedStep || selectedStep.type !== 'file') return
    handleStepChange({
      ...selectedStep,
      files: (selectedStep.files || []).filter((_, i) => i !== index)
    })
  }

  // AI Enhancement (superadmin only) - creates text, video, and file steps
  const handleEnhanceWithAI = async (formData) => {
    if (!isSuperadmin) return

    const { content, suggestResources } = formData

    if (!content.trim()) {
      toast.error('Please enter content to enhance')
      return
    }

    try {
      setIsEnhancing(true)
      setPreEnhanceContent(JSON.parse(JSON.stringify(steps)))

      const response = await api.post('/api/curriculum/enhance', {
        content,
        lesson_title: title,
        suggest_resources: suggestResources,
      })

      console.log('AI enhance response:', response.data)

      if (response.data.success && Array.isArray(response.data.steps) && response.data.steps.length > 0) {
        // Create steps from AI response - can include text, video, and file steps
        const enhancedSteps = response.data.steps.map((step, idx) => {
          const stepType = step.type || 'text'
          return {
            id: generateStepId(),
            type: stepType,
            title: step.title || `Step ${idx + 1}`,
            content: step.content || '',
            video_url: stepType === 'video' ? (step.video_url || '') : null,
            files: stepType === 'file' ? (step.files || []) : null,
            order: idx,
          }
        })

        console.log('Enhanced steps:', enhancedSteps)

        setSteps(enhancedSteps)
        setSelectedStepId(enhancedSteps[0]?.id)
        setShowAIEnhance(false)

        const textCount = enhancedSteps.filter(s => s.type === 'text').length
        const videoCount = enhancedSteps.filter(s => s.type === 'video').length
        const fileCount = enhancedSteps.filter(s => s.type === 'file').length

        let message = `Created ${textCount} text step${textCount !== 1 ? 's' : ''}`
        if (videoCount > 0) message += `, ${videoCount} video suggestion${videoCount !== 1 ? 's' : ''}`
        if (fileCount > 0) message += `, ${fileCount} resource suggestion${fileCount !== 1 ? 's' : ''}`
        toast.success(message)
      } else {
        console.error('Invalid response:', response.data)
        throw new Error(response.data.error || 'No steps returned from AI')
      }
    } catch (error) {
      console.error('AI enhancement failed:', error)
      toast.error(error.response?.data?.error || 'Failed to enhance content')
      setPreEnhanceContent(null)
    } finally {
      setIsEnhancing(false)
    }
  }

  const handleUndoEnhance = () => {
    if (!preEnhanceContent) return
    setSteps(preEnhanceContent)
    setSelectedStepId(preEnhanceContent[0]?.id)
    setPreEnhanceContent(null)
    toast.success('Changes reverted')
  }

  // Save lesson
  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Please enter a lesson title')
      return
    }

    try {
      setIsSaving(true)
      const lessonData = {
        title: title.trim(),
        content: stepsToContent(steps),
        xp_threshold: parseInt(xpThreshold) || 0,
        // Clear legacy fields since content is in steps now
        video_url: null,
        files: null,
      }

      let response
      if (lesson?.id) {
        response = await api.put(
          `/api/quests/${questId}/curriculum/lessons/${lesson.id}`,
          lessonData
        )
      } else {
        response = await api.post(
          `/api/quests/${questId}/curriculum/lessons`,
          lessonData
        )
      }

      if (response.data.success) {
        toast.success(lesson?.id ? 'Lesson updated' : 'Lesson created')
        onSave?.(response.data.lesson)
      }
    } catch (error) {
      console.error('Failed to save lesson:', error)
      toast.error(error.response?.data?.error || 'Failed to save lesson')
    } finally {
      setIsSaving(false)
    }
  }

  const currentStepIndex = steps.findIndex(s => s.id === selectedStepId)
  const embedUrl = selectedStep?.type === 'video' ? getVideoEmbedUrl(selectedStep?.video_url) : null

  return (
    <div className="space-y-6">
      {/* Lesson Title & Metadata */}
      <div className="flex items-end gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Lesson Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter lesson title"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
          />
        </div>

        <div className="w-32">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            XP to Complete
          </label>
          <input
            type="number"
            min="0"
            value={xpThreshold}
            onChange={(e) => setXpThreshold(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowPreview(true)}
          className="px-4 py-2 text-sm font-medium text-optio-purple bg-white border border-optio-purple rounded-lg hover:bg-optio-purple/10 transition-colors flex items-center gap-2"
        >
          <EyeIcon className="w-4 h-4" />
          Preview
        </button>

        {/* AI Enhance Button (Superadmin only) */}
        {isSuperadmin && (
          <>
            <button
              type="button"
              onClick={() => setShowAIEnhance(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <SparklesIcon className="w-4 h-4" />
              Enhance with AI
            </button>
            {preEnhanceContent && (
              <button
                type="button"
                onClick={handleUndoEnhance}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <ArrowUturnLeftIcon className="w-4 h-4" />
                Undo
              </button>
            )}
          </>
        )}
      </div>

      {/* Steps Editor - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Steps Sidebar */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">
              Steps ({steps.length})
            </h3>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="p-1.5 text-optio-purple hover:bg-optio-purple/10 rounded-lg transition-colors"
                title="Add step"
              >
                <PlusIcon className="w-5 h-5" />
              </button>
              {showAddMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 min-w-[140px]">
                  {Object.entries(STEP_TYPES).map(([type, config]) => {
                    const Icon = config.icon
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleAddStep(type)}
                        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Icon className="w-4 h-4" />
                        {config.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={steps.map(s => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {steps.map((step, index) => (
                  <SortableStepItem
                    key={step.id}
                    step={step}
                    index={index}
                    isSelected={step.id === selectedStepId}
                    onSelect={(s) => setSelectedStepId(s.id)}
                    onDelete={handleDeleteStep}
                    canDelete={steps.length > 1}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Move buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
            <button
              type="button"
              onClick={() => moveStep('up')}
              disabled={currentStepIndex <= 0}
              className="flex-1 px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
            >
              <ChevronUpIcon className="w-4 h-4" />
              Up
            </button>
            <button
              type="button"
              onClick={() => moveStep('down')}
              disabled={currentStepIndex >= steps.length - 1}
              className="flex-1 px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
            >
              <ChevronDownIcon className="w-4 h-4" />
              Down
            </button>
          </div>
        </div>

        {/* Step Content Editor */}
        <div className="lg:col-span-3 space-y-4">
          {selectedStep && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Step Title
                </label>
                <input
                  type="text"
                  value={selectedStep.title}
                  onChange={(e) => handleStepChange({ ...selectedStep, title: e.target.value })}
                  placeholder="Step title (shown to students)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
                />
              </div>

              {/* TEXT STEP */}
              {selectedStep.type === 'text' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Step Content
                  </label>
                  <StepEditor
                    key={selectedStep.id}
                    step={selectedStep}
                    onChange={handleStepChange}
                    placeholder="Write concise, focused content for this step..."
                    autoFocus
                    questId={questId}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Keep each step focused on one concept. Students see one step at a time.
                  </p>
                </div>
              )}

              {/* VIDEO STEP */}
              {selectedStep.type === 'video' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Video URL
                    </label>
                    <input
                      type="url"
                      value={selectedStep.video_url || ''}
                      onChange={(e) => handleStepChange({ ...selectedStep, video_url: e.target.value })}
                      placeholder="YouTube, Vimeo, or Google Drive URL"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
                    />
                  </div>
                  {embedUrl && (
                    <div className="aspect-video rounded-lg overflow-hidden bg-gray-100 max-w-2xl">
                      <iframe
                        src={embedUrl}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="Video preview"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description (optional)
                    </label>
                    <StepEditor
                      key={`${selectedStep.id}-desc`}
                      step={selectedStep}
                      onChange={handleStepChange}
                      placeholder="Add optional context or instructions for this video..."
                      questId={questId}
                    />
                  </div>
                </div>
              )}

              {/* FILE STEP */}
              {selectedStep.type === 'file' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Files
                    </label>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                    >
                      <ArrowUpTrayIcon className="w-4 h-4" />
                      {isUploading ? 'Uploading...' : 'Upload File'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={isUploading}
                    />
                    <p className="mt-2 text-xs text-gray-500">Max 25MB per file</p>
                  </div>

                  {selectedStep.files && selectedStep.files.length > 0 && (
                    <div className="space-y-2">
                      {selectedStep.files.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <div className="flex items-center gap-3">
                            <PaperClipIcon className="w-5 h-5 text-gray-400" />
                            <div>
                              <p className="text-sm font-medium text-gray-900">{file.name}</p>
                              {file.size && (
                                <p className="text-xs text-gray-500">
                                  {(file.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(index)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Remove file"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description (optional)
                    </label>
                    <StepEditor
                      key={`${selectedStep.id}-desc`}
                      step={selectedStep}
                      onChange={handleStepChange}
                      placeholder="Add optional context or instructions for these files..."
                      questId={questId}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Lesson'}
        </button>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <LessonPreviewModal
          lesson={{
            title: title || 'Untitled Lesson',
            content: stepsToContent(steps),
          }}
          onClose={() => setShowPreview(false)}
          initialStepIndex={steps.findIndex(s => s.id === selectedStepId)}
          onEditStep={(step, stepIndex) => {
            // Find the matching step by index and select it
            if (steps[stepIndex]) {
              setSelectedStepId(steps[stepIndex].id)
            }
          }}
        />
      )}

      {/* AI Enhance Modal */}
      <AIEnhanceModal
        isOpen={showAIEnhance}
        onClose={() => setShowAIEnhance(false)}
        onSubmit={handleEnhanceWithAI}
        initialContent={steps.filter(s => s.type === 'text').map(s => s.content).join('\n\n')}
        lessonTitle={title}
        isLoading={isEnhancing}
      />
    </div>
  )
})

export default LessonEditor
