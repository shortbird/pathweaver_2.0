import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { arrayMove } from '@dnd-kit/sortable'
import api from '../services/api'
import courseService from '../services/courseService'

/**
 * Custom hook that manages all state and handlers for the Course Builder.
 * Extracted from CourseBuilder.jsx to improve maintainability.
 */
export function useCourseBuilderState({ courseId, isNewCourse, isSuperadmin }) {
  const navigate = useNavigate()

  // Core state
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
      await courseService.addQuestToCourse(courseId, quest.id, {})

      const updatedQuest = { ...quest, order_index: quests.length }
      setQuests([...quests, updatedQuest])

      // Fetch existing lessons for this quest
      try {
        const lessonsResponse = await api.get(`/api/quests/${quest.id}/curriculum/lessons?include_unpublished=true`)
        setLessonsMap(prev => ({ ...prev, [quest.id]: lessonsResponse.data.lessons || [] }))
      } catch (lessonError) {
        console.error(`Failed to load lessons for quest ${quest.id}:`, lessonError)
        setLessonsMap(prev => ({ ...prev, [quest.id]: [] }))
      }

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
    let deleteQuest = false

    if (isSuperadmin) {
      deleteQuest = window.confirm(
        'Remove this project from the course?\n\n' +
        'Click OK to also DELETE the project permanently (if not used elsewhere).\n' +
        'Click Cancel to just remove from this course (keeps the project).'
      )
      if (!deleteQuest) {
        const justRemove = window.confirm('Remove the project from this course without deleting it?')
        if (!justRemove) return
      }
    } else {
      const confirmRemove = window.confirm('Remove this project from the course?')
      if (!confirmRemove) return
    }

    try {
      setSaving(true)
      const response = await api.delete(`/api/courses/${courseId}/quests/${questId}?delete_quest=${deleteQuest}`)

      const updatedQuests = quests.filter(q => q.id !== questId)
      setQuests(updatedQuests)

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
  const handleDeleteItem = useCallback(async (item, type) => {
    if (type === 'project') {
      await handleRemoveQuest(item.id)
    } else if (type === 'lesson') {
      if (!confirm('Delete this lesson?')) return
      try {
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
        const lessonId = Object.keys(tasksMap).find(lid =>
          tasksMap[lid]?.some(t => t.id === item.id)
        )
        if (!lessonId) return

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
  }, [lessonsMap, tasksMap, selectedItem, selectedType])

  // Edit item - opens appropriate editor
  const handleEditItem = useCallback((item, type) => {
    if (type === 'lesson') {
      setEditingLesson(item)
      setShowLessonEditor(true)
    }
  }, [])

  // Add child to item
  const handleAddChild = useCallback((item, type) => {
    if (type === 'project') {
      setEditingLesson(null)
      const quest = quests.find(q => q.id === item.id)
      if (quest) {
        setSelectedItem(quest)
        setSelectedType('project')
        setShowLessonEditor(true)
      }
    } else if (type === 'lesson') {
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

    setLessonsMap(prev => ({
      ...prev,
      [projectId]: prev[projectId].map(l =>
        l.id === lessonId ? { ...l, content: updatedContent } : l
      )
    }))

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
        const { lessonId, stepIndex } = item
        if (!lessonId) return

        const projectId = Object.keys(lessonsMap).find(pid =>
          lessonsMap[pid]?.some(l => l.id === lessonId)
        )
        if (!projectId) return

        const lesson = lessonsMap[projectId]?.find(l => l.id === lessonId)
        if (!lesson) return

        const currentSteps = lesson.content?.steps || []
        const updatedSteps = currentSteps.map((s, idx) =>
          idx === stepIndex ? { ...s, ...formData, id: formData.id || s.id } : s
        )

        const updatedContent = { version: 2, steps: updatedSteps }
        await api.put(`/api/quests/${projectId}/curriculum/lessons/${lessonId}`, {
          content: updatedContent
        })

        setLessonsMap(prev => ({
          ...prev,
          [projectId]: prev[projectId].map(l =>
            l.id === lessonId ? { ...l, content: updatedContent } : l
          )
        }))

        setSelectedItem(prev => prev?.id === item.id ? { ...prev, ...formData } : prev)
      } else if (type === 'task') {
        await api.put(`/api/tasks/${item.id}`, formData)

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

    const projectId = Object.keys(lessonsMap).find(pid =>
      lessonsMap[pid]?.some(l => l.id === lesson.id)
    )
    if (!projectId) return

    const newStep = {
      id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'text',
      title: `Step ${(lesson.content?.steps?.length || 0) + 1}`,
      content: '',
      order: lesson.content?.steps?.length || 0
    }

    const currentSteps = lesson.content?.steps || []
    const updatedSteps = [...currentSteps, newStep]
    const updatedContent = { version: 2, steps: updatedSteps }

    try {
      await api.put(`/api/quests/${projectId}/curriculum/lessons/${lesson.id}`, {
        content: updatedContent
      })

      setLessonsMap(prev => ({
        ...prev,
        [projectId]: prev[projectId].map(l =>
          l.id === lesson.id ? { ...l, content: updatedContent } : l
        )
      }))

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

    const projectId = Object.keys(lessonsMap).find(pid =>
      lessonsMap[pid]?.some(l => l.id === lesson.id)
    )
    if (!projectId) return

    const actualLesson = lessonsMap[projectId]?.find(l => l.id === lesson.id)
    if (!actualLesson) return

    const currentSteps = actualLesson.content?.steps || []
    const updatedSteps = currentSteps.filter((_, idx) => idx !== stepIndex)
    const updatedContent = { version: 2, steps: updatedSteps }

    try {
      await api.put(`/api/quests/${projectId}/curriculum/lessons/${lesson.id}`, {
        content: updatedContent
      })

      setLessonsMap(prev => ({
        ...prev,
        [projectId]: prev[projectId].map(l =>
          l.id === lesson.id ? { ...l, content: updatedContent } : l
        )
      }))

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
    let projectId = null
    if (editingLesson) {
      projectId = Object.keys(lessonsMap).find(pid =>
        lessonsMap[pid]?.some(l => l.id === editingLesson.id)
      )
    }

    if (!projectId && selectedType === 'project' && selectedItem) {
      projectId = selectedItem.id
    }

    if (!projectId) return

    if (editingLesson) {
      setLessonsMap(prev => ({
        ...prev,
        [projectId]: prev[projectId].map(l =>
          l.id === savedLesson.id ? savedLesson : l
        )
      }))
    } else {
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
    const originalProjectId = Object.keys(lessonsMap).find(pid =>
      lessonsMap[pid]?.some(l => l.id === lessonId)
    )

    if (originalProjectId) {
      const movedLesson = lessonsMap[originalProjectId].find(l => l.id === lessonId)

      setLessonsMap(prev => ({
        ...prev,
        [originalProjectId]: prev[originalProjectId].filter(l => l.id !== lessonId)
      }))

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

  // Refresh lessons for quests (used by BulkTaskGenerationModal)
  const refreshLessonsForQuests = useCallback(async () => {
    await Promise.all(quests.map(async (quest) => {
      try {
        const resp = await api.get(`/api/quests/${quest.id}/curriculum/lessons?include_unpublished=true`)
        setLessonsMap(prev => ({
          ...prev,
          [quest.id]: resp.data.lessons || []
        }))
      } catch (error) {
        console.error('Failed to refresh lessons:', error)
      }
    }))
  }, [quests])

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

  return {
    // State
    loading,
    course,
    setCourse,
    quests,
    lessonsMap,
    tasksMap,
    saving,
    saveStatus,
    selectedItem,
    selectedType,
    expandedIds,
    outlineCollapsed,
    setOutlineCollapsed,

    // Modal states
    showAddQuestModal,
    setShowAddQuestModal,
    isPublishing,
    isCreating,
    showPreview,
    setShowPreview,
    showCourseDetails,
    setShowCourseDetails,
    editingLesson,
    setEditingLesson,
    showLessonEditor,
    setShowLessonEditor,
    previewingLesson,
    setPreviewingLesson,
    isDeleting,
    showBulkTaskModal,
    setShowBulkTaskModal,
    showRefineModal,
    setShowRefineModal,
    showAIToolsModal,
    setShowAIToolsModal,
    movingLesson,
    setMovingLesson,

    // Handlers
    handleSelectItem,
    handleToggleExpand,
    handleCreateCourse,
    handleUpdateCourse,
    handleAddQuest,
    handleRemoveQuest,
    handleDeleteItem,
    handleEditItem,
    handleAddChild,
    handleMoveItem,
    handleReorderProjects,
    handleReorderLessons,
    handleReorderSteps,
    handleSaveFromEditor,
    handleAddStep,
    handleDeleteStep,
    handleToggleTaskRequired,
    handlePublishToggle,
    handleDeleteCourse,
    handleLessonSaved,
    handleLessonMoved,
    handleAIToolSelect,
    handleRefineComplete,
    refreshLessonsForQuests,

    // Computed
    hasLessonsWithoutTasks,
    hasProjectsWithoutLessons,
    hasLessonsWithoutContent,
    selectedQuestForLesson,
  }
}

export default useCourseBuilderState
