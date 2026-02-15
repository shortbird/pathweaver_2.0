import { useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import courseService from '../../services/courseService'

/**
 * Manages AI tools functionality for the Course Builder.
 * Handles lesson/content generation and course refinement.
 */
export function useAITools({
  courseId,
  quests,
  lessonsMap,
  setLessonsMap,
  setCourse,
  setQuests,
  setShowBulkTaskModal,
  setShowRefineModal,
}) {
  // Generate lessons for all projects
  const handleGenerateLessons = useCallback(async () => {
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
  }, [courseId, quests, lessonsMap, setLessonsMap])

  // Generate content for lessons that don't have it
  const handleGenerateLessonContent = useCallback(async () => {
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
  }, [courseId, quests, lessonsMap, setLessonsMap])

  // Handle AI tool selection from the toolbar
  const handleAIToolSelect = useCallback(async (toolId) => {
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
  }, [handleGenerateLessons, handleGenerateLessonContent, setShowBulkTaskModal, setShowRefineModal])

  // Handle completion of refine operation
  const handleRefineComplete = useCallback(async () => {
    try {
      // Refresh course data
      const courseResponse = await courseService.getCourseById(courseId)
      setCourse(courseResponse.course)

      // Refresh quests
      const questsResponse = await api.get(`/api/courses/${courseId}/quests`)
      const fetchedQuests = questsResponse.data.quests || []
      setQuests(fetchedQuests)

      // Refresh lessons
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
  }, [courseId, setCourse, setQuests, setLessonsMap])

  // Refresh lessons for all quests (used by BulkTaskGenerationModal)
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
  }, [quests, setLessonsMap])

  return {
    handleGenerateLessons,
    handleGenerateLessonContent,
    handleAIToolSelect,
    handleRefineComplete,
    refreshLessonsForQuests,
  }
}

export default useAITools
