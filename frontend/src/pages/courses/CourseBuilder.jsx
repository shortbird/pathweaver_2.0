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
  CheckCircleIcon,
  ExclamationCircleIcon,
  ChevronLeftIcon,
  RocketLaunchIcon,
  Bars4Icon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import courseService from '../../services/courseService'

// Sortable quest item component
const SortableQuestItem = ({ quest, isSelected, onSelect, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: quest.id })

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
      onClick={() => onSelect(quest)}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1"
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
            {quest.order_index + 1}
          </span>
          <h4 className="font-medium text-gray-900 truncate text-sm">
            {quest.title || 'Untitled Quest'}
          </h4>
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(quest.id)
        }}
        className="opacity-0 group-hover:opacity-100 p-1.5 text-red-600 hover:bg-red-50 rounded transition-all"
        aria-label="Remove quest"
      >
        <TrashIcon className="w-4 h-4" />
      </button>
    </div>
  )
}

// Add quest modal component
const AddQuestModal = ({ isOpen, onClose, onAddQuest, organizationId }) => {
  const [loading, setLoading] = useState(false)
  const [quests, setQuests] = useState([])
  const [selectedQuestId, setSelectedQuestId] = useState(null)

  useEffect(() => {
    if (isOpen) {
      fetchQuests()
    }
  }, [isOpen])

  const fetchQuests = async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/quests', {
        params: { organization_id: organizationId }
      })
      setQuests(response.data.quests || [])
    } catch (error) {
      console.error('Failed to fetch quests:', error)
      toast.error('Failed to load quests')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    if (selectedQuestId) {
      const quest = quests.find(q => q.id === selectedQuestId)
      onAddQuest(quest)
      setSelectedQuestId(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Add Quest to Course</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
            </div>
          ) : (
            <div className="space-y-2">
              {quests.map(quest => (
                <button
                  key={quest.id}
                  onClick={() => setSelectedQuestId(quest.id)}
                  className={`w-full text-left p-4 rounded-lg border transition-all ${
                    selectedQuestId === quest.id
                      ? 'border-optio-purple bg-optio-purple/5'
                      : 'border-gray-200 hover:border-optio-purple/50'
                  }`}
                >
                  <h3 className="font-medium text-gray-900">{quest.title}</h3>
                  {quest.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{quest.description}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!selectedQuestId}
            className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Quest
          </button>
        </div>
      </div>
    </div>
  )
}

const CourseBuilder = () => {
  const { id: courseId } = useParams()
  const navigate = useNavigate()
  const isNewCourse = courseId === 'new' || !courseId

  // State
  const [loading, setLoading] = useState(!isNewCourse)
  const [course, setCourse] = useState(isNewCourse ? { title: '', description: '', status: 'draft' } : null)
  const [quests, setQuests] = useState([])
  const [selectedQuest, setSelectedQuest] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('saved') // 'saved', 'saving', 'error'
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [showAddQuestModal, setShowAddQuestModal] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Fetch course and quests (only for existing courses)
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

        // Fetch course info
        const courseResponse = await courseService.getCourseById(courseId)
        setCourse(courseResponse.course)

        // Fetch course quests
        const questsResponse = await api.get(`/api/courses/${courseId}/quests`)
        const fetchedQuests = questsResponse.data.quests || []
        setQuests(fetchedQuests)

        // Select first quest if available
        if (fetchedQuests.length > 0) {
          setSelectedQuest(fetchedQuests[0])
        }
      } catch (error) {
        console.error('Failed to load course:', error)
        toast.error('Failed to load course data')
      } finally {
        setLoading(false)
      }
    }

    if (courseId && !isNewCourse) {
      fetchData()
    }
  }, [courseId, isNewCourse])

  // Create new course
  const handleCreateCourse = async () => {
    if (!course.title?.trim()) {
      toast.error('Please enter a course title')
      return
    }

    try {
      setIsCreating(true)
      const response = await courseService.createCourse({
        title: course.title,
        description: course.description || ''
      })

      toast.success('Course created!')
      // Navigate to edit the new course
      navigate(`/courses/${response.course.id}/edit`, { replace: true })
    } catch (error) {
      console.error('Failed to create course:', error)
      toast.error('Failed to create course')
    } finally {
      setIsCreating(false)
    }
  }

  // Update course metadata
  const handleUpdateCourse = useCallback(async (updates) => {
    try {
      setSaveStatus('saving')
      await courseService.updateCourse(courseId, updates)

      // Update local state
      setCourse(prev => ({ ...prev, ...updates }))

      setSaveStatus('saved')
    } catch (error) {
      console.error('Failed to update course:', error)
      setSaveStatus('error')
      toast.error('Failed to save changes')
    }
  }, [courseId])

  // Add quest to course
  const handleAddQuest = async (quest) => {
    try {
      setSaving(true)
      await courseService.addQuestToCourse(courseId, quest.id, {
        sequence_order: quests.length
      })

      const updatedQuest = { ...quest, order_index: quests.length }
      setQuests([...quests, updatedQuest])
      setSelectedQuest(updatedQuest)
      setShowAddQuestModal(false)
      toast.success('Quest added to course')
    } catch (error) {
      console.error('Failed to add quest:', error)
      toast.error('Failed to add quest')
    } finally {
      setSaving(false)
    }
  }

  // Remove quest from course
  const handleRemoveQuest = async (questId) => {
    if (!confirm('Are you sure you want to remove this quest from the course?')) return

    try {
      setSaving(true)
      await courseService.removeQuestFromCourse(courseId, questId)

      const updatedQuests = quests.filter(q => q.id !== questId)
      setQuests(updatedQuests)

      if (selectedQuest?.id === questId) {
        setSelectedQuest(updatedQuests[0] || null)
      }

      toast.success('Quest removed from course')
    } catch (error) {
      console.error('Failed to remove quest:', error)
      toast.error('Failed to remove quest')
    } finally {
      setSaving(false)
    }
  }

  // Reorder quests via drag and drop
  const handleDragEnd = async (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = quests.findIndex(q => q.id === active.id)
    const newIndex = quests.findIndex(q => q.id === over.id)
    const reorderedQuests = arrayMove(quests, oldIndex, newIndex)

    // Update order_index for each quest
    const questsWithNewOrder = reorderedQuests.map((q, idx) => ({
      ...q,
      order_index: idx
    }))

    // Optimistic update
    setQuests(questsWithNewOrder)

    try {
      await courseService.reorderQuests(
        courseId,
        questsWithNewOrder.map(q => q.id)
      )
      toast.success('Quest order saved')
    } catch (error) {
      console.error('Failed to reorder quests:', error)
      toast.error('Failed to save quest order')
      // Revert on error
      setQuests(quests)
    }
  }

  // Publish course (creates badge)
  const handlePublish = async () => {
    if (!confirm('Are you sure you want to publish this course? This will create a badge for course completion.')) return

    try {
      setIsPublishing(true)
      await courseService.publishCourse(courseId)
      setCourse(prev => ({ ...prev, is_active: true }))
      toast.success('Course published! A completion badge has been created.')
    } catch (error) {
      console.error('Failed to publish course:', error)
      toast.error('Failed to publish course')
    } finally {
      setIsPublishing(false)
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

  // New course creation form
  if (isNewCourse) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Go back"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">Create New Course</h1>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Course Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={course?.title || ''}
                  onChange={(e) => setCourse(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                  placeholder="Enter course title"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={course?.description || ''}
                  onChange={(e) => setCourse(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                  placeholder="Describe what students will learn in this course"
                />
              </div>

              <div className="pt-4">
                <button
                  onClick={handleCreateCourse}
                  disabled={isCreating || !course?.title?.trim()}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {isCreating ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <PlusIcon className="w-5 h-5" />
                      Create Course
                    </>
                  )}
                </button>
              </div>

              <p className="text-sm text-gray-500 text-center">
                After creating the course, you can add quests and publish it.
              </p>
            </div>
          </div>
        </div>
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
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                aria-label="Go back"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">Course Builder</h1>
                <p className="text-xs sm:text-sm text-gray-600 truncate">{course?.title || 'Loading...'}</p>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* Save Status - Hidden on mobile */}
              <div className="hidden sm:block">
                <SaveStatusIndicator />
              </div>

              {/* Mobile Sidebar Toggle */}
              <button
                onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
                className="lg:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Toggle sidebar"
              >
                <Bars4Icon className="w-5 h-5" />
              </button>

              {/* Publish Button */}
              <button
                onClick={handlePublish}
                disabled={isPublishing || !course || quests.length === 0}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                <RocketLaunchIcon className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {isPublishing ? 'Publishing...' : course?.is_active ? 'Published' : 'Publish'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Quest List Sidebar */}
          <div
            className={`
              lg:block lg:w-80 flex-shrink-0
              ${isMobileSidebarOpen ? 'fixed inset-0 z-40 bg-white p-4' : 'hidden'}
            `}
          >
            {/* Mobile close overlay */}
            {isMobileSidebarOpen && (
              <div
                className="fixed inset-0 bg-black/50 -z-10 lg:hidden"
                onClick={() => setIsMobileSidebarOpen(false)}
              />
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-4 h-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Quests ({quests.length})</h2>
                <button
                  onClick={() => setShowAddQuestModal(true)}
                  className="p-2 text-optio-purple hover:bg-optio-purple/10 rounded-lg transition-colors"
                  aria-label="Add quest"
                >
                  <PlusIcon className="w-5 h-5" />
                </button>
              </div>

              {quests.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-sm">No quests in this course yet.</p>
                  <button
                    onClick={() => setShowAddQuestModal(true)}
                    className="mt-3 text-sm text-optio-purple hover:underline"
                  >
                    Add your first quest
                  </button>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={quests.map(q => q.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2 max-h-[calc(100vh-250px)] overflow-y-auto">
                      {quests.map(quest => (
                        <SortableQuestItem
                          key={quest.id}
                          quest={quest}
                          isSelected={selectedQuest?.id === quest.id}
                          onSelect={setSelectedQuest}
                          onRemove={handleRemoveQuest}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>

          {/* Content Editor */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              {selectedQuest ? (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Quest Details</h2>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Title
                      </label>
                      <div className="text-gray-900">{selectedQuest.title}</div>
                    </div>

                    {selectedQuest.description && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Description
                        </label>
                        <div className="text-gray-700 text-sm">{selectedQuest.description}</div>
                      </div>
                    )}

                    {selectedQuest.pillar_primary && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Primary Pillar
                        </label>
                        <div className="inline-block px-3 py-1 bg-optio-purple/10 text-optio-purple rounded-full text-sm font-medium">
                          {selectedQuest.pillar_primary}
                        </div>
                      </div>
                    )}

                    <div className="pt-4 border-t border-gray-200">
                      <p className="text-sm text-gray-500">
                        Quest details are read-only. To edit the quest itself, visit the quest editor.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Course Metadata</h3>

                  <div className="max-w-xl mx-auto space-y-4 mt-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 text-left">
                        Course Title
                      </label>
                      <input
                        type="text"
                        value={course?.title || ''}
                        onChange={(e) => handleUpdateCourse({ title: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                        placeholder="Enter course title"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 text-left">
                        Course Description
                      </label>
                      <textarea
                        value={course?.description || ''}
                        onChange={(e) => handleUpdateCourse({ description: e.target.value })}
                        rows={4}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                        placeholder="Enter course description"
                      />
                    </div>
                  </div>

                  <div className="mt-8 text-sm text-gray-500">
                    Select a quest from the sidebar to view its details
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Quest Modal */}
      <AddQuestModal
        isOpen={showAddQuestModal}
        onClose={() => setShowAddQuestModal(false)}
        onAddQuest={handleAddQuest}
        organizationId={course?.organization_id}
      />
    </div>
  )
}

export default CourseBuilder
