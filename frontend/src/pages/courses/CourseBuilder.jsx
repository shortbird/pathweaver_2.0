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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  PlusIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ChevronLeftIcon,
  RocketLaunchIcon,
  Bars4Icon,
  EyeIcon,
  Cog6ToothIcon,
  SparklesIcon,
  PencilIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import courseService from '../../services/courseService'
import CoursePreview from '../../components/CoursePreview'
import LessonPreviewModal from '../../components/curriculum/LessonPreviewModal'
import LessonTaskPanel from '../../components/curriculum/LessonTaskPanel'
import {
  SortableQuestItem,
  SortableLessonItem,
  AddQuestModal,
  LessonEditorModal,
  CourseDetailsModal,
  BulkTaskGenerationModal,
} from '../../components/course'

const CourseBuilder = () => {
  const { id: courseId } = useParams()
  const navigate = useNavigate()
  const isNewCourse = courseId === 'new' || !courseId

  // State
  const [loading, setLoading] = useState(!isNewCourse)
  const [course, setCourse] = useState(isNewCourse ? { title: '', description: '', status: 'draft' } : null)
  const [quests, setQuests] = useState([])
  const [selectedQuest, setSelectedQuest] = useState(null)
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [lessons, setLessons] = useState([])
  const [loadingLessons, setLoadingLessons] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('saved')
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [showAddQuestModal, setShowAddQuestModal] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showCourseDetails, setShowCourseDetails] = useState(false)
  const [editingLesson, setEditingLesson] = useState(null)
  const [showLessonEditor, setShowLessonEditor] = useState(false)
  const [previewingLesson, setPreviewingLesson] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showBulkTaskModal, setShowBulkTaskModal] = useState(false)
  const [editingProjectInfo, setEditingProjectInfo] = useState(false)
  const [projectEditData, setProjectEditData] = useState({ title: '', description: '' })

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Fetch course and quests
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const courseResponse = await courseService.getCourseById(courseId)
        setCourse(courseResponse.course)

        const questsResponse = await api.get(`/api/courses/${courseId}/quests`)
        const fetchedQuests = questsResponse.data.quests || []
        setQuests(fetchedQuests)

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

  // Fetch lessons when selectedQuest changes
  useEffect(() => {
    // Reset edit mode when switching projects
    setEditingProjectInfo(false)
    setProjectEditData({ title: '', description: '' })

    const fetchLessons = async () => {
      if (!selectedQuest?.id) {
        setLessons([])
        setSelectedLesson(null)
        return
      }

      try {
        setLoadingLessons(true)
        setSelectedLesson(null)
        const response = await api.get(`/api/quests/${selectedQuest.id}/curriculum/lessons?include_unpublished=true`)
        const fetchedLessons = response.data.lessons || []
        setLessons(fetchedLessons)
        if (fetchedLessons.length > 0) {
          setSelectedLesson(fetchedLessons[0])
        }
      } catch (error) {
        console.error('Failed to load lessons:', error)
        toast.error('Failed to load lessons')
        setLessons([])
      } finally {
        setLoadingLessons(false)
      }
    }

    fetchLessons()
  }, [selectedQuest?.id])

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
      toast.success('Project added to course')
    } catch (error) {
      console.error('Failed to add quest:', error)
      toast.error('Failed to add quest')
    } finally {
      setSaving(false)
    }
  }

  // Remove quest from course
  const handleRemoveQuest = async (questId) => {
    if (!confirm('Are you sure you want to remove this project from the course?')) return

    try {
      setSaving(true)
      await courseService.removeQuestFromCourse(courseId, questId)

      const updatedQuests = quests.filter(q => q.id !== questId)
      setQuests(updatedQuests)

      if (selectedQuest?.id === questId) {
        setSelectedQuest(updatedQuests[0] || null)
      }

      toast.success('Project removed from course')
    } catch (error) {
      console.error('Failed to remove quest:', error)
      toast.error('Failed to remove quest')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleQuestPublish = async (questId, isPublished) => {
    try {
      await api.put(`/api/courses/${courseId}/quests/${questId}`, {
        is_published: isPublished
      })

      setQuests(quests.map(q =>
        q.id === questId ? { ...q, is_published: isPublished } : q
      ))

      if (selectedQuest?.id === questId) {
        setSelectedQuest({ ...selectedQuest, is_published: isPublished })
      }

      toast.success(isPublished ? 'Project published' : 'Project unpublished')
    } catch (error) {
      console.error('Failed to toggle project publish status:', error)
      toast.error('Failed to update project')
    }
  }

  const handleStartEditProject = () => {
    if (!selectedQuest) return
    setProjectEditData({
      title: selectedQuest.title || '',
      description: selectedQuest.description || ''
    })
    setEditingProjectInfo(true)
  }

  const handleSaveProjectEdit = async () => {
    if (!selectedQuest || !projectEditData.title.trim()) {
      toast.error('Project title is required')
      return
    }

    try {
      setSaving(true)
      await api.put(`/api/admin/curriculum/generate/${courseId}/project/${selectedQuest.id}`, {
        title: projectEditData.title.trim(),
        description: projectEditData.description.trim()
      })

      // Update local state
      const updatedQuest = {
        ...selectedQuest,
        title: projectEditData.title.trim(),
        description: projectEditData.description.trim()
      }
      setSelectedQuest(updatedQuest)
      setQuests(quests.map(q =>
        q.id === selectedQuest.id ? updatedQuest : q
      ))

      setEditingProjectInfo(false)
      toast.success('Project updated')
    } catch (error) {
      console.error('Failed to update project:', error)
      toast.error('Failed to update project')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelProjectEdit = () => {
    setEditingProjectInfo(false)
    setProjectEditData({ title: '', description: '' })
  }

  const handlePublishAllQuests = async () => {
    const unpublishedQuests = quests.filter(q => !q.is_published)
    if (unpublishedQuests.length === 0) {
      toast.success('All projects are already published')
      return
    }

    if (!confirm(`Publish all ${unpublishedQuests.length} unpublished project(s)?`)) return

    try {
      setSaving(true)
      // Publish all unpublished quests
      await Promise.all(
        unpublishedQuests.map(q =>
          api.put(`/api/courses/${courseId}/quests/${q.id}`, { is_published: true })
        )
      )

      // Update local state
      setQuests(quests.map(q => ({ ...q, is_published: true })))
      if (selectedQuest && !selectedQuest.is_published) {
        setSelectedQuest({ ...selectedQuest, is_published: true })
      }

      toast.success(`Published ${unpublishedQuests.length} project(s)`)
    } catch (error) {
      console.error('Failed to publish all projects:', error)
      toast.error('Failed to publish all projects')
    } finally {
      setSaving(false)
    }
  }

  const handleXpThresholdChange = async (questId, xpThreshold) => {
    try {
      await api.put(`/api/courses/${courseId}/quests/${questId}`, {
        xp_threshold: xpThreshold
      })

      setQuests(quests.map(q =>
        q.id === questId ? { ...q, xp_threshold: xpThreshold } : q
      ))

      if (selectedQuest?.id === questId) {
        setSelectedQuest({ ...selectedQuest, xp_threshold: xpThreshold })
      }

      toast.success('XP requirement updated')
    } catch (error) {
      console.error('Failed to update XP requirement:', error)
      toast.error('Failed to update XP requirement')
    }
  }

  // Reorder quests via drag and drop
  const handleDragEnd = async (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = quests.findIndex(q => q.id === active.id)
    const newIndex = quests.findIndex(q => q.id === over.id)
    const reorderedQuests = arrayMove(quests, oldIndex, newIndex)

    const questsWithNewOrder = reorderedQuests.map((q, idx) => ({
      ...q,
      order_index: idx
    }))

    setQuests(questsWithNewOrder)

    if (selectedQuest) {
      const updatedSelected = questsWithNewOrder.find(q => q.id === selectedQuest.id)
      if (updatedSelected) {
        setSelectedQuest(updatedSelected)
      }
    }

    try {
      await courseService.reorderQuests(
        courseId,
        questsWithNewOrder.map(q => q.id)
      )
    } catch (error) {
      console.error('Failed to reorder quests:', error)
      toast.error('Failed to save project order')
      setQuests(quests)
    }
  }

  // Reorder lessons via drag and drop
  const handleLessonDragEnd = async (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = lessons.findIndex(l => l.id === active.id)
    const newIndex = lessons.findIndex(l => l.id === over.id)
    const reorderedLessons = arrayMove(lessons, oldIndex, newIndex)

    const lessonsWithNewOrder = reorderedLessons.map((l, idx) => ({
      ...l,
      sequence_order: idx + 1,
      order: idx + 1
    }))

    setLessons(lessonsWithNewOrder)

    try {
      await api.put(`/api/quests/${selectedQuest.id}/curriculum/lessons/reorder`, {
        lesson_order: lessonsWithNewOrder.map(l => l.id)
      })
    } catch (error) {
      console.error('Failed to reorder lessons:', error)
      toast.error('Failed to save lesson order')
      setLessons(lessons)
    }
  }

  // Handle lesson delete
  const handleDeleteLesson = async (lesson) => {
    if (!confirm('Delete this lesson?')) return
    try {
      await api.delete(`/api/quests/${selectedQuest.id}/curriculum/lessons/${lesson.id}`)
      setLessons(lessons.filter(l => l.id !== lesson.id))
      toast.success('Lesson deleted')
    } catch (error) {
      toast.error('Failed to delete lesson')
    }
  }

  // Publish or unpublish course
  const handlePublishToggle = async () => {
    const isCurrentlyPublished = course?.status === 'published'

    if (isCurrentlyPublished) {
      if (!confirm('Are you sure you want to unpublish this course? Students will no longer be able to access it.')) return

      try {
        setIsPublishing(true)
        await courseService.unpublishCourse(courseId)
        setCourse(prev => ({ ...prev, status: 'draft' }))
        toast.success('Course unpublished')
      } catch (error) {
        console.error('Failed to unpublish course:', error)
        toast.error('Failed to unpublish course')
      } finally {
        setIsPublishing(false)
      }
    } else {
      if (!confirm('Are you sure you want to publish this course? This will create a badge for course completion.')) return

      try {
        setIsPublishing(true)
        await courseService.publishCourse(courseId)
        setCourse(prev => ({ ...prev, status: 'published' }))
        toast.success('Course published! A completion badge has been created.')
      } catch (error) {
        console.error('Failed to publish course:', error)
        toast.error('Failed to publish course')
      } finally {
        setIsPublishing(false)
      }
    }
  }

  // Delete course
  const handleDeleteCourse = async () => {
    try {
      setIsDeleting(true)
      await courseService.deleteCourse(courseId)
      toast.success('Course deleted successfully')
      navigate('/courses')
    } catch (error) {
      console.error('Failed to delete course:', error)
      toast.error(error.response?.data?.error || 'Failed to delete course')
    } finally {
      setIsDeleting(false)
    }
  }

  // Refresh lessons after task updates
  const handleTasksUpdated = async () => {
    try {
      const response = await api.get(`/api/quests/${selectedQuest.id}/curriculum/lessons?include_unpublished=true`)
      const fetchedLessons = response.data.lessons || []
      setLessons(fetchedLessons)
      const updatedSelectedLesson = fetchedLessons.find(l => l.id === selectedLesson?.id)
      if (updatedSelectedLesson) {
        setSelectedLesson(updatedSelectedLesson)
      }
    } catch (error) {
      console.error('Failed to refresh lessons:', error)
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
                onClick={() => navigate('/courses')}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors min-h-[44px] min-w-[44px]"
                aria-label="Go back to courses"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px] text-base"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[100px] text-base"
                  placeholder="Describe what students will learn in this course"
                />
              </div>

              <div className="pt-4">
                <button
                  onClick={handleCreateCourse}
                  disabled={isCreating || !course?.title?.trim()}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-medium min-h-[44px]"
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
                After creating the course, you can add projects and publish it.
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
            <button
              onClick={() => navigate('/courses')}
              className="flex items-center gap-2 sm:gap-3 p-2 -m-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Go back to courses"
            >
              <ChevronLeftIcon className="w-5 h-5 flex-shrink-0" />
              <span className="text-base sm:text-xl font-bold text-gray-900">Course Builder</span>
            </button>

            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <div className="hidden sm:block">
                <SaveStatusIndicator />
              </div>

              <button
                onClick={() => setShowCourseDetails(true)}
                className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm min-h-[44px]"
                aria-label="Edit course details"
              >
                <Cog6ToothIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Details</span>
              </button>

              <button
                onClick={() => setShowBulkTaskModal(true)}
                disabled={quests.length === 0}
                className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Generate tasks for lessons"
                title="Generate AI tasks for all lessons without tasks"
              >
                <SparklesIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Generate Tasks</span>
              </button>

              <button
                onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
                className="lg:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors min-h-[44px] min-w-[44px]"
                aria-label="Toggle sidebar"
              >
                <Bars4Icon className="w-5 h-5" />
              </button>

              <button
                onClick={() => setShowPreview(true)}
                disabled={!course || quests.length === 0}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium min-h-[44px]"
                aria-label="Preview course"
              >
                <EyeIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Preview</span>
              </button>

              <button
                onClick={handlePublishToggle}
                disabled={isPublishing || !course || (course?.status !== 'published' && quests.length === 0)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium min-h-[44px] ${
                  course?.status === 'published'
                    ? 'bg-gray-600 text-white hover:bg-gray-700'
                    : 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
                }`}
              >
                <RocketLaunchIcon className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {isPublishing ? (course?.status === 'published' ? 'Unpublishing...' : 'Publishing...') : course?.status === 'published' ? 'Unpublish' : 'Publish'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
            {course?.title || 'Untitled Course'}
          </h2>
          <span className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full ${
            course?.status === 'published' ? 'bg-green-100 text-green-700' :
            course?.status === 'archived' ? 'bg-gray-100 text-gray-600' :
            'bg-yellow-100 text-yellow-700'
          }`}>
            {course?.status || 'draft'}
          </span>
        </div>

        <div className="flex gap-6">
          {/* Quest List Sidebar */}
          <div
            className={`
              lg:block lg:w-80 flex-shrink-0
              ${isMobileSidebarOpen ? 'fixed inset-0 z-40 bg-white p-4' : 'hidden'}
            `}
          >
            {isMobileSidebarOpen && (
              <div
                className="fixed inset-0 bg-black/50 -z-10 lg:hidden"
                onClick={() => setIsMobileSidebarOpen(false)}
              />
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-4 h-full">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                <h2 className="text-lg font-bold text-gray-900">Projects ({quests.length})</h2>
                <div className="flex items-center gap-1">
                  {quests.length > 0 && quests.some(q => !q.is_published) && (
                    <button
                      onClick={handlePublishAllQuests}
                      disabled={saving}
                      className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50"
                      title="Publish all unpublished projects"
                    >
                      <RocketLaunchIcon className="w-3.5 h-3.5" />
                      Publish All
                    </button>
                  )}
                  <button
                    onClick={() => setShowAddQuestModal(true)}
                    className="p-2 text-optio-purple hover:bg-optio-purple/10 rounded-lg transition-colors"
                    aria-label="Add project"
                  >
                    <PlusIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {quests.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-sm">No projects in this course yet.</p>
                  <button
                    onClick={() => setShowAddQuestModal(true)}
                    className="mt-3 text-sm text-optio-purple hover:underline"
                  >
                    Add your first project
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
                      {quests.map((quest, index) => (
                        <SortableQuestItem
                          key={quest.id}
                          quest={quest}
                          index={index}
                          isSelected={selectedQuest?.id === quest.id}
                          onSelect={setSelectedQuest}
                          onRemove={handleRemoveQuest}
                          onTogglePublish={handleToggleQuestPublish}
                          onXpThresholdChange={handleXpThresholdChange}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>

          {/* Content Editor */}
          <div className="flex-1 min-w-0 space-y-6">
            {selectedQuest && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  {editingProjectInfo ? (
                    <div className="flex-1 space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Project Title
                        </label>
                        <input
                          type="text"
                          value={projectEditData.title}
                          onChange={(e) => setProjectEditData(prev => ({ ...prev, title: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
                          placeholder="Enter project title"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Description
                        </label>
                        <textarea
                          value={projectEditData.description}
                          onChange={(e) => setProjectEditData(prev => ({ ...prev, description: e.target.value }))}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple resize-none"
                          placeholder="Enter project description"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveProjectEdit}
                          disabled={saving}
                          className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50"
                        >
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={handleCancelProjectEdit}
                          disabled={saving}
                          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-bold text-gray-900">{selectedQuest.title}</h2>
                        {selectedQuest.description && (
                          <p className="text-sm text-gray-600 mt-1">{selectedQuest.description}</p>
                        )}
                      </div>
                      <button
                        onClick={handleStartEditProject}
                        className="p-2 text-gray-400 hover:text-optio-purple transition-colors rounded-lg hover:bg-gray-100"
                        title="Edit project title and description"
                      >
                        <PencilIcon className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </div>

                {/* Lessons and Tasks Section */}
                <div className="border-t border-gray-200 pt-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Column 1: Lessons List */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-medium text-gray-700">
                          Lessons{!loadingLessons && ` (${lessons.length})`}
                        </h3>
                        <button
                          onClick={() => {
                            setEditingLesson(null)
                            setShowLessonEditor(true)
                          }}
                          className="flex items-center gap-1 text-sm text-optio-purple hover:text-optio-pink transition-colors"
                        >
                          <PlusIcon className="w-4 h-4" />
                          Add Lesson
                        </button>
                      </div>

                      {loadingLessons ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="w-6 h-6 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : lessons.length === 0 ? (
                        <div className="text-center py-8 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-500 mb-3">
                            No lessons yet. Add your first lesson to this project.
                          </p>
                          <button
                            onClick={() => {
                              setEditingLesson(null)
                              setShowLessonEditor(true)
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                          >
                            <PlusIcon className="w-4 h-4" />
                            Add Lesson
                          </button>
                        </div>
                      ) : (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleLessonDragEnd}
                        >
                          <SortableContext
                            items={lessons.sort((a, b) => (a.sequence_order || a.order || 0) - (b.sequence_order || b.order || 0)).map(l => l.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {lessons
                                .sort((a, b) => (a.sequence_order || a.order || 0) - (b.sequence_order || b.order || 0))
                                .map((lesson) => (
                                  <SortableLessonItem
                                    key={lesson.id}
                                    lesson={lesson}
                                    isSelected={selectedLesson?.id === lesson.id}
                                    onSelect={setSelectedLesson}
                                    onPreview={setPreviewingLesson}
                                    onEdit={(l) => {
                                      setEditingLesson(l)
                                      setShowLessonEditor(true)
                                    }}
                                    onDelete={handleDeleteLesson}
                                  />
                                ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}
                    </div>

                    {/* Column 2: Tasks for Selected Lesson */}
                    <div className="border-l border-gray-200 pl-4 min-h-[200px]">
                      <LessonTaskPanel
                        lesson={selectedLesson}
                        questId={selectedQuest?.id}
                        questTitle={selectedQuest?.title}
                        questDescription={selectedQuest?.description}
                        onTasksUpdated={handleTasksUpdated}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Empty state when no quests */}
            {quests.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <div className="max-w-sm mx-auto">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Add your first project</h3>
                  <p className="text-gray-500 text-sm mb-4">
                    Courses are made up of projects (quests). Add existing quests or create new ones to build your course.
                  </p>
                  <button
                    onClick={() => setShowAddQuestModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
                  >
                    <PlusIcon className="w-5 h-5" />
                    Add Project
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AddQuestModal
        isOpen={showAddQuestModal}
        onClose={() => setShowAddQuestModal(false)}
        onAddQuest={handleAddQuest}
        organizationId={course?.organization_id}
        existingQuestIds={quests.map(q => q.id)}
      />

      {showPreview && (
        <CoursePreview
          course={course}
          quests={quests}
          onClose={() => setShowPreview(false)}
        />
      )}

      <CourseDetailsModal
        isOpen={showCourseDetails}
        onClose={() => setShowCourseDetails(false)}
        course={course}
        courseId={courseId}
        onUpdate={handleUpdateCourse}
        onDelete={handleDeleteCourse}
        isSaving={saveStatus === 'saving'}
        isDeleting={isDeleting}
      />

      {previewingLesson && (
        <LessonPreviewModal
          lesson={previewingLesson}
          onClose={() => setPreviewingLesson(null)}
          onEdit={(lesson) => {
            setPreviewingLesson(null)
            setEditingLesson(lesson)
            setShowLessonEditor(true)
          }}
        />
      )}

      <LessonEditorModal
        isOpen={showLessonEditor}
        questId={selectedQuest?.id}
        lesson={editingLesson}
        onSave={(savedLesson) => {
          if (editingLesson) {
            setLessons(lessons.map(l => l.id === savedLesson.id ? savedLesson : l))
            if (selectedLesson?.id === savedLesson.id) {
              setSelectedLesson(savedLesson)
            }
          } else {
            setLessons([...lessons, savedLesson])
            setSelectedLesson(savedLesson)
            setEditingLesson(savedLesson)
          }
        }}
        onClose={() => {
          setShowLessonEditor(false)
          setEditingLesson(null)
        }}
      />

      <BulkTaskGenerationModal
        isOpen={showBulkTaskModal}
        onClose={() => setShowBulkTaskModal(false)}
        quests={quests}
        onTasksUpdated={handleTasksUpdated}
      />
    </div>
  )
}

export default CourseBuilder
