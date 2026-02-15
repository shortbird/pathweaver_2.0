import React, { useState, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'
import {
  FolderIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  TrophyIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  VideoCameraIcon,
  PaperClipIcon,
  LinkIcon,
  Bars3BottomLeftIcon,
  ArrowUpTrayIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { getPillarData, PILLAR_KEYS } from '../../../utils/pillarMappings'
import { useAIAccess } from '../../../contexts/AIAccessContext'
import RichTextEditor from './RichTextEditor'
import ProjectHeaderImage from './ProjectHeaderImage'
import api from '../../../services/api'

/**
 * OutlineEditor - Right panel editor that shows dynamic editor based on selected item type
 * Project: Title, description, XP threshold, header image
 * Lesson: Title, list of steps, list of tasks with required toggle
 * Step: Title, rich text content, video URL, file uploads, links
 * Task: Title, description, pillar, XP, required toggle
 */
const OutlineEditor = ({
  selectedItem,
  selectedType,
  onSave,
  onSelectItem,
  tasksMap,
  onAddStep,
  onDeleteStep,
  onToggleTaskRequired,
  saving,
  questId,
  onAddTask,
  onUnlinkTask,
  isSuperadmin,
}) => {
  const [formData, setFormData] = useState({})
  const [hasChanges, setHasChanges] = useState(false)
  const { canUseTaskGeneration } = useAIAccess()

  // Update form data when selection changes
  useEffect(() => {
    if (selectedItem) {
      setFormData(getInitialFormData(selectedItem, selectedType))
      setHasChanges(false)
    }
  }, [selectedItem?.id, selectedItem?.stepIndex, selectedType])

  const getInitialFormData = (item, type) => {
    switch (type) {
      case 'project':
        return {
          title: item.title || '',
          description: item.description || '',
          xp_threshold: item.xp_threshold || 0,
          header_image_url: item.header_image_url || '',
        }
      case 'lesson':
        return {
          title: item.title || '',
        }
      case 'step':
        return {
          id: item.id,
          title: item.title || '',
          content: item.content || '',
          video_url: item.video_url || '',
          attachments: item.attachments || [],
          links: item.links || [],
          lessonId: item.lessonId,
          stepIndex: item.stepIndex,
        }
      case 'task':
        return {
          title: item.title || '',
          description: item.description || '',
          pillar: item.pillar || 'stem',
          xp_value: item.xp_value || 100,
          is_required: item.is_required === true,
        }
      default:
        return {}
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setHasChanges(true)
  }

  const handleSave = async () => {
    if (!selectedItem) return
    try {
      await onSave(selectedItem, selectedType, formData)
      setHasChanges(false)
      toast.success(`${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)} updated`)
    } catch (error) {
      console.error('Failed to save:', error)
      toast.error('Failed to save changes')
    }
  }

  // Empty state
  if (!selectedItem) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <DocumentTextIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">Select an item from the outline to edit</p>
        </div>
      </div>
    )
  }

  // Get icon based on type
  const getIcon = () => {
    switch (selectedType) {
      case 'project':
        return <FolderIcon className="w-5 h-5" />
      case 'lesson':
        return <DocumentTextIcon className="w-5 h-5" />
      case 'step':
        return <Bars3BottomLeftIcon className="w-5 h-5" />
      case 'task':
        return <CheckCircleIcon className="w-5 h-5" />
      default:
        return <DocumentTextIcon className="w-5 h-5" />
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className="text-optio-purple">{getIcon()}</span>
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {selectedType}
            </span>
            <h2 className="text-lg font-semibold text-gray-900 truncate max-w-md">
              {formData.title || `Untitled ${selectedType}`}
            </h2>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            hasChanges
              ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:opacity-90'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedType === 'project' && (
          <ProjectEditor
            formData={formData}
            onChange={handleChange}
            project={selectedItem}
            onImageAutoSave={async (imageUrl) => {
              // Auto-save project with new image URL
              const updatedFormData = { ...formData, header_image_url: imageUrl }
              try {
                await onSave(selectedItem, selectedType, updatedFormData)
                setHasChanges(false)
              } catch (error) {
                console.error('Failed to auto-save image:', error)
              }
            }}
          />
        )}

        {selectedType === 'lesson' && (
          <LessonEditor
            formData={formData}
            lesson={selectedItem}
            onChange={handleChange}
            tasksMap={tasksMap}
            onSelectItem={onSelectItem}
            onAddStep={onAddStep}
            onDeleteStep={onDeleteStep}
            onToggleTaskRequired={onToggleTaskRequired}
            canUseTaskGeneration={canUseTaskGeneration}
            onAddTask={onAddTask}
            onUnlinkTask={onUnlinkTask}
            isSuperadmin={isSuperadmin}
          />
        )}

        {selectedType === 'step' && (
          <StepEditor
            formData={formData}
            onChange={handleChange}
            questId={questId}
            onDeleteStep={onDeleteStep}
            selectedItem={selectedItem}
          />
        )}

        {selectedType === 'task' && (
          <TaskEditor
            formData={formData}
            onChange={handleChange}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Project Editor - Title, description, XP threshold, header image
 */
const ProjectEditor = ({ formData, onChange, project, onImageAutoSave }) => {
  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Header Image */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Header Image (optional)
        </label>
        <ProjectHeaderImage
          imageUrl={formData.header_image_url}
          onUpdate={(url) => onChange('header_image_url', url)}
          onAutoSave={onImageAutoSave}
          questId={project?.id}
          projectTitle={formData.title}
          projectDescription={formData.description}
        />
      </div>

      {/* Title and XP on same row */}
      <div className="flex gap-4 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Project Title
          </label>
          <input
            type="text"
            value={formData.title || ''}
            onChange={(e) => onChange('title', e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            placeholder="Enter project title..."
          />
        </div>
        <div className="flex-shrink-0">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            XP Required
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="50"
              value={formData.xp_threshold || 0}
              onChange={(e) => onChange('xp_threshold', parseInt(e.target.value) || 0)}
              className="w-28 px-3 py-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
              XP
            </span>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Description
        </label>
        <RichTextEditor
          value={formData.description || ''}
          onChange={(html) => onChange('description', html)}
          placeholder="Describe what students will learn in this project..."
          minHeight="200px"
        />
      </div>
    </div>
  )
}

/**
 * Lesson Editor - Title, list of steps (clickable), list of tasks with required toggle
 */
const LessonEditor = ({
  formData,
  lesson,
  onChange,
  tasksMap,
  onSelectItem,
  onAddStep,
  onDeleteStep,
  onToggleTaskRequired,
  canUseTaskGeneration,
  onAddTask,
  onUnlinkTask,
  isSuperadmin,
}) => {
  const steps = lesson?.content?.steps || []
  const tasks = tasksMap?.[lesson?.id] || []

  const handleStepClick = (step, index) => {
    onSelectItem?.({ ...step, lessonId: lesson.id, stepIndex: index }, 'step')
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Lesson Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Lesson Title
        </label>
        <input
          type="text"
          value={formData.title || ''}
          onChange={(e) => onChange('title', e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          placeholder="Enter lesson title..."
        />
      </div>

      {/* Steps Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-gray-700">
            Lesson Steps ({steps.length})
          </label>
          <button
            onClick={() => onAddStep?.(lesson)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-optio-purple border border-optio-purple/30 rounded-lg hover:bg-optio-purple/5 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add Step
          </button>
        </div>

        {steps.length === 0 ? (
          <div className="p-6 bg-gray-50 rounded-lg text-center text-gray-500">
            <Bars3BottomLeftIcon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No steps yet. Add your first step to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div
                key={step.id || index}
                onClick={() => handleStepClick(step, index)}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors group"
              >
                <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded bg-white border border-gray-200 text-gray-500">
                  <Bars3BottomLeftIcon className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {step.title || `Step ${index + 1}`}
                  </div>
                </div>
                <PencilIcon className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteStep?.(lesson, index)
                  }}
                  className="p-1 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded transition-all"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tasks Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-gray-700">
            Linked Tasks ({tasks.length})
          </label>
          <button
            onClick={() => onAddTask?.(lesson)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-optio-purple border border-optio-purple/30 rounded-lg hover:bg-optio-purple/5 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add Task
          </button>
        </div>

        {tasks.length === 0 ? (
          <div className="p-6 bg-gray-50 rounded-lg text-center text-gray-500">
            <CheckCircleIcon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No tasks linked to this lesson yet.</p>
            <button
              onClick={() => onAddTask?.(lesson)}
              className="mt-2 text-sm text-optio-purple hover:underline"
            >
              Add your first task
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => {
              const pillarData = getPillarData(task.pillar)
              const isRequired = task.is_required === true

              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group cursor-pointer"
                  onClick={() => onSelectItem?.({ ...task, lessonId: lesson.id }, 'task')}
                >
                  <span
                    className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded"
                    style={{ backgroundColor: `${pillarData.color}20`, color: pillarData.color }}
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {task.title}
                    </div>
                    <div className="text-xs text-gray-500">
                      {pillarData.name} - {task.xp_value || 100} XP
                    </div>
                  </div>
                  {/* Edit indicator */}
                  <PencilIcon className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  {/* Required Toggle */}
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <span className={`text-xs font-medium ${isRequired ? 'text-red-600' : 'text-gray-500'}`}>
                      {isRequired ? 'Required' : 'Optional'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggleTaskRequired?.(task)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-optio-purple focus:ring-offset-2 ${
                        isRequired ? 'bg-optio-purple' : 'bg-gray-200'
                      }`}
                      role="switch"
                      aria-checked={isRequired}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          isRequired ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  {/* Unlink button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onUnlinkTask?.(task, lesson)
                    }}
                    className="p-1 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded transition-all flex-shrink-0"
                    title="Remove from lesson"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Step Editor - Title, type selector, rich text content, video URL, file uploads, links
 */
const StepEditor = ({ formData, onChange, questId, onDeleteStep, selectedItem }) => {
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)

  const handleAddLink = () => {
    if (!linkUrl.trim()) return

    let url = linkUrl.trim()
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url
    }

    const newLink = {
      url,
      displayText: linkText.trim() || url
    }
    const currentLinks = formData.links || []
    onChange('links', [...currentLinks, newLink])

    setLinkUrl('')
    setLinkText('')
  }

  const handleRemoveLink = (index) => {
    const currentLinks = formData.links || []
    onChange('links', currentLinks.filter((_, i) => i !== index))
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !questId) return

    // Validate file
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      toast.error('File must be less than 50MB')
      return
    }

    try {
      setIsUploading(true)
      const formDataUpload = new FormData()
      formDataUpload.append('file', file)

      const response = await api.post(`/api/quests/${questId}/curriculum/attachments`, formDataUpload)

      if (response.data.url) {
        const newAttachment = {
          name: file.name,
          url: response.data.url,
          size: file.size,
          type: file.type
        }
        const currentAttachments = formData.attachments || []
        onChange('attachments', [...currentAttachments, newAttachment])
        toast.success('File uploaded')
      }
    } catch (error) {
      console.error('Failed to upload file:', error)
      toast.error('Failed to upload file')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemoveAttachment = (index) => {
    const currentAttachments = formData.attachments || []
    onChange('attachments', currentAttachments.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Step Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Step Title
        </label>
        <input
          type="text"
          value={formData.title || ''}
          onChange={(e) => onChange('title', e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          placeholder="Enter step title..."
        />
      </div>

      {/* Content - Rich Text */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Content
        </label>
        <RichTextEditor
          value={formData.content || ''}
          onChange={(html) => onChange('content', html)}
          placeholder="Write the content for this step..."
          minHeight="200px"
        />
      </div>

      {/* Video URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <div className="flex items-center gap-2">
            <VideoCameraIcon className="w-4 h-4" />
            Video URL (optional)
          </div>
        </label>
        <input
          type="url"
          value={formData.video_url || ''}
          onChange={(e) => onChange('video_url', e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          placeholder="YouTube, Vimeo, or Google Drive link..."
        />
        <p className="text-xs text-gray-500 mt-1">
          Supports YouTube, Vimeo, and Google Drive videos
        </p>
      </div>

      {/* File Attachments */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <div className="flex items-center gap-2">
            <PaperClipIcon className="w-4 h-4" />
            File Attachments
          </div>
        </label>

        {/* Current attachments */}
        {(formData.attachments || []).length > 0 && (
          <div className="space-y-2 mb-3">
            {formData.attachments.map((attachment, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
              >
                <PaperClipIcon className="w-4 h-4 text-gray-400" />
                <span className="flex-1 text-sm text-gray-700 truncate">
                  {attachment.name}
                </span>
                <button
                  onClick={() => handleRemoveAttachment(index)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {isUploading ? (
            <div className="w-4 h-4 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
          ) : (
            <ArrowUpTrayIcon className="w-4 h-4" />
          )}
          Upload File
        </button>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Links */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <div className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4" />
            Website Links
          </div>
        </label>

        {/* Current links */}
        {(formData.links || []).length > 0 && (
          <div className="space-y-2 mb-3">
            {formData.links.map((link, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
              >
                <LinkIcon className="w-4 h-4 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-700 truncate">
                    {link.displayText || link.url}
                  </div>
                  {link.displayText && (
                    <div className="text-xs text-gray-500 truncate">{link.url}</div>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveLink(index)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add link form */}
        <div className="flex gap-2">
          <input
            type="text"
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            placeholder="Display text (optional)"
          />
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddLink()}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            placeholder="https://..."
          />
          <button
            onClick={handleAddLink}
            disabled={!linkUrl.trim()}
            className="px-4 py-2 text-sm font-medium text-optio-purple border border-optio-purple/30 rounded-lg hover:bg-optio-purple/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
      </div>

      {/* Delete Step */}
      {onDeleteStep && selectedItem?.lessonId !== undefined && selectedItem?.stepIndex !== undefined && (
        <div className="pt-4 mt-4 border-t border-gray-200">
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to delete this step?')) {
                onDeleteStep({ id: selectedItem.lessonId }, selectedItem.stepIndex)
              }
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            <TrashIcon className="w-4 h-4" />
            Delete Step
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Task Editor - Title, description, pillar, XP, required toggle
 */
const TaskEditor = ({ formData, onChange }) => {
  const pillarData = getPillarData(formData.pillar || 'stem')

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Task Title
        </label>
        <input
          type="text"
          value={formData.title || ''}
          onChange={(e) => onChange('title', e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          placeholder="Enter task title..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Description
        </label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          rows={3}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
          placeholder="Describe what students should do..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Pillar
          </label>
          <select
            value={formData.pillar || 'stem'}
            onChange={(e) => onChange('pillar', e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          >
            {PILLAR_KEYS.map(key => (
              <option key={key} value={key}>{getPillarData(key).name}</option>
            ))}
          </select>
          <div className="mt-2">
            <span
              className="inline-block px-2 py-1 text-xs font-semibold rounded"
              style={{ backgroundColor: `${pillarData.color}20`, color: pillarData.color }}
            >
              {pillarData.name}
            </span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            XP Value
          </label>
          <div className="relative">
            <input
              type="number"
              min="25"
              max="500"
              step="25"
              value={formData.xp_value || 100}
              onChange={(e) => onChange('xp_value', parseInt(e.target.value) || 100)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            />
            <TrophyIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Required Toggle */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div>
          <label className="text-sm font-medium text-gray-700">Required Task</label>
          <p className="text-sm text-gray-500 mt-0.5">
            Students must complete this task to finish the lesson
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange('is_required', !formData.is_required)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-optio-purple focus:ring-offset-2 ${
            formData.is_required ? 'bg-optio-purple' : 'bg-gray-200'
          }`}
          role="switch"
          aria-checked={formData.is_required}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              formData.is_required ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  )
}

export default OutlineEditor
