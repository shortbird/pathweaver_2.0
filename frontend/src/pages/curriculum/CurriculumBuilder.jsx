import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
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
  EyeIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ChevronLeftIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import LessonBlockEditor from '../../components/curriculum/LessonBlockEditor'

// Sortable lesson item component
const SortableLessonItem = ({ lesson, isSelected, onSelect, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-all ${
        isSelected
          ? 'bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 border-2 border-optio-purple'
          : 'bg-white border border-gray-200 hover:border-optio-purple/50'
      }`}
      onClick={() => onSelect(lesson)}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
      >
        <Bars3Icon className="w-4 h-4" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">
            {lesson.sequence_order}
          </span>
          <h4 className="font-medium text-gray-900 truncate text-sm">
            {lesson.title || 'Untitled Lesson'}
          </h4>
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(lesson.id)
        }}
        className="sm:opacity-0 sm:group-hover:opacity-100 p-1.5 text-red-600 hover:bg-red-50 rounded transition-all min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
        aria-label="Delete lesson"
      >
        <TrashIcon className="w-4 h-4" />
      </button>
    </div>
  )
}

const CurriculumBuilder = () => {
  const { questId } = useParams()
  const navigate = useNavigate()

  // State
  const [loading, setLoading] = useState(true)
  const [quest, setQuest] = useState(null)
  const [lessons, setLessons] = useState([])
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('saved') // 'saved', 'saving', 'error'
  const [showPreview, setShowPreview] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Fetch quest and lessons
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

        // Fetch quest info
        const questResponse = await api.get(`/api/quests/${questId}`)
        setQuest(questResponse.data.quest || questResponse.data)

        // Fetch lessons
        const lessonsResponse = await api.get(
          `/api/quests/${questId}/curriculum/lessons?include_unpublished=true`
        )
        const fetchedLessons = lessonsResponse.data.lessons || []
        setLessons(fetchedLessons)

        // Select first lesson if available
        if (fetchedLessons.length > 0) {
          setSelectedLesson(fetchedLessons[0])
        }
      } catch (error) {
        console.error('Failed to load curriculum:', error)
        toast.error('Failed to load curriculum data')
      } finally {
        setLoading(false)
      }
    }

    if (questId) {
      fetchData()
    }
  }, [questId])

  // Create a new lesson
  const handleCreateLesson = async () => {
    try {
      setSaving(true)
      const response = await api.post(`/api/quests/${questId}/curriculum/lessons`, {
        title: `Lesson ${lessons.length + 1}`,
        description: '',
        content: { blocks: [] },
      })

      const newLesson = response.data.lesson
      setLessons([...lessons, newLesson])
      setSelectedLesson(newLesson)
      toast.success('Lesson created')
    } catch (error) {
      console.error('Failed to create lesson:', error)
      toast.error('Failed to create lesson')
    } finally {
      setSaving(false)
    }
  }

  // Update a lesson
  const handleUpdateLesson = useCallback(async (lessonId, updates) => {
    try {
      setSaveStatus('saving')
      await api.put(`/api/quests/${questId}/curriculum/lessons/${lessonId}`, updates)

      // Update local state
      setLessons(prev =>
        prev.map(l => (l.id === lessonId ? { ...l, ...updates } : l))
      )
      if (selectedLesson?.id === lessonId) {
        setSelectedLesson(prev => ({ ...prev, ...updates }))
      }

      setSaveStatus('saved')
    } catch (error) {
      console.error('Failed to update lesson:', error)
      setSaveStatus('error')
      toast.error('Failed to save changes')
    }
  }, [questId, selectedLesson])

  // Delete a lesson
  const handleDeleteLesson = async (lessonId) => {
    if (!confirm('Are you sure you want to delete this lesson?')) return

    try {
      setSaving(true)
      await api.delete(`/api/quests/${questId}/curriculum/lessons/${lessonId}`)

      const updatedLessons = lessons.filter(l => l.id !== lessonId)
      setLessons(updatedLessons)

      if (selectedLesson?.id === lessonId) {
        setSelectedLesson(updatedLessons[0] || null)
      }

      toast.success('Lesson deleted')
    } catch (error) {
      console.error('Failed to delete lesson:', error)
      toast.error('Failed to delete lesson')
    } finally {
      setSaving(false)
    }
  }

  // Reorder lessons via drag and drop
  const handleDragEnd = async (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = lessons.findIndex(l => l.id === active.id)
    const newIndex = lessons.findIndex(l => l.id === over.id)
    const reorderedLessons = arrayMove(lessons, oldIndex, newIndex)

    // Optimistic update
    setLessons(reorderedLessons)

    try {
      await api.put(`/api/quests/${questId}/curriculum/lessons/reorder`, {
        lesson_order: reorderedLessons.map(l => l.id),
      })
      toast.success('Lesson order saved')
    } catch (error) {
      console.error('Failed to reorder lessons:', error)
      toast.error('Failed to save lesson order')
      // Revert on error
      setLessons(lessons)
    }
  }

  // Save status indicator
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
          <CheckCircleIcon className="w-4 h-4" />
          <span>Saved</span>
        </div>
      )
    }
    if (saveStatus === 'error') {
      return (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <ExclamationCircleIcon className="w-4 h-4" />
          <span>Save failed</span>
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            {/* Left: Back + Title */}
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              <button
                onClick={() => navigate(-1)}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
                aria-label="Go back"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">Curriculum Builder</h1>
                <p className="text-xs sm:text-sm text-gray-600 truncate">{quest?.title || 'Loading...'}</p>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* Save Status - Hidden on mobile, shown in sidebar */}
              <div className="hidden sm:block">
                <SaveStatusIndicator />
              </div>

              {/* Published Toggle - Compact on mobile */}
              {selectedLesson && (
                <button
                  onClick={async () => {
                    const newValue = !selectedLesson.is_published
                    try {
                      await handleUpdateLesson(selectedLesson.id, { is_published: newValue })
                      setSelectedLesson(prev => ({ ...prev, is_published: newValue }))
                      toast.success(newValue ? 'Lesson published' : 'Lesson unpublished')
                    } catch (error) {
                      toast.error('Failed to update publish status')
                    }
                  }}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg border transition-colors min-h-[44px] touch-manipulation ${
                    selectedLesson.is_published
                      ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                      : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                  }`}
                  title={selectedLesson.is_published ? 'Click to unpublish' : 'Click to publish'}
                >
                  {selectedLesson.is_published ? (
                    <>
                      <GlobeAltIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">Published</span>
                    </>
                  ) : (
                    <>
                      <EyeSlashIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">Draft</span>
                    </>
                  )}
                </button>
              )}

              {/* Preview Toggle */}
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 min-h-[44px] touch-manipulation"
              >
                <EyeIcon className="w-4 h-4" />
                <span className="hidden sm:inline">{showPreview ? 'Edit Mode' : 'Preview'}</span>
              </button>

              {/* Mobile Lesson Sidebar Toggle */}
              <button
                onClick={() => setIsMobileSidebarOpen(true)}
                className="lg:hidden flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-optio-purple bg-optio-purple/10 border border-optio-purple/30 rounded-lg hover:bg-optio-purple/20 min-h-[44px] touch-manipulation"
              >
                <Bars3Icon className="w-4 h-4" />
                <span className="hidden xs:inline">Lessons</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sidebar Drawer Overlay */}
      {isMobileSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <div
        className={`lg:hidden fixed inset-y-0 left-0 z-40 w-80 max-w-[85vw] bg-white shadow-xl transform transition-transform duration-300 ease-in-out ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Mobile Sidebar Header */}
        <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-optio-purple/5 to-optio-pink/5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Lessons</h2>
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
              aria-label="Close sidebar"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Save Status on Mobile */}
          <div className="mb-3 sm:hidden">
            <SaveStatusIndicator />
          </div>

          <button
            onClick={() => {
              handleCreateLesson()
              setIsMobileSidebarOpen(false)
            }}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity min-h-[44px] touch-manipulation"
          >
            <PlusIcon className="w-4 h-4" />
            Add Lesson
          </button>
        </div>

        {/* Mobile Lesson List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ maxHeight: 'calc(100vh - 140px)' }}>
          {lessons.length === 0 ? (
            <div className="text-center py-12">
              <DocumentTextIcon className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-600">No lessons yet</p>
              <p className="text-xs text-gray-500 mt-1">
                Create your first lesson above
              </p>
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
                {lessons.map(lesson => (
                  <SortableLessonItem
                    key={lesson.id}
                    lesson={lesson}
                    isSelected={selectedLesson?.id === lesson.id}
                    onSelect={(l) => {
                      setSelectedLesson(l)
                      setIsMobileSidebarOpen(false)
                    }}
                    onDelete={handleDeleteLesson}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="flex gap-4 lg:gap-6 h-[calc(100vh-120px)] sm:h-[calc(100vh-140px)]">
          {/* Left Sidebar: Lesson List - Hidden on mobile, shown on lg+ */}
          <div className="hidden lg:flex w-72 xl:w-80 flex-shrink-0 bg-white rounded-xl shadow-sm border border-gray-200 flex-col">
            {/* Sidebar Header */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold text-gray-900">Lessons</h2>
                <span className="text-sm text-gray-500">{lessons.length} total</span>
              </div>
              <button
                onClick={handleCreateLesson}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity min-h-[44px] touch-manipulation"
              >
                <PlusIcon className="w-4 h-4" />
                Add Lesson
              </button>
            </div>

            {/* Lesson List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {lessons.length === 0 ? (
                <div className="text-center py-12">
                  <DocumentTextIcon className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-sm text-gray-600">No lessons yet</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Click "Add Lesson" to create your first lesson
                  </p>
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
                    {lessons.map(lesson => (
                      <SortableLessonItem
                        key={lesson.id}
                        lesson={lesson}
                        isSelected={selectedLesson?.id === lesson.id}
                        onSelect={setSelectedLesson}
                        onDelete={handleDeleteLesson}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>

          {/* Right Panel: Lesson Editor - Full width on mobile */}
          <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {selectedLesson ? (
              <LessonBlockEditor
                lesson={selectedLesson}
                questId={questId}
                onUpdate={handleUpdateLesson}
                showPreview={showPreview}
              />
            ) : (
              <div className="flex items-center justify-center h-full p-6">
                <div className="text-center">
                  <DocumentTextIcon className="w-12 sm:w-16 h-12 sm:h-16 mx-auto text-gray-300 mb-4" />
                  <p className="text-base sm:text-lg font-medium text-gray-600">
                    {lessons.length === 0 ? 'Create your first lesson' : 'Select a lesson to edit'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {lessons.length === 0
                      ? 'Tap "Lessons" above to get started'
                      : 'Tap "Lessons" to see all lessons'
                    }
                  </p>
                  <button
                    onClick={() => setIsMobileSidebarOpen(true)}
                    className="lg:hidden mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 min-h-[44px] touch-manipulation"
                  >
                    <Bars3Icon className="w-4 h-4" />
                    View Lessons
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default CurriculumBuilder
