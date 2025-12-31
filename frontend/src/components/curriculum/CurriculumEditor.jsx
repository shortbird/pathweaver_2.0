import React, { useState, useEffect } from 'react'
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
  CheckCircleIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import MarkdownEditor from './MarkdownEditor'
import IframeEmbed from './IframeEmbed'

const SortableLessonItem = ({ lesson, onSelect, onDelete, isSelected }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: lesson.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const getLessonTypeColor = (type) => {
    switch (type) {
      case 'text':
        return 'bg-blue-100 text-blue-700'
      case 'video':
        return 'bg-purple-100 text-purple-700'
      case 'interactive':
        return 'bg-green-100 text-green-700'
      case 'quiz':
        return 'bg-orange-100 text-orange-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-4 bg-white border rounded-lg cursor-pointer transition-colors ${
        isSelected ? 'border-optio-purple bg-purple-50' : 'border-gray-300 hover:border-optio-purple'
      }`}
      onClick={() => onSelect(lesson)}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <Bars3Icon className="w-5 h-5" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-gray-900 truncate">{lesson.title}</h4>
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${getLessonTypeColor(lesson.lesson_type)}`}>
            {lesson.lesson_type}
          </span>
          {lesson.is_required && (
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700">
              Required
            </span>
          )}
        </div>
        {lesson.estimated_duration_minutes && (
          <p className="text-sm text-gray-500 mt-1">
            {lesson.estimated_duration_minutes} min
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(lesson.id)
        }}
        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        aria-label="Delete lesson"
      >
        <TrashIcon className="w-5 h-5" />
      </button>
    </div>
  )
}

