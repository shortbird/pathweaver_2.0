import React, { useState, useEffect, useCallback, useRef } from 'react'
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
import {
  PlusIcon,
  TrashIcon,
  Bars3Icon,
  DocumentTextIcon,
  PaperClipIcon,
  ChevronDownIcon,
  PlayIcon,
  LinkIcon,
  XMarkIcon,
  EyeIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import LessonContentRenderer from './LessonContentRenderer'
import TaskLinker from './TaskLinker'
import api from '../../services/api'
import { getPillarData } from '../../utils/pillarMappings'
import TextBlockEditor from './blocks/TextBlockEditor'
import ImageBlockEditor from './blocks/ImageBlockEditor'
import CalloutBlockEditor from './blocks/CalloutBlockEditor'
import DividerBlockEditor from './blocks/DividerBlockEditor'
import { createBlock, BLOCK_TYPES, BLOCK_TYPE_LIST } from './blocks/index'

// URL conversion utility (same as IframeEmbed)
const convertToEmbedUrl = (urlString) => {
  try {
    const parsedUrl = new URL(urlString)
    const hostname = parsedUrl.hostname.toLowerCase()

    if (hostname.includes('youtube.com')) {
      const videoId = parsedUrl.searchParams.get('v')
      if (videoId) return `https://www.youtube.com/embed/${videoId}`
    }
    if (hostname.includes('youtu.be')) {
      const videoId = parsedUrl.pathname.slice(1)
      if (videoId) return `https://www.youtube.com/embed/${videoId}`
    }
    if (hostname.includes('vimeo.com') && !hostname.includes('player.vimeo.com')) {
      const videoId = parsedUrl.pathname.split('/').pop()
      if (videoId && /^\d+$/.test(videoId)) {
        return `https://player.vimeo.com/video/${videoId}`
      }
    }
    if (hostname.includes('loom.com') && parsedUrl.pathname.includes('/share/')) {
      return urlString.replace('/share/', '/embed/')
    }
    if (hostname.includes('drive.google.com') && parsedUrl.pathname.includes('/file/d/')) {
      const match = parsedUrl.pathname.match(/\/file\/d\/([^/]+)/)
      if (match) return `https://drive.google.com/file/d/${match[1]}/preview`
    }
    return urlString
  } catch {
    return urlString
  }
}

// Sortable block item
const SortableBlockItem = ({ block, index, onDelete, onUpdate, isEditing, questId }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const getBlockIcon = () => {
    const config = BLOCK_TYPES[block.type]
    if (config) {
      const IconComponent = config.icon
      return <IconComponent className="w-5 h-5" />
    }
    return <DocumentTextIcon className="w-5 h-5" />
  }

  const getBlockLabel = () => {
    const config = BLOCK_TYPES[block.type]
    if (block.type === 'iframe' || block.type === 'document') {
      return block.data?.title || config?.label || 'Block'
    }
    return config?.label || 'Block'
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-gray-200 rounded-lg bg-white overflow-hidden"
    >
      {/* Block Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <Bars3Icon className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 flex-1 text-sm text-gray-600">
          {getBlockIcon()}
          <span className="font-medium">{getBlockLabel()}</span>
        </div>

        <button
          type="button"
          onClick={() => onDelete(block.id)}
          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
          aria-label="Delete block"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Block Content */}
      <div className="p-4">
        {block.type === 'text' && (
          <TextBlockEditor
            value={block.content || ''}
            onChange={(value) => onUpdate(block.id, { content: value })}
            placeholder="Write your content here..."
          />
        )}

        {block.type === 'image' && (
          <ImageBlockEditor
            block={block}
            questId={questId}
            onChange={(updatedBlock) => onUpdate(block.id, updatedBlock)}
          />
        )}

        {block.type === 'callout' && (
          <CalloutBlockEditor
            block={block}
            onUpdate={onUpdate}
          />
        )}

        {block.type === 'divider' && (
          <DividerBlockEditor
            block={block}
            onUpdate={onUpdate}
          />
        )}

        {block.type === 'iframe' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Video/Embed URL
              </label>
              <input
                type="url"
                value={block.data?.originalUrl || block.content || ''}
                onChange={(e) => {
                  const url = e.target.value
                  onUpdate(block.id, {
                    content: convertToEmbedUrl(url),
                    data: { ...block.data, originalUrl: url },
                  })
                }}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500">
                YouTube, Vimeo, Loom, Google Drive, EdPuzzle, Kahoot
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title
              </label>
              <input
                type="text"
                value={block.data?.title || ''}
                onChange={(e) =>
                  onUpdate(block.id, {
                    data: { ...block.data, title: e.target.value },
                  })
                }
                placeholder="e.g., Introduction Video"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              />
            </div>
            {block.content && (
              <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                <iframe
                  src={block.content}
                  title={block.data?.title || 'Embedded content'}
                  className="w-full h-full"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
            )}
          </div>
        )}

        {block.type === 'document' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Document URL
              </label>
              <input
                type="url"
                value={block.content || ''}
                onChange={(e) => onUpdate(block.id, { content: e.target.value })}
                placeholder="https://drive.google.com/file/d/..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Display Title
              </label>
              <input
                type="text"
                value={block.data?.title || ''}
                onChange={(e) =>
                  onUpdate(block.id, {
                    data: { ...block.data, title: e.target.value },
                  })
                }
                placeholder="e.g., Assignment Instructions"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Block type selector dropdown
const AddBlockButton = ({ onAdd }) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const blockTypes = BLOCK_TYPE_LIST.map(type => BLOCK_TYPES[type])

  const handleAdd = (type) => {
    onAdd(type)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-optio-purple border-2 border-dashed border-optio-purple/30 rounded-lg hover:border-optio-purple hover:bg-optio-purple/5 transition-colors w-full justify-center"
      >
        <PlusIcon className="w-4 h-4" />
        Add Content Block
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
          {blockTypes.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => handleAdd(item.type)}
              className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <item.icon className="w-5 h-5 text-optio-purple" />
              <div>
                <div className="font-medium text-gray-900">{item.label}</div>
                <div className="text-xs text-gray-500">{item.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Main component
const LessonBlockEditor = ({ lesson, questId, onUpdate, showPreview }) => {
  const [localLesson, setLocalLesson] = useState(lesson)
  const [hasChanges, setHasChanges] = useState(false)
  const saveTimeoutRef = useRef(null)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Sync lesson from parent
  useEffect(() => {
    setLocalLesson(lesson)
    setHasChanges(false)
  }, [lesson.id])

  // Auto-save with debounce
  useEffect(() => {
    if (!hasChanges) return

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      onUpdate(lesson.id, {
        title: localLesson.title,
        description: localLesson.description,
        content: localLesson.content,
        xp_threshold: localLesson.xp_threshold || 0,
      })
      setHasChanges(false)
    }, 1500)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [hasChanges, localLesson, lesson.id, onUpdate])

  // Update local state
  const handleChange = useCallback((field, value) => {
    setLocalLesson((prev) => ({ ...prev, [field]: value }))
    setHasChanges(true)
  }, [])

  // Manual save function
  const handleManualSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    onUpdate(lesson.id, {
      title: localLesson.title,
      description: localLesson.description,
      content: localLesson.content,
      xp_threshold: localLesson.xp_threshold || 0,
    })
    setHasChanges(false)
  }, [lesson.id, localLesson, onUpdate])

  // Content blocks
  const blocks = localLesson.content?.blocks || []

  const setBlocks = useCallback((newBlocks) => {
    const updatedBlocks = typeof newBlocks === 'function' ? newBlocks(blocks) : newBlocks
    handleChange('content', { blocks: updatedBlocks })
  }, [blocks, handleChange])

  // Add a new block
  const handleAddBlock = (type) => {
    const newBlock = createBlock(type)
    setBlocks([...blocks, newBlock])
  }

  // Update a block
  const handleUpdateBlock = (blockId, updates) => {
    setBlocks(
      blocks.map((b) => (b.id === blockId ? { ...b, ...updates } : b))
    )
  }

  // Delete a block
  const handleDeleteBlock = (blockId) => {
    setBlocks(blocks.filter((b) => b.id !== blockId))
  }

  // Reorder blocks
  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = blocks.findIndex((b) => b.id === active.id)
    const newIndex = blocks.findIndex((b) => b.id === over.id)
    setBlocks(arrayMove(blocks, oldIndex, newIndex))
  }

  // Preview mode - matches exactly how students see the curriculum in CurriculumView
  if (showPreview) {
    const pillarData = getPillarData(localLesson.pillar || 'art')

    return (
      <div className="h-full overflow-y-auto bg-white">
        {/* Student View Header Banner */}
        <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 border-b border-gray-200 px-4 sm:px-6 py-2">
          <div className="max-w-4xl mx-auto flex items-center gap-2 text-xs sm:text-sm text-gray-600">
            <EyeIcon className="w-4 h-4" />
            <span>Preview Mode - This is how students will see this lesson</span>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <div className="max-w-4xl mx-auto">
            {/* Lesson Header - Hero Treatment (matches CurriculumView) */}
            <div className="mb-6 sm:mb-8 pb-4 sm:pb-6 border-b border-gray-200">
              {/* Pillar Badge */}
              {localLesson.pillar && (
                <div className="mb-2 sm:mb-3">
                  <span
                    className="inline-flex items-center px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-sm"
                    style={{ backgroundColor: pillarData.color }}
                  >
                    {pillarData.name}
                  </span>
                </div>
              )}

              {/* Large Title - Responsive */}
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 leading-tight">
                {localLesson.title || 'Untitled Lesson'}
              </h1>

              {localLesson.description && (
                <p className="text-base sm:text-lg text-gray-600 mb-3 sm:mb-4">{localLesson.description}</p>
              )}

              {/* Meta Bar - Only show estimated duration if set */}
              {localLesson.estimated_duration_minutes && (
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <ClockIcon className="w-4 h-4 text-gray-500" />
                    <span>{localLesson.estimated_duration_minutes} min</span>
                  </div>
                </div>
              )}
            </div>

            {/* Lesson Content - using LessonContentRenderer for exact student rendering */}
            {blocks.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <DocumentTextIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No content blocks yet</p>
              </div>
            ) : (
              <LessonContentRenderer content={{ blocks }} />
            )}
          </div>
        </div>
      </div>
    )
  }

  // Edit mode
  return (
    <div className="h-full flex flex-col">
      {/* Lesson Metadata */}
      <div className="p-3 sm:p-4 border-b border-gray-200 space-y-3 sm:space-y-4">
        {/* Save Button Row */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {hasChanges ? 'Unsaved changes' : 'All changes saved'}
          </span>
          <button
            onClick={handleManualSave}
            disabled={!hasChanges}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
              hasChanges
                ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:opacity-90'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Save
          </button>
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
            Lesson Title
          </label>
          <input
            type="text"
            value={localLesson.title || ''}
            onChange={(e) => handleChange('title', e.target.value)}
            placeholder="Enter lesson title"
            className="w-full px-3 py-2 text-base sm:text-lg font-medium border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
            Description (optional)
          </label>
          <textarea
            value={localLesson.description || ''}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Brief description of this lesson"
            rows={2}
            className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
          />
        </div>

        {/* XP Threshold - XP needed from this lesson to unlock the next */}
        <div className="pt-2 sm:pt-3 border-t border-gray-100">
          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
            XP to Unlock Next Lesson
          </label>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="relative flex-shrink-0 w-full sm:w-[200px]">
              <input
                type="number"
                min="0"
                step="10"
                value={localLesson.xp_threshold || 0}
                onChange={(e) => handleChange('xp_threshold', parseInt(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">XP</span>
            </div>
            <p className="text-xs text-gray-500">
              {localLesson.xp_threshold > 0
                ? `Students must earn ${localLesson.xp_threshold} XP from this lesson's tasks to unlock the next lesson`
                : 'No XP requirement - next lesson is always accessible'
              }
            </p>
          </div>
        </div>

      </div>

      {/* Content Blocks */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="space-y-3 sm:space-y-4">
          {blocks.length === 0 ? (
            <div className="text-center py-8 sm:py-12 border-2 border-dashed border-gray-200 rounded-lg">
              <DocumentTextIcon className="w-10 sm:w-12 h-10 sm:h-12 mx-auto text-gray-300 mb-2 sm:mb-3" />
              <p className="text-gray-600 mb-1 text-sm sm:text-base">No content blocks yet</p>
              <p className="text-xs sm:text-sm text-gray-500">Add text, videos, or documents below</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={blocks.map((b) => b.id)}
                strategy={verticalListSortingStrategy}
              >
                {blocks.map((block, index) => (
                  <SortableBlockItem
                    key={block.id}
                    block={block}
                    index={index}
                    onDelete={handleDeleteBlock}
                    onUpdate={handleUpdateBlock}
                    isEditing={true}
                    questId={questId}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}

          {/* Add Block Button */}
          <AddBlockButton onAdd={handleAddBlock} />
        </div>

        {/* Task Linking Section */}
        <TaskLinkingSection
          lessonId={lesson.id}
          questId={questId}
          lessonTitle={localLesson.title}
          lessonContent={localLesson.content}
        />
      </div>
    </div>
  )
}

// Task Linking Section Component
const TaskLinkingSection = ({ lessonId, questId, lessonTitle, lessonContent }) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [availableTasks, setAvailableTasks] = useState([])
  const [linkedTasks, setLinkedTasks] = useState([])
  const [loading, setLoading] = useState(false)

  // Fetch quest tasks and linked tasks
  const fetchTasks = async () => {
    try {
      setLoading(true)

      // Fetch all quest tasks
      const tasksResponse = await api.get(`/api/quests/${questId}/tasks`)
      const allTasks = tasksResponse.data.tasks || tasksResponse.data || []
      setAvailableTasks(allTasks)

      // Fetch linked task IDs for this lesson
      const lessonResponse = await api.get(`/api/quests/${questId}/curriculum/lessons?include_unpublished=true`)
      const lessons = lessonResponse.data.lessons || []
      const currentLesson = lessons.find(l => l.id === lessonId)

      // Get linked task IDs from curriculum_lesson_tasks (we need to fetch this separately)
      // For now, we'll store linked tasks in the lesson's linked_task_ids if available
      const linkedTaskIds = currentLesson?.linked_task_ids || []
      const linked = allTasks.filter(t => linkedTaskIds.includes(t.id))
      setLinkedTasks(linked)
    } catch (error) {
      console.error('Failed to fetch tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (lessonId && questId) {
      fetchTasks()
    }
  }, [lessonId, questId])

  const handleLinkTasks = async (taskIds) => {
    try {
      for (const taskId of taskIds) {
        await api.post(`/api/quests/${questId}/curriculum/lessons/${lessonId}/link-task`, {
          task_id: taskId
        })
      }
      toast.success(`Linked ${taskIds.length} task(s)`)
      setIsModalOpen(false)
      fetchTasks() // Refresh
    } catch (error) {
      console.error('Failed to link tasks:', error)
      toast.error('Failed to link tasks')
    }
  }

  const handleUnlinkTask = async (taskId) => {
    try {
      await api.delete(`/api/quests/${questId}/curriculum/lessons/${lessonId}/link-task/${taskId}`)
      toast.success('Task unlinked')
      fetchTasks() // Refresh
    } catch (error) {
      console.error('Failed to unlink task:', error)
      toast.error('Failed to unlink task')
    }
  }

  const linkedTaskIds = linkedTasks.map(t => t.id)

  return (
    <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
      <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
        <h3 className="text-base sm:text-lg font-medium text-gray-900 flex items-center gap-2">
          <LinkIcon className="w-4 sm:w-5 h-4 sm:h-5 text-optio-purple" />
          <span className="hidden xs:inline">Linked Tasks</span>
          <span className="xs:hidden">Tasks</span>
        </h3>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium text-optio-purple border border-optio-purple rounded-lg hover:bg-optio-purple/5 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          <span className="hidden xs:inline">Link Tasks</span>
          <span className="xs:hidden">Add</span>
        </button>
      </div>

      {linkedTasks.length === 0 ? (
        <div className="text-center py-6 sm:py-8 border-2 border-dashed border-gray-200 rounded-lg">
          <LinkIcon className="w-8 sm:w-10 h-8 sm:h-10 mx-auto text-gray-300 mb-2" />
          <p className="text-xs sm:text-sm text-gray-600">No tasks linked</p>
          <p className="text-xs text-gray-500 mt-1 hidden sm:block">
            Link quest tasks to show them at the end of this lesson
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {linkedTasks.map(task => {
            const pillarData = getPillarData(task.pillar || 'wellness')
            return (
              <div
                key={task.id}
                className="flex items-center justify-between p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg"
              >
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: pillarData.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-xs sm:text-sm truncate">
                      {task.title}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="text-xs font-medium"
                        style={{ color: pillarData.color }}
                      >
                        {pillarData.name}
                      </span>
                      <span className="text-xs text-gray-500">
                        {task.xp_value || task.xp_amount} XP
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnlinkTask(task.id)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                  aria-label="Unlink task"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Task Linker Modal */}
      <TaskLinker
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        availableTasks={availableTasks}
        linkedTaskIds={linkedTaskIds}
        onLinkTasks={handleLinkTasks}
        onUnlinkTask={handleUnlinkTask}
        lessonId={lessonId}
        questId={questId}
        lessonTitle={lessonTitle}
        lessonContent={lessonContent}
        onTasksCreated={(newTasks) => {
          // Refresh tasks after creation
          fetchTasks()
        }}
      />
    </div>
  )
}

export default LessonBlockEditor
