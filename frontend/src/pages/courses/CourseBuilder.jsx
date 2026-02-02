import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { arrayMove } from '@dnd-kit/sortable'
import {
  PlusIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ChevronLeftIcon,
  RocketLaunchIcon,
  EyeIcon,
  Cog6ToothIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import courseService from '../../services/courseService'
import { useAuth } from '../../contexts/AuthContext'
import StudentPreviewModal from '../../components/course/StudentPreviewModal'
import LessonPreviewModal from '../../components/curriculum/LessonPreviewModal'
import {
  AddQuestModal,
  LessonEditorModal,
  CourseDetailsModal,
  BulkTaskGenerationModal,
  MoveLessonModal,
  AIToolsModal,
  OutlineTree,
  OutlineEditor,
} from '../../components/course'
import { AIRefineModal } from '../../components/course/refine'
import useOutlineKeyboard from '../../hooks/useOutlineKeyboard'

const CourseBuilder = () => {
  const { id: courseId } = useParams()
  const navigate = useNavigate()
  const { isSuperadmin } = useAuth()
  const isNewCourse = courseId === 'new' || !courseId

  // State
  const [loading, setLoading] = useState(!isNewCourse)
  const [course, setCourse] = useState(isNewCourse ? { title: '', description: '', status: 'draft' } : null)
  const [quests, setQuests] = useState([])
  const [lessonsMap, setLessonsMap] = useState({}) // { projectId: lessons[] }
  const [tasksMap, setTasksMap] = useState({}) // { lessonId: tasks[] }
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('saved')

  // Selection state for outline view
  const [selectedItem, setSelectedItem] = useState(null)
  const [selectedType, setSelectedType] = useState(null) // 'project' | 'lesson' | 'task'
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [outlineCollapsed, setOutlineCollapsed] = useState(false)

  // Modal states
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
  const [showRefineModal, setShowRefineModal] = useState(false)
  const [showAIToolsModal, setShowAIToolsModal] = useState(false)
  const [movingLesson, setMovingLesson] = useState(null)

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

        // Start collapsed - only show projects
        setExpandedIds(new Set())

        // Select first project if available
        if (fetchedQuests.length > 0) {
          setSelectedItem(fetchedQuests[0])
          setSelectedType('project')
        }

        // Fetch lessons for all projects
        const lessonsData = {}
        await Promise.all(fetchedQuests.map(async (quest) => {
          try {
            const response = await api.get(`/api/quests/${quest.id}/curriculum/lessons?include_unpublished=true`)
            lessonsData[quest.id] = response.data.lessons || []
          } catch (error) {
            console.error(`Failed to load lessons for quest ${quest.id}:`, error)
            lessonsData[quest.id] = []
          }
        }))
        setLessonsMap(lessonsData)

        // Tasks will be fetched on demand when lessons are selected/expanded
        // Don't pre-populate with empty arrays as that prevents fetching
        setTasksMap({})
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

  // Fetch tasks for a lesson when expanded
  const fetchTasksForLesson = useCallback(async (lesson, questId) => {
    const taskIds = lesson?.linked_task_ids || []
    if (taskIds.length === 0) {
      setTasksMap(prev => ({ ...prev, [lesson.id]: [] }))
      return
    }

    try {
      const response = await api.get(`/api/quests/${questId}/tasks`)
      const allTasks = response.data.tasks || []
      const linkedTasks = allTasks.filter(t => taskIds.includes(t.id))
      setTasksMap(prev => ({ ...prev, [lesson.id]: linkedTasks }))
    } catch (error) {
      console.error('Failed to fetch tasks:', error)
    }
  }, [])

  // Selection handler
  const handleSelectItem = useCallback((item, type) => {
    setSelectedItem(item)
    setSelectedType(type)

    // If selecting a lesson, fetch its tasks if not already loaded
    if (type === 'lesson' && item) {
      // Find the project this lesson belongs to
      const projectId = Object.keys(lessonsMap).find(pid =>
        lessonsMap[pid]?.some(l => l.id === item.id)
      )
      if (projectId && tasksMap[item.id] === undefined) {
        fetchTasksForLesson(item, projectId)
      }
    }
  }, [lessonsMap, tasksMap, fetchTasksForLesson])

  // Toggle expand for outline tree
  const handleToggleExpand = useCallback((id) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })

    // Fetch tasks when expanding a lesson
    const lesson = Object.values(lessonsMap).flat().find(l => l.id === id)
    if (lesson && tasksMap[id] === undefined) {
      const projectId = Object.keys(lessonsMap).find(pid =>
        lessonsMap[pid]?.some(l => l.id === id)
      )
      if (projectId) {
        fetchTasksForLesson(lesson, projectId)
      }
    }
  }, [lessonsMap, tasksMap, fetchTasksForLesson])

  // Keyboard navigation
  useOutlineKeyboard({
    projects: quests,
    lessonsMap,
    tasksMap,
    expandedIds,
    selectedItem,
    selectedType,
    onSelectItem: handleSelectItem,
    onToggleExpand: handleToggleExpand,
    onEdit: (item, type) => {
      if (type === 'lesson') {
        setEditingLesson(item)
        setShowLessonEditor(true)
      }
    },
    onDelete: handleDeleteItem,
    enabled: !showLessonEditor && !showAddQuestModal && !showCourseDetails,
  })

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
      setLessonsMap(prev => ({ ...prev, [quest.id]: [] }))
      setExpandedIds(prev => new Set([...prev, quest.id]))
      setSelectedItem(updatedQuest)
      setSelectedType('project')
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
    const deleteQuest = window.confirm(
      'Remove this project from the course?\n\n' +
      'Click OK to also DELETE the project permanently (if not used elsewhere).\n' +
      'Click Cancel to just remove from this course (keeps the project).'
    )

    if (!deleteQuest) {
      const justRemove = window.confirm('Remove the project from this course without deleting it?')
      if (!justRemove) return
    }

    try {
      setSaving(true)
      const response = await api.delete(`/api/courses/${courseId}/quests/${questId}?delete_quest=${deleteQuest}`)

      const updatedQuests = quests.filter(q => q.id !== questId)
      setQuests(updatedQuests)

      // Update lessonsMap
      setLessonsMap(prev => {
        const newMap = { ...prev }
        delete newMap[questId]
        return newMap
      })

      if (selectedItem?.id === questId && selectedType === 'project') {
        setSelectedItem(updatedQuests[0] || null)
        setSelectedType(updatedQuests[0] ? 'project' : null)
      }

      if (deleteQuest) {
        if (response.data.quest_deleted) {
          toast.success('Project removed and deleted')
        } else {
          const reason = response.data.deletion_reason
          let message = 'Project removed from course but not deleted (still in use)'
          if (reason === 'used_in_other_courses') {
            message = 'Project removed from course but not deleted (used in other courses)'
          } else if (reason === 'has_enrollments') {
            message = 'Project removed from course but not deleted (has student enrollments)'
          }
          toast(message, { icon: '!', duration: 5000 })
        }
      } else {
        toast.success('Project removed from course')
      }
    } catch (error) {
      console.error('Failed to remove quest:', error)
      toast.error('Failed to remove quest')
    } finally {
      setSaving(false)
    }
  }

  // Delete item based on type
  async function handleDeleteItem(item, type) {
    if (type === 'project') {
      await handleRemoveQuest(item.id)
    } else if (type === 'lesson') {
      if (!confirm('Delete this lesson?')) return
      try {
        // Find the project this lesson belongs to
        const projectId = Object.keys(lessonsMap).find(pid =>
          lessonsMap[pid]?.some(l => l.id === item.id)
        )
        if (!projectId) return

        await api.delete(`/api/quests/${projectId}/curriculum/lessons/${item.id}`)
        setLessonsMap(prev => ({
          ...prev,
          [projectId]: prev[projectId].filter(l => l.id !== item.id)
        }))

        if (selectedItem?.id === item.id && selectedType === 'lesson') {
          setSelectedItem(null)
          setSelectedType(null)
        }

        toast.success('Lesson deleted')
      } catch (error) {
        toast.error('Failed to delete lesson')
      }
    } else if (type === 'task') {
      if (!confirm('Remove this task from the lesson?')) return
      try {
        // Find the lesson this task belongs to
        const lessonId = Object.keys(tasksMap).find(lid =>
          tasksMap[lid]?.some(t => t.id === item.id)
        )
        if (!lessonId) return

        // Find the project
        const projectId = Object.keys(lessonsMap).find(pid =>
          lessonsMap[pid]?.some(l => l.id === lessonId)
        )
        if (!projectId) return

        await api.delete(`/api/quests/${projectId}/curriculum/lessons/${lessonId}/link-task/${item.id}`)
        setTasksMap(prev => ({
          ...prev,
          [lessonId]: prev[lessonId].filter(t => t.id !== item.id)
        }))

        if (selectedItem?.id === item.id && selectedType === 'task') {
          setSelectedItem(null)
          setSelectedType(null)
        }

        toast.success('Task removed')
      } catch (error) {
        toast.error('Failed to remove task')
      }
    }
  }

  // Edit item - opens appropriate editor
  const handleEditItem = useCallback((item, type) => {
    if (type === 'lesson') {
      setEditingLesson(item)
      setShowLessonEditor(true)
    }
    // For project and task, the OutlineEditor handles inline editing
  }, [])

  // Add child to item
  const handleAddChild = useCallback((item, type) => {
    if (type === 'project') {
      // Add lesson to project
      setEditingLesson(null)
      // Find the quest for this project
      const quest = quests.find(q => q.id === item.id)
      if (quest) {
        setSelectedItem(quest)
        setSelectedType('project')
        setShowLessonEditor(true)
      }
    } else if (type === 'lesson') {
      // Add task to lesson - show task generation or manual creation
      // For now, open the lesson editor which has task management
      setEditingLesson(item)
      setShowLessonEditor(true)
    }
  }, [quests])

  // Move item
  const handleMoveItem = useCallback((item, type) => {
    if (type === 'lesson') {
      setMovingLesson(item)
    }
  }, [])

  // Reorder projects
  const handleReorderProjects = useCallback(async (activeId, overId) => {
    const oldIndex = quests.findIndex(q => q.id === activeId)
    const newIndex = quests.findIndex(q => q.id === overId)
    const reorderedQuests = arrayMove(quests, oldIndex, newIndex)

    const questsWithNewOrder = reorderedQuests.map((q, idx) => ({
      ...q,
      order_index: idx
    }))

    setQuests(questsWithNewOrder)

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
  }, [quests, courseId])

  // Reorder lessons within a project
  const handleReorderLessons = useCallback(async (projectId, activeId, overId) => {
    const lessons = lessonsMap[projectId] || []
    const oldIndex = lessons.findIndex(l => l.id === activeId)
    const newIndex = lessons.findIndex(l => l.id === overId)
    const reorderedLessons = arrayMove(lessons, oldIndex, newIndex)

    const lessonsWithNewOrder = reorderedLessons.map((l, idx) => ({
      ...l,
      sequence_order: idx + 1,
      order: idx + 1
    }))

    setLessonsMap(prev => ({
      ...prev,
      [projectId]: lessonsWithNewOrder
    }))

    try {
      await api.put(`/api/quests/${projectId}/curriculum/lessons/reorder`, {
        lesson_order: lessonsWithNewOrder.map(l => l.id)
      })
    } catch (error) {
      console.error('Failed to reorder lessons:', error)
      toast.error('Failed to save lesson order')
      setLessonsMap(prev => ({ ...prev, [projectId]: lessons }))
    }
  }, [lessonsMap])

  // Reorder steps within a lesson
  const handleReorderSteps = useCallback(async (lessonId, activeId, overId) => {
    // Find the project and lesson
    const projectId = Object.keys(lessonsMap).find(pid =>
      lessonsMap[pid]?.some(l => l.id === lessonId)
    )
    if (!projectId) return

    const lesson = lessonsMap[projectId]?.find(l => l.id === lessonId)
    if (!lesson) return

    const steps = lesson.content?.steps || []
    const oldIndex = steps.findIndex(s => s.id === activeId)
    const newIndex = steps.findIndex(s => s.id === overId)

    if (oldIndex === -1 || newIndex === -1) return

    const reorderedSteps = arrayMove(steps, oldIndex, newIndex)
    const updatedContent = { version: 2, steps: reorderedSteps }

    // Optimistic update
    setLessonsMap(prev => ({
      ...prev,
      [projectId]: prev[projectId].map(l =>
        l.id === lessonId ? { ...l, content: updatedContent } : l
      )
    }))

    // Update selection if the selected step moved
    if (selectedItem?.lessonId === lessonId && selectedItem?.stepIndex === oldIndex) {
      setSelectedItem(prev => ({ ...prev, stepIndex: newIndex }))
    }

    try {
      await api.put(`/api/quests/${projectId}/curriculum/lessons/${lessonId}`, {
        content: updatedContent
      })
    } catch (error) {
      console.error('Failed to reorder steps:', error)
      toast.error('Failed to save step order')
      // Revert on error
      setLessonsMap(prev => ({
        ...prev,
        [projectId]: prev[projectId].map(l =>
          l.id === lessonId ? { ...l, content: { version: 2, steps } } : l
        )
      }))
    }
  }, [lessonsMap, selectedItem])

  // Save from outline editor
  const handleSaveFromEditor = useCallback(async (item, type, formData) => {
    setSaving(true)
    try {
      if (type === 'project') {
        // Update project (title, description, header_image_url)
        await api.put(`/api/courses/${courseId}/projects/${item.id}`, {
          title: formData.title,
          description: formData.description,
          header_image_url: formData.header_image_url || null
        })

        if (formData.xp_threshold !== item.xp_threshold) {
          await api.put(`/api/courses/${courseId}/quests/${item.id}`, {
            xp_threshold: formData.xp_threshold
          })
        }

        setQuests(quests.map(q =>
          q.id === item.id ? { ...q, ...formData } : q
        ))
        setSelectedItem(prev => prev?.id === item.id ? { ...prev, ...formData } : prev)
      } else if (type === 'lesson') {
        // Find project for this lesson
        const projectId = Object.keys(lessonsMap).find(pid =>
          lessonsMap[pid]?.some(l => l.id === item.id)
        )
        if (!projectId) return

        await api.put(`/api/quests/${projectId}/curriculum/lessons/${item.id}`, {
          title: formData.title
        })

        setLessonsMap(prev => ({
          ...prev,
          [projectId]: prev[projectId].map(l =>
            l.id === item.id ? { ...l, ...formData } : l
          )
        }))
        setSelectedItem(prev => prev?.id === item.id ? { ...prev, ...formData } : prev)
      } else if (type === 'step') {
        // Save step within a lesson
        const { lessonId, stepIndex } = item
        if (!lessonId) return

        // Find project for this lesson
        const projectId = Object.keys(lessonsMap).find(pid =>
          lessonsMap[pid]?.some(l => l.id === lessonId)
        )
        if (!projectId) return

        // Get current lesson
        const lesson = lessonsMap[projectId]?.find(l => l.id === lessonId)
        if (!lesson) return

        // Update the step in the lesson content
        const currentSteps = lesson.content?.steps || []
        const updatedSteps = currentSteps.map((s, idx) =>
          idx === stepIndex ? { ...s, ...formData, id: formData.id || s.id } : s
        )

        // Save lesson with updated steps
        const updatedContent = { version: 2, steps: updatedSteps }
        await api.put(`/api/quests/${projectId}/curriculum/lessons/${lessonId}`, {
          content: updatedContent
        })

        // Update lessonsMap with new content
        setLessonsMap(prev => ({
          ...prev,
          [projectId]: prev[projectId].map(l =>
            l.id === lessonId ? { ...l, content: updatedContent } : l
          )
        }))

        // Update selectedItem with new data
        setSelectedItem(prev => prev?.id === item.id ? { ...prev, ...formData } : prev)
      } else if (type === 'task') {
        await api.put(`/api/tasks/${item.id}`, formData)

        // Update tasksMap
        const lessonId = Object.keys(tasksMap).find(lid =>
          tasksMap[lid]?.some(t => t.id === item.id)
        )
        if (lessonId) {
          setTasksMap(prev => ({
            ...prev,
            [lessonId]: prev[lessonId].map(t =>
              t.id === item.id ? { ...t, ...formData } : t
            )
          }))
        }
        setSelectedItem(prev => prev?.id === item.id ? { ...prev, ...formData } : prev)
      }
    } finally {
      setSaving(false)
    }
  }, [courseId, quests, lessonsMap, tasksMap])

  // Add a new step to a lesson
  const handleAddStep = useCallback(async (lesson) => {
    if (!lesson) return

    // Find project for this lesson
    const projectId = Object.keys(lessonsMap).find(pid =>
      lessonsMap[pid]?.some(l => l.id === lesson.id)
    )
    if (!projectId) return

    // Create new step
    const newStep = {
      id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'text',
      title: `Step ${(lesson.content?.steps?.length || 0) + 1}`,
      content: '',
      order: lesson.content?.steps?.length || 0
    }

    // Add step to lesson content
    const currentSteps = lesson.content?.steps || []
    const updatedSteps = [...currentSteps, newStep]
    const updatedContent = { version: 2, steps: updatedSteps }

    try {
      await api.put(`/api/quests/${projectId}/curriculum/lessons/${lesson.id}`, {
        content: updatedContent
      })

      // Update lessonsMap
      setLessonsMap(prev => ({
        ...prev,
        [projectId]: prev[projectId].map(l =>
          l.id === lesson.id ? { ...l, content: updatedContent } : l
        )
      }))

      // Select the new step
      setSelectedItem({ ...newStep, lessonId: lesson.id, stepIndex: updatedSteps.length - 1 })
      setSelectedType('step')

      toast.success('Step added')
    } catch (error) {
      console.error('Failed to add step:', error)
      toast.error('Failed to add step')
    }
  }, [lessonsMap])

  // Delete a step from a lesson
  const handleDeleteStep = useCallback(async (lesson, stepIndex) => {
    if (!lesson || stepIndex === undefined) return

    // Find project for this lesson
    const projectId = Object.keys(lessonsMap).find(pid =>
      lessonsMap[pid]?.some(l => l.id === lesson.id)
    )
    if (!projectId) return

    // Get the actual lesson from lessonsMap (in case only {id} was passed)
    const actualLesson = lessonsMap[projectId]?.find(l => l.id === lesson.id)
    if (!actualLesson) return

    // Remove step from lesson content
    const currentSteps = actualLesson.content?.steps || []
    const updatedSteps = currentSteps.filter((_, idx) => idx !== stepIndex)
    const updatedContent = { version: 2, steps: updatedSteps }

    try {
      await api.put(`/api/quests/${projectId}/curriculum/lessons/${lesson.id}`, {
        content: updatedContent
      })

      // Update lessonsMap
      setLessonsMap(prev => ({
        ...prev,
        [projectId]: prev[projectId].map(l =>
          l.id === lesson.id ? { ...l, content: updatedContent } : l
        )
      }))

      // Clear selection if deleted step was selected
      if (selectedItem?.lessonId === lesson.id && selectedItem?.stepIndex === stepIndex) {
        setSelectedItem(actualLesson)
        setSelectedType('lesson')
      }

      toast.success('Step deleted')
    } catch (error) {
      console.error('Failed to delete step:', error)
      toast.error('Failed to delete step')
    }
  }, [lessonsMap, selectedItem])

  // Toggle task required status
  const handleToggleTaskRequired = useCallback(async (task) => {
    if (!task) return

    const newIsRequired = task.is_required === false ? true : false

    try {
      await api.put(`/api/tasks/${task.id}`, { is_required: newIsRequired })

      // Update tasksMap
      const lessonId = Object.keys(tasksMap).find(lid =>
        tasksMap[lid]?.some(t => t.id === task.id)
      )
      if (lessonId) {
        setTasksMap(prev => ({
          ...prev,
          [lessonId]: prev[lessonId].map(t =>
            t.id === task.id ? { ...t, is_required: newIsRequired } : t
          )
        }))
      }

      toast.success(newIsRequired ? 'Task marked as required' : 'Task marked as optional')
    } catch (error) {
      console.error('Failed to update task:', error)
      toast.error('Failed to update task')
    }
  }, [tasksMap])

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
  const handleDeleteCourse = async ({ deleteQuests = false } = {}) => {
    try {
      setIsDeleting(true)
      const result = await courseService.deleteCourse(courseId, { deleteQuests })
      toast.success(result.message || 'Course deleted successfully')
      navigate('/courses')
    } catch (error) {
      console.error('Failed to delete course:', error)
      toast.error(error.response?.data?.error || 'Failed to delete course')
    } finally {
      setIsDeleting(false)
    }
  }

  // Handle lesson saved from editor
  const handleLessonSaved = (savedLesson) => {
    // Find the project
    let projectId = null
    if (editingLesson) {
      projectId = Object.keys(lessonsMap).find(pid =>
        lessonsMap[pid]?.some(l => l.id === editingLesson.id)
      )
    }

    // If no project found (new lesson), use selected project
    if (!projectId && selectedType === 'project' && selectedItem) {
      projectId = selectedItem.id
    }

    if (!projectId) return

    if (editingLesson) {
      // Update existing lesson
      setLessonsMap(prev => ({
        ...prev,
        [projectId]: prev[projectId].map(l =>
          l.id === savedLesson.id ? savedLesson : l
        )
      }))
    } else {
      // Add new lesson
      setLessonsMap(prev => ({
        ...prev,
        [projectId]: [...(prev[projectId] || []), savedLesson]
      }))
    }

    setSelectedItem(savedLesson)
    setSelectedType('lesson')
  }

  // Handle lesson moved to another project
  const handleLessonMoved = async (lessonId, targetQuestId) => {
    // Find original project
    const originalProjectId = Object.keys(lessonsMap).find(pid =>
      lessonsMap[pid]?.some(l => l.id === lessonId)
    )

    if (originalProjectId) {
      const movedLesson = lessonsMap[originalProjectId].find(l => l.id === lessonId)

      // Remove from original project
      setLessonsMap(prev => ({
        ...prev,
        [originalProjectId]: prev[originalProjectId].filter(l => l.id !== lessonId)
      }))

      // Add to target project (will be refetched to get correct order)
      if (movedLesson) {
        setLessonsMap(prev => ({
          ...prev,
          [targetQuestId]: [...(prev[targetQuestId] || []), movedLesson]
        }))
      }
    }

    if (selectedItem?.id === lessonId) {
      setSelectedItem(null)
      setSelectedType(null)
    }

    setMovingLesson(null)
  }

  // Handle AI tool selection
  const handleAIToolSelect = async (toolId) => {
    switch (toolId) {
      case 'generate-tasks':
        setShowBulkTaskModal(true)
        break
      case 'generate-lessons':
        await handleGenerateLessons()
        break
      case 'generate-content':
        await handleGenerateLessonContent()
        break
      case 'ai-refine':
        setShowRefineModal(true)
        break
      default:
        break
    }
  }

  // Generate lessons
  const handleGenerateLessons = async () => {
    const toastId = toast.loading('Generating lessons for projects...')
    try {
      const response = await api.post(`/api/admin/curriculum/generate/${courseId}/lessons`, {})
      if (response.data.success) {
        toast.success('Lessons generated successfully!', { id: toastId })
        // Refresh lessons for all quests
        const lessonsData = {}
        await Promise.all(quests.map(async (quest) => {
          try {
            const resp = await api.get(`/api/quests/${quest.id}/curriculum/lessons?include_unpublished=true`)
            lessonsData[quest.id] = resp.data.lessons || []
          } catch (error) {
            lessonsData[quest.id] = lessonsMap[quest.id] || []
          }
        }))
        setLessonsMap(lessonsData)
      } else {
        toast.error(response.data.error || 'Failed to generate lessons', { id: toastId })
      }
    } catch (error) {
      console.error('Failed to generate lessons:', error)
      const errorMsg = error.response?.data?.error
      const errorText = typeof errorMsg === 'string' ? errorMsg : errorMsg?.message || 'Failed to generate lessons'
      toast.error(errorText, { id: toastId })
    }
  }

  // Generate lesson content
  const handleGenerateLessonContent = async () => {
    const toastId = toast.loading('Generating lesson content...')
    try {
      const response = await api.post(`/api/admin/curriculum/generate/${courseId}/lesson-content`, {})
      if (response.data.success) {
        const count = response.data.generated_count || 0
        if (count === 0) {
          toast.success('All lessons already have content', { id: toastId })
        } else {
          toast.success(`Generated content for ${count} lesson${count > 1 ? 's' : ''}!`, { id: toastId })
        }
        // Refresh lessons
        const lessonsData = {}
        await Promise.all(quests.map(async (quest) => {
          try {
            const resp = await api.get(`/api/quests/${quest.id}/curriculum/lessons?include_unpublished=true`)
            lessonsData[quest.id] = resp.data.lessons || []
          } catch (error) {
            lessonsData[quest.id] = lessonsMap[quest.id] || []
          }
        }))
        setLessonsMap(lessonsData)
      } else {
        toast.error(response.data.error || 'Failed to generate content', { id: toastId })
      }
    } catch (error) {
      console.error('Failed to generate lesson content:', error)
      const errorMsg = error.response?.data?.error
      const errorText = typeof errorMsg === 'string' ? errorMsg : errorMsg?.message || 'Failed to generate content'
      toast.error(errorText, { id: toastId })
    }
  }

  // Handle refine complete
  const handleRefineComplete = async () => {
    try {
      const courseResponse = await courseService.getCourseById(courseId)
      setCourse(courseResponse.course)

      const questsResponse = await api.get(`/api/courses/${courseId}/quests`)
      const fetchedQuests = questsResponse.data.quests || []
      setQuests(fetchedQuests)

      const lessonsData = {}
      await Promise.all(fetchedQuests.map(async (quest) => {
        try {
          const resp = await api.get(`/api/quests/${quest.id}/curriculum/lessons?include_unpublished=true`)
          lessonsData[quest.id] = resp.data.lessons || []
        } catch (error) {
          lessonsData[quest.id] = []
        }
      }))
      setLessonsMap(lessonsData)

      toast.success('Course data refreshed')
    } catch (error) {
      console.error('Failed to refresh after refine:', error)
    }
  }

  // Calculate AI tools availability
  const hasLessonsWithoutTasks = quests.length > 0
  const hasProjectsWithoutLessons = quests.length > 0
  const allLessons = Object.values(lessonsMap).flat()
  const hasLessonsWithoutContent = allLessons.some(lesson => {
    const steps = lesson.content?.steps || []
    if (steps.length === 0) return true
    const hasRealContent = steps.some(step => {
      if (step.content && step.content.trim() && step.content !== '<p></p>') return true
      if (step.video_url) return true
      if (step.files && step.files.length > 0) return true
      return false
    })
    return !hasRealContent
  })

  // Find the quest for the currently selected lesson (for LessonEditorModal)
  // NOTE: This must be before any early returns to maintain hooks order
  const selectedQuestForLesson = useMemo(() => {
    if (editingLesson) {
      const projectId = Object.keys(lessonsMap).find(pid =>
        lessonsMap[pid]?.some(l => l.id === editingLesson.id)
      )
      return quests.find(q => q.id === projectId)
    }
    if (selectedType === 'project' && selectedItem) {
      return selectedItem
    }
    return quests[0]
  }, [editingLesson, lessonsMap, quests, selectedType, selectedItem])

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
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => navigate('/courses')}
                className="flex items-center gap-2 p-2 -m-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                aria-label="Go back to courses"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-gray-900 truncate">
                  {course?.title || 'Course Builder'}
                </h1>
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                    course?.status === 'published' ? 'bg-green-100 text-green-700' :
                    course?.status === 'archived' ? 'bg-gray-100 text-gray-600' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {course?.status || 'draft'}
                  </span>
                  <SaveStatusIndicator />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowCourseDetails(true)}
                className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm min-h-[40px]"
                aria-label="Edit course details"
              >
                <Cog6ToothIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Details</span>
              </button>

              <button
                onClick={() => setShowAIToolsModal(true)}
                disabled={quests.length === 0}
                className="flex items-center gap-2 px-3 py-2 text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 rounded-lg transition-opacity text-sm min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="AI Tools"
              >
                <SparklesIcon className="w-4 h-4" />
                <span className="hidden sm:inline font-medium">AI</span>
              </button>

              <button
                onClick={() => setShowPreview(true)}
                disabled={!course || quests.length === 0}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium min-h-[40px]"
                aria-label="Preview course"
              >
                <EyeIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Preview</span>
              </button>

              <button
                onClick={handlePublishToggle}
                disabled={isPublishing || !course || (course?.status !== 'published' && quests.length === 0)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium min-h-[40px] ${
                  course?.status === 'published'
                    ? 'bg-gray-600 text-white hover:bg-gray-700'
                    : 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
                }`}
              >
                <RocketLaunchIcon className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {isPublishing ? '...' : course?.status === 'published' ? 'Unpublish' : 'Publish'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Outline View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Outline Tree */}
        <OutlineTree
          course={course}
          projects={quests}
          lessonsMap={lessonsMap}
          tasksMap={tasksMap}
          selectedItem={selectedItem}
          selectedType={selectedType}
          onSelectItem={handleSelectItem}
          onAddProject={() => setShowAddQuestModal(true)}
          onAddLesson={handleAddChild}
          onAddTask={handleAddChild}
          onAddStep={handleAddStep}
          onEditItem={handleEditItem}
          onDeleteItem={handleDeleteItem}
          onMoveItem={handleMoveItem}
          onReorderProjects={handleReorderProjects}
          onReorderLessons={handleReorderLessons}
          onReorderSteps={handleReorderSteps}
          isCollapsed={outlineCollapsed}
          onToggleCollapse={() => setOutlineCollapsed(!outlineCollapsed)}
        />

        {/* Right Panel - Editor */}
        <OutlineEditor
          selectedItem={selectedItem}
          selectedType={selectedType}
          onSave={handleSaveFromEditor}
          onSelectItem={handleSelectItem}
          tasksMap={tasksMap}
          onAddStep={handleAddStep}
          onDeleteStep={handleDeleteStep}
          onToggleTaskRequired={handleToggleTaskRequired}
          saving={saving}
          questId={selectedItem?.lessonId ? Object.keys(lessonsMap).find(pid => lessonsMap[pid]?.some(l => l.id === selectedItem.lessonId)) : selectedItem?.id}
        />
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
        <StudentPreviewModal
          course={course}
          projects={quests}
          lessonsMap={lessonsMap}
          tasksMap={tasksMap}
          initialProjectId={selectedItem?.id && selectedType === 'project' ? selectedItem.id : null}
          initialLessonId={selectedItem?.id && selectedType === 'lesson' ? selectedItem.id : null}
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
        questCount={quests?.length || 0}
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
        questId={selectedQuestForLesson?.id}
        lesson={editingLesson}
        onSave={handleLessonSaved}
        onClose={() => {
          setShowLessonEditor(false)
          setEditingLesson(null)
        }}
      />

      <AIToolsModal
        isOpen={showAIToolsModal}
        onClose={() => setShowAIToolsModal(false)}
        onSelectTool={handleAIToolSelect}
        hasLessonsWithoutTasks={hasLessonsWithoutTasks}
        hasProjectsWithoutLessons={hasProjectsWithoutLessons}
        hasLessonsWithoutContent={hasLessonsWithoutContent}
      />

      <BulkTaskGenerationModal
        isOpen={showBulkTaskModal}
        onClose={() => setShowBulkTaskModal(false)}
        quests={quests}
        onTasksUpdated={() => {
          // Refresh lessons to get updated task counts
          quests.forEach(async (quest) => {
            try {
              const resp = await api.get(`/api/quests/${quest.id}/curriculum/lessons?include_unpublished=true`)
              setLessonsMap(prev => ({
                ...prev,
                [quest.id]: resp.data.lessons || []
              }))
            } catch (error) {
              console.error('Failed to refresh lessons:', error)
            }
          })
        }}
      />

      <AIRefineModal
        isOpen={showRefineModal}
        onClose={() => setShowRefineModal(false)}
        courseId={courseId}
        courseName={course?.title || 'Course'}
        onRefineComplete={handleRefineComplete}
      />

      {movingLesson && (
        <MoveLessonModal
          isOpen={!!movingLesson}
          onClose={() => setMovingLesson(null)}
          lesson={movingLesson}
          currentQuestId={Object.keys(lessonsMap).find(pid =>
            lessonsMap[pid]?.some(l => l.id === movingLesson.id)
          )}
          quests={quests}
          courseId={courseId}
          onMove={handleLessonMoved}
        />
      )}
    </div>
  )
}

export default CourseBuilder