const CurriculumEditor = ({ questId, initialLessons = [], onSave }) => {
  const [lessons, setLessons] = useState(initialLessons)
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('saved') // 'saving', 'saved', 'error'
  const [settings, setSettings] = useState({
    enforceOrder: false,
    publicVisibility: true
  })

  // Auto-save debounce
  useEffect(() => {
    if (selectedLesson && selectedLesson.id) {
      const timer = setTimeout(() => {
        handleAutoSave()
      }, 2000) // Auto-save after 2 seconds of inactivity

      return () => clearTimeout(timer)
    }
  }, [selectedLesson])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event) => {
    const { active, over } = event

    if (active.id !== over.id) {
      setLessons((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id)
        const newIndex = items.findIndex(item => item.id === over.id)
        const reordered = arrayMove(items, oldIndex, newIndex)

        // Update order_index for all lessons
        const updated = reordered.map((lesson, index) => ({
          ...lesson,
          order_index: index
        }))

        // Trigger save after reordering
        saveLessonOrder(updated)

        return updated
      })
    }
  }

  const handleAddLesson = () => {
    const newLesson = {
      id: `new_${Date.now()}`,
      title: 'New Lesson',
      content: '',
      lesson_type: 'text',
      order_index: lessons.length,
      estimated_duration_minutes: null,
      is_required: false,
      embeds: []
    }

    setLessons([...lessons, newLesson])
    setSelectedLesson(newLesson)
  }

  const handleDeleteLesson = (lessonId) => {
    if (confirm('Are you sure you want to delete this lesson?')) {
      const updatedLessons = lessons
        .filter(l => l.id !== lessonId)
        .map((lesson, index) => ({
          ...lesson,
          order_index: index
        }))

      setLessons(updatedLessons)

      if (selectedLesson?.id === lessonId) {
        setSelectedLesson(null)
      }

      toast.success('Lesson deleted')
    }
  }

  const handleLessonChange = (field, value) => {
    if (!selectedLesson) return

    const updatedLesson = {
      ...selectedLesson,
      [field]: value
    }

    setSelectedLesson(updatedLesson)

    // Update in lessons array
    setLessons(lessons.map(l =>
      l.id === selectedLesson.id ? updatedLesson : l
    ))

    // Mark as unsaved
    setSaveStatus('unsaved')
  }

  const handleAutoSave = async () => {
    if (!selectedLesson || saveStatus === 'saving') return

    try {
      setSaveStatus('saving')
      setIsSaving(true)

      // Call onSave callback if provided
      if (onSave) {
        await onSave(selectedLesson)
      }

      setSaveStatus('saved')

      // Clear status after 2 seconds
      setTimeout(() => {
        setSaveStatus('saved')
      }, 2000)
    } catch (error) {
      console.error('Auto-save error:', error)
      setSaveStatus('error')
      toast.error('Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }

  const saveLessonOrder = async (reorderedLessons) => {
    try {
      setSaveStatus('saving')

      // In real implementation, call API to save order
      // await api.post(`/api/curriculum/${questId}/reorder`, {
      //   lesson_order: reorderedLessons.map(l => l.id)
      // })

      if (onSave) {
        await onSave({ type: 'reorder', lessons: reorderedLessons })
      }

      setSaveStatus('saved')
      toast.success('Lesson order saved')
    } catch (error) {
      console.error('Save order error:', error)
      setSaveStatus('error')
      toast.error('Failed to save lesson order')
    }
  }

  const SaveStatusIndicator = () => {
    if (saveStatus === 'saving') {
      return (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="w-4 h-4 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
          <span>Saving...</span>
        </div>
      )
    }

    if (saveStatus === 'saved') {
      return (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircleIcon className="w-5 h-5" />
          <span>All changes saved</span>
        </div>
      )
    }

    if (saveStatus === 'error') {
      return (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <ExclamationCircleIcon className="w-5 h-5" />
          <span>Save failed</span>
        </div>
      )
    }

    return null
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      {/* Left Panel: Lesson List */}
      <div className="lg:col-span-1 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h3 className="text-lg font-semibold text-gray-900">Lessons</h3>
          <button
            type="button"
            onClick={handleAddLesson}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity"
          >
            <PlusIcon className="w-4 h-4" />
            Add Lesson
          </button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={lessons.map(l => l.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {lessons.map((lesson) => (
                <SortableLessonItem
                  key={lesson.id}
                  lesson={lesson}
                  onSelect={setSelectedLesson}
                  onDelete={handleDeleteLesson}
                  isSelected={selectedLesson?.id === lesson.id}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {lessons.length === 0 && (
          <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
            <p className="text-sm text-gray-600">No lessons yet</p>
            <p className="text-xs text-gray-500 mt-1">Click "Add Lesson" to create one</p>
          </div>
        )}
      </div>

      {/* Right Panel: Lesson Editor */}
      <div className="lg:col-span-2 space-y-6">
        {selectedLesson ? (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Edit Lesson</h3>
              <SaveStatusIndicator />
            </div>

            <div className="space-y-6 bg-white border border-gray-300 rounded-lg p-6">
              {/* Title Input */}
              <div>
                <label htmlFor="lesson-title" className="block text-sm font-medium text-gray-700 mb-1">
                  Lesson Title
                </label>
                <input
                  id="lesson-title"
                  type="text"
                  value={selectedLesson.title}
                  onChange={(e) => handleLessonChange('title', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                  placeholder="Enter lesson title"
                />
              </div>

              {/* Content Type Selector */}
              <div>
                <label htmlFor="lesson-type" className="block text-sm font-medium text-gray-700 mb-1">
                  Content Type
                </label>
                <select
                  id="lesson-type"
                  value={selectedLesson.lesson_type}
                  onChange={(e) => handleLessonChange('lesson_type', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                >
                  <option value="text">Text</option>
                  <option value="video">Video</option>
                  <option value="interactive">Interactive</option>
                  <option value="quiz">Quiz</option>
                </select>
              </div>

              {/* Content Editor - Markdown or Video */}
              {selectedLesson.lesson_type === 'video' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Video Content
                  </label>
                  <IframeEmbed
                    embeds={selectedLesson.embeds || []}
                    onChange={(embeds) => handleLessonChange('embeds', embeds)}
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Lesson Content
                  </label>
                  <MarkdownEditor
                    value={selectedLesson.content}
                    onChange={(value) => handleLessonChange('content', value)}
                    placeholder="Enter your lesson content here..."
                  />
                </div>
              )}

              {/* Estimated Duration */}
              <div>
                <label htmlFor="estimated-duration" className="block text-sm font-medium text-gray-700 mb-1">
                  Estimated Duration (minutes)
                </label>
                <input
                  id="estimated-duration"
                  type="number"
                  min="0"
                  value={selectedLesson.estimated_duration_minutes || ''}
                  onChange={(e) => handleLessonChange('estimated_duration_minutes', parseInt(e.target.value) || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                  placeholder="e.g., 30"
                />
              </div>

              {/* Is Required Checkbox */}
              <div className="flex items-center gap-2">
                <input
                  id="is-required"
                  type="checkbox"
                  checked={selectedLesson.is_required || false}
                  onChange={(e) => handleLessonChange('is_required', e.target.checked)}
                  className="w-4 h-4 text-optio-purple border-gray-300 rounded focus:ring-optio-purple"
                />
                <label htmlFor="is-required" className="text-sm font-medium text-gray-700">
                  This lesson is required
                </label>
              </div>
            </div>

            {/* Settings Panel */}
            <div className="bg-white border border-gray-300 rounded-lg p-6">
              <h4 className="text-md font-semibold text-gray-900 mb-4">Curriculum Settings</h4>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    id="enforce-order"
                    type="checkbox"
                    checked={settings.enforceOrder}
                    onChange={(e) => setSettings({ ...settings, enforceOrder: e.target.checked })}
                    className="w-4 h-4 text-optio-purple border-gray-300 rounded focus:ring-optio-purple"
                  />
                  <label htmlFor="enforce-order" className="text-sm text-gray-700">
                    Enforce sequential lesson order
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="public-visibility"
                    type="checkbox"
                    checked={settings.publicVisibility}
                    onChange={(e) => setSettings({ ...settings, publicVisibility: e.target.checked })}
                    className="w-4 h-4 text-optio-purple border-gray-300 rounded focus:ring-optio-purple"
                  />
                  <label htmlFor="public-visibility" className="text-sm text-gray-700">
                    Public visibility (visible to all enrolled students)
                  </label>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full border-2 border-dashed border-gray-300 rounded-lg">
            <div className="text-center">
              <p className="text-gray-600">Select a lesson to edit</p>
              <p className="text-sm text-gray-500 mt-1">or create a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CurriculumEditor
