import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { arrayMove } from '@dnd-kit/sortable'
import api from '../services/api'
import courseService from '../services/courseService'

// Composed hooks
import { useModalState } from './courseBuilder/useModalState'
import { useSelectionState } from './courseBuilder/useSelectionState'
import { useAITools } from './courseBuilder/useAITools'

/**
 * Custom hook that manages all state and handlers for the Course Builder.
 * Composes smaller hooks for maintainability while providing a unified API.
 *
 * Architecture:
 * - useModalState: Modal visibility (15+ modal states)
 * - useSelectionState: Selection/navigation in outline
 * - useAITools: AI generation functionality
 * - This hook: Core data state, CRUD operations, composition
 */
export function useCourseBuilderState({ courseId, isNewCourse, isSuperadmin }) {
  const navigate = useNavigate()

  // Compose modal state
  const modalState = useModalState()

  // Compose selection state
  const selectionState = useSelectionState()

  // Core data state
  const [loading, setLoading] = useState(!isNewCourse)
  const [course, setCourse] = useState(isNewCourse ? { title: '', description: '', status: 'draft' } : null)
  const [quests, setQuests] = useState([])
  const [lessonsMap, setLessonsMap] = useState({})
  const [tasksMap, setTasksMap] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('saved')

  // Compose AI tools with dependencies
  const aiTools = useAITools({
    courseId,
    quests,
    lessonsMap,
    setLessonsMap,
    setCourse,
    setQuests,
    setShowBulkTaskModal: modalState.setShowBulkTaskModal,
    setShowRefineModal: modalState.setShowRefineModal,
  })

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

        selectionState.collapseAll()

        if (fetchedQuests.length > 0) {
          selectionState.setSelectedItem(fetchedQuests[0])
          selectionState.setSelectedType('project')
        }

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

  // Fetch tasks for a lesson
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

  // Selection handler that triggers task fetch
  const handleSelectItem = useCallback((item, type) => {
    selectionState.setSelectedItem(item)
    selectionState.setSelectedType(type)

    if (type === 'lesson' && item) {
      const projectId = Object.keys(lessonsMap).find(pid =>
        lessonsMap[pid]?.some(l => l.id === item.id)
      )
      if (projectId && tasksMap[item.id] === undefined) {
        fetchTasksForLesson(item, projectId)
      }
    }
  }, [lessonsMap, tasksMap, fetchTasksForLesson, selectionState])

  // Toggle expand with task fetch
  const handleToggleExpand = useCallback((id) => {
    selectionState.handleToggleExpand(id, () => {
      const lesson = Object.values(lessonsMap).flat().find(l => l.id === id)
      if (lesson && tasksMap[id] === undefined) {
        const projectId = Object.keys(lessonsMap).find(pid =>
          lessonsMap[pid]?.some(l => l.id === id)
        )
        if (projectId) {
          fetchTasksForLesson(lesson, projectId)
        }
      }
    })
  }, [lessonsMap, tasksMap, fetchTasksForLesson, selectionState])

  // Create new course
  const handleCreateCourse = async () => {
    if (!course.title?.trim()) {
      toast.error('Please enter a course title')
      return
    }

    try {
      modalState.setIsCreating(true)
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
      modalState.setIsCreating(false)
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

      try {
        const lessonsResponse = await api.get(`/api/quests/${quest.id}/curriculum/lessons?include_unpublished=true`)
        setLessonsMap(prev => ({ ...prev, [quest.id]: lessonsResponse.data.lessons || [] }))
      } catch (lessonError) {
        console.error(`Failed to load lessons for quest ${quest.id}:`, lessonError)
        setLessonsMap(prev => ({ ...prev, [quest.id]: [] }))
      }

      selectionState.expandItem(quest.id)
      selectionState.setSelectedItem(updatedQuest)
      selectionState.setSelectedType('project')
      modalState.setShowAddQuestModal(false)
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

      if (selectionState.selectedItem?.id === questId && selectionState.selectedType === 'project') {
        selectionState.setSelectedItem(updatedQuests[0] || null)
        selectionState.setSelectedType(updatedQuests[0] ? 'project' : null)
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

        if (selectionState.selectedItem?.id === item.id && selectionState.selectedType === 'lesson') {
          selectionState.clearSelection()
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

        if (selectionState.selectedItem?.id === item.id && selectionState.selectedType === 'task') {
          selectionState.clearSelection()
        }

        toast.success('Task removed')
      } catch (error) {
        toast.error('Failed to remove task')
      }
    }
  }, [lessonsMap, tasksMap, selectionState])

  // Edit item - opens appropriate editor
  const handleEditItem = useCallback((item, type) => {
    if (type === 'lesson') {
      modalState.openLessonEditor(item)
    }
  }, [modalState])

  // Add child to item
  const handleAddChild = useCallback((item, type) => {
    if (type === 'project') {
      const quest = quests.find(q => q.id === item.id)
      if (quest) {
        selectionState.setSelectedItem(quest)
        selectionState.setSelectedType('project')
        modalState.openLessonEditor(null)
      }
    } else if (type === 'lesson') {
      modalState.openLessonEditor(item)
    }
  }, [quests, selectionState, modalState])

  // Move item
  const handleMoveItem = useCallback((item, type) => {
    if (type === 'lesson') {
      modalState.setMovingLesson(item)
    }
  }, [modalState])

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

    if (selectionState.selectedItem?.lessonId === lessonId && selectionState.selectedItem?.stepIndex === oldIndex) {
      selectionState.setSelectedItem(prev => ({ ...prev, stepIndex: newIndex }))
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
  }, [lessonsMap, selectionState])

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
        selectionState.setSelectedItem(prev => prev?.id === item.id ? { ...prev, ...formData } : prev)
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
        selectionState.setSelectedItem(prev => prev?.id === item.id ? { ...prev, ...formData } : prev)
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

        selectionState.setSelectedItem(prev => prev?.id === item.id ? { ...prev, ...formData } : prev)
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
        selectionState.setSelectedItem(prev => prev?.id === item.id ? { ...prev, ...formData } : prev)
      }
    } finally {
      setSaving(false)
    }
  }, [courseId, quests, lessonsMap, tasksMap, selectionState])

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

      selectionState.setSelectedItem({ ...newStep, lessonId: lesson.id, stepIndex: updatedSteps.length - 1 })
      selectionState.setSelectedType('step')

      toast.success('Step added')
    } catch (error) {
      console.error('Failed to add step:', error)
      toast.error('Failed to add step')
    }
  }, [lessonsMap, selectionState])

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

      if (selectionState.selectedItem?.lessonId === lesson.id && selectionState.selectedItem?.stepIndex === stepIndex) {
        selectionState.setSelectedItem(actualLesson)
        selectionState.setSelectedType('lesson')
      }

      toast.success('Step deleted')
    } catch (error) {
      console.error('Failed to delete step:', error)
      toast.error('Failed to delete step')
    }
  }, [lessonsMap, selectionState])

  // Add task to a lesson
  const handleAddTask = useCallback((lesson) => {
    if (!lesson) return
    modalState.openAddTaskModal(lesson)
  }, [modalState])

  // Create and link a task to a lesson
  const handleCreateTask = useCallback(async (taskData) => {
    if (!modalState.addingTaskToLesson) return

    const lessonId = modalState.addingTaskToLesson.id
    const projectId = Object.keys(lessonsMap).find(pid =>
      lessonsMap[pid]?.some(l => l.id === lessonId)
    )
    if (!projectId) return

    try {
      const response = await api.post(`/api/quests/${projectId}/curriculum/lessons/${lessonId}/create-tasks`, {
        tasks: [taskData],
        link_to_lesson: true
      })

      if (response.data.success && response.data.tasks?.length > 0) {
        const createdTask = response.data.tasks[0]

        setTasksMap(prev => ({
          ...prev,
          [lessonId]: [...(prev[lessonId] || []), createdTask]
        }))

        setLessonsMap(prev => ({
          ...prev,
          [projectId]: prev[projectId].map(l =>
            l.id === lessonId
              ? { ...l, linked_task_ids: [...(l.linked_task_ids || []), createdTask.id] }
              : l
          )
        }))

        toast.success('Task created')
        modalState.closeAddTaskModal()
        return true
      }
    } catch (error) {
      console.error('Failed to create task:', error)
      toast.error('Failed to create task')
    }
    return false
  }, [modalState, lessonsMap])

  // Unlink a task from a lesson
  const handleUnlinkTask = useCallback(async (task, lesson) => {
    if (!task || !lesson) return
    if (!confirm('Remove this task from the lesson?')) return

    const projectId = Object.keys(lessonsMap).find(pid =>
      lessonsMap[pid]?.some(l => l.id === lesson.id)
    )
    if (!projectId) return

    try {
      await api.delete(`/api/quests/${projectId}/curriculum/lessons/${lesson.id}/link-task/${task.id}`)

      setTasksMap(prev => ({
        ...prev,
        [lesson.id]: (prev[lesson.id] || []).filter(t => t.id !== task.id)
      }))

      setLessonsMap(prev => ({
        ...prev,
        [projectId]: prev[projectId].map(l =>
          l.id === lesson.id
            ? { ...l, linked_task_ids: (l.linked_task_ids || []).filter(id => id !== task.id) }
            : l
        )
      }))

      if (selectionState.selectedItem?.id === task.id && selectionState.selectedType === 'task') {
        selectionState.clearSelection()
      }

      toast.success('Task removed from lesson')
    } catch (error) {
      console.error('Failed to unlink task:', error)
      toast.error('Failed to remove task')
    }
  }, [lessonsMap, selectionState])

  // Fetch all tasks across all lessons (for AllTasksModal)
  // Batches results into a single state update to avoid cascading re-renders
  const fetchAllTasks = useCallback(async () => {
    // Group lessons by quest to minimize API calls (one per quest, not per lesson)
    const lessonsByQuest = {}
    for (const [questId, lessons] of Object.entries(lessonsMap)) {
      for (const lesson of lessons) {
        if (!lessonsByQuest[questId]) lessonsByQuest[questId] = []
        lessonsByQuest[questId].push(lesson)
      }
    }

    if (Object.keys(lessonsByQuest).length === 0) return

    const results = {}
    await Promise.all(Object.entries(lessonsByQuest).map(async ([questId, lessons]) => {
      try {
        const response = await api.get(`/api/quests/${questId}/tasks`)
        const allTasks = response.data.tasks || []

        for (const lesson of lessons) {
          const taskIds = lesson?.linked_task_ids || []
          results[lesson.id] = taskIds.length > 0
            ? allTasks.filter(t => taskIds.includes(t.id))
            : []
        }
      } catch (error) {
        console.error(`Failed to fetch tasks for quest ${questId}:`, error)
        for (const lesson of lessons) {
          results[lesson.id] = []
        }
      }
    }))

    // Single batch update — one re-render instead of one per lesson
    setTasksMap(prev => ({ ...prev, ...results }))
  }, [lessonsMap])

  // Move a task from one lesson to another
  const handleMoveTask = useCallback(async (task, sourceLessonId, targetLessonId) => {
    // Find source and target project IDs
    const sourceProjectId = Object.keys(lessonsMap).find(pid =>
      lessonsMap[pid]?.some(l => l.id === sourceLessonId)
    )
    const targetProjectId = Object.keys(lessonsMap).find(pid =>
      lessonsMap[pid]?.some(l => l.id === targetLessonId)
    )
    if (!sourceProjectId || !targetProjectId) return

    try {
      // Unlink from source
      await api.delete(`/api/quests/${sourceProjectId}/curriculum/lessons/${sourceLessonId}/link-task/${task.id}`)
      // Link to target
      await api.post(`/api/quests/${targetProjectId}/curriculum/lessons/${targetLessonId}/link-task`, { task_id: task.id })

      // Update tasksMap
      setTasksMap(prev => {
        const updated = { ...prev }
        updated[sourceLessonId] = (updated[sourceLessonId] || []).filter(t => t.id !== task.id)
        updated[targetLessonId] = [...(updated[targetLessonId] || []), task]
        return updated
      })

      // Update lessonsMap linked_task_ids
      setLessonsMap(prev => {
        const updated = { ...prev }
        // Remove from source lesson
        updated[sourceProjectId] = updated[sourceProjectId].map(l =>
          l.id === sourceLessonId
            ? { ...l, linked_task_ids: (l.linked_task_ids || []).filter(id => id !== task.id) }
            : l
        )
        // Add to target lesson
        updated[targetProjectId] = updated[targetProjectId].map(l =>
          l.id === targetLessonId
            ? { ...l, linked_task_ids: [...(l.linked_task_ids || []), task.id] }
            : l
        )
        return updated
      })

      toast.success('Task moved successfully')
    } catch (error) {
      console.error('Failed to move task:', error)
      toast.error('Failed to move task')
    }
  }, [lessonsMap])

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
        modalState.setIsPublishing(true)
        await courseService.unpublishCourse(courseId)
        setCourse(prev => ({ ...prev, status: 'draft' }))
        toast.success('Course unpublished')
      } catch (error) {
        console.error('Failed to unpublish course:', error)
        toast.error('Failed to unpublish course')
      } finally {
        modalState.setIsPublishing(false)
      }
    } else {
      if (!confirm('Are you sure you want to publish this course? This will create a badge for course completion.')) return

      try {
        modalState.setIsPublishing(true)
        await courseService.publishCourse(courseId)
        setCourse(prev => ({ ...prev, status: 'published' }))
        toast.success('Course published! A completion badge has been created.')
      } catch (error) {
        console.error('Failed to publish course:', error)
        toast.error('Failed to publish course')
      } finally {
        modalState.setIsPublishing(false)
      }
    }
  }

  // Delete course
  const handleDeleteCourse = async ({ deleteQuests = false } = {}) => {
    try {
      modalState.setIsDeleting(true)
      const result = await courseService.deleteCourse(courseId, { deleteQuests })
      toast.success(result.message || 'Course deleted successfully')
      navigate('/courses')
    } catch (error) {
      console.error('Failed to delete course:', error)
      toast.error(error.response?.data?.error || 'Failed to delete course')
    } finally {
      modalState.setIsDeleting(false)
    }
  }

  // Handle lesson saved from editor
  const handleLessonSaved = (savedLesson) => {
    let projectId = null
    if (modalState.editingLesson) {
      projectId = Object.keys(lessonsMap).find(pid =>
        lessonsMap[pid]?.some(l => l.id === modalState.editingLesson.id)
      )
    }

    if (!projectId && selectionState.selectedType === 'project' && selectionState.selectedItem) {
      projectId = selectionState.selectedItem.id
    }

    if (!projectId) return

    if (modalState.editingLesson) {
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

    selectionState.setSelectedItem(savedLesson)
    selectionState.setSelectedType('lesson')
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

    if (selectionState.selectedItem?.id === lessonId) {
      selectionState.clearSelection()
    }

    modalState.setMovingLesson(null)
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

  // Find the quest for the currently selected lesson
  const selectedQuestForLesson = useMemo(() => {
    if (modalState.editingLesson) {
      const projectId = Object.keys(lessonsMap).find(pid =>
        lessonsMap[pid]?.some(l => l.id === modalState.editingLesson.id)
      )
      return quests.find(q => q.id === projectId)
    }
    if (selectionState.selectedType === 'project' && selectionState.selectedItem) {
      return selectionState.selectedItem
    }
    return quests[0]
  }, [modalState.editingLesson, lessonsMap, quests, selectionState.selectedType, selectionState.selectedItem])

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
    selectedItem: selectionState.selectedItem,
    selectedType: selectionState.selectedType,
    expandedIds: selectionState.expandedIds,
    outlineCollapsed: selectionState.outlineCollapsed,
    setOutlineCollapsed: selectionState.setOutlineCollapsed,

    // Modal states (from useModalState)
    showAddQuestModal: modalState.showAddQuestModal,
    setShowAddQuestModal: modalState.setShowAddQuestModal,
    isPublishing: modalState.isPublishing,
    isCreating: modalState.isCreating,
    showPreview: modalState.showPreview,
    setShowPreview: modalState.setShowPreview,
    showCourseDetails: modalState.showCourseDetails,
    setShowCourseDetails: modalState.setShowCourseDetails,
    editingLesson: modalState.editingLesson,
    setEditingLesson: modalState.setEditingLesson,
    showLessonEditor: modalState.showLessonEditor,
    setShowLessonEditor: modalState.setShowLessonEditor,
    previewingLesson: modalState.previewingLesson,
    setPreviewingLesson: modalState.setPreviewingLesson,
    isDeleting: modalState.isDeleting,
    showBulkTaskModal: modalState.showBulkTaskModal,
    setShowBulkTaskModal: modalState.setShowBulkTaskModal,
    showRefineModal: modalState.showRefineModal,
    setShowRefineModal: modalState.setShowRefineModal,
    showAIToolsModal: modalState.showAIToolsModal,
    setShowAIToolsModal: modalState.setShowAIToolsModal,
    movingLesson: modalState.movingLesson,
    setMovingLesson: modalState.setMovingLesson,
    showAddTaskModal: modalState.showAddTaskModal,
    setShowAddTaskModal: modalState.setShowAddTaskModal,
    addingTaskToLesson: modalState.addingTaskToLesson,
    setAddingTaskToLesson: modalState.setAddingTaskToLesson,
    showAllTasks: modalState.showAllTasks,
    setShowAllTasks: modalState.setShowAllTasks,

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
    handleAddTask,
    handleCreateTask,
    handleUnlinkTask,
    handleMoveTask,
    fetchAllTasks,
    handleToggleTaskRequired,
    handlePublishToggle,
    handleDeleteCourse,
    handleLessonSaved,
    handleLessonMoved,
    handleAIToolSelect: aiTools.handleAIToolSelect,
    handleRefineComplete: aiTools.handleRefineComplete,
    refreshLessonsForQuests: aiTools.refreshLessonsForQuests,

    // Computed
    hasLessonsWithoutTasks,
    hasProjectsWithoutLessons,
    hasLessonsWithoutContent,
    selectedQuestForLesson,
  }
}

export default useCourseBuilderState
