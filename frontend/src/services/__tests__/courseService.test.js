import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '../api'
import {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  publishCourse,
  unpublishCourse,
  addQuestToCourse,
  removeQuestFromCourse,
  reorderQuests,
  enrollInCourse,
  getCourseProgress,
  deleteCourse
} from '../courseService'

// Mock the api module
vi.mock('../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}))

describe('courseService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ==================== getCourses ====================
  describe('getCourses', () => {
    it('fetches courses without params', async () => {
      const mockResponse = {
        data: {
          success: true,
          courses: [
            { id: 'course-1', title: 'Course 1' },
            { id: 'course-2', title: 'Course 2' }
          ]
        }
      }
      api.get.mockResolvedValueOnce(mockResponse)

      const result = await getCourses()

      expect(api.get).toHaveBeenCalledWith('/api/courses', { params: {} })
      expect(result).toEqual(mockResponse.data)
    })

    it('fetches courses with organization filter', async () => {
      const mockResponse = {
        data: {
          success: true,
          courses: [{ id: 'course-1', title: 'Org Course' }]
        }
      }
      api.get.mockResolvedValueOnce(mockResponse)

      const result = await getCourses({ organization_id: 'org-123' })

      expect(api.get).toHaveBeenCalledWith('/api/courses', {
        params: { organization_id: 'org-123' }
      })
      expect(result).toEqual(mockResponse.data)
    })

    it('fetches courses with active filter', async () => {
      const mockResponse = {
        data: { success: true, courses: [] }
      }
      api.get.mockResolvedValueOnce(mockResponse)

      await getCourses({ is_active: true })

      expect(api.get).toHaveBeenCalledWith('/api/courses', {
        params: { is_active: true }
      })
    })

    it('throws error on API failure', async () => {
      const error = new Error('Network Error')
      api.get.mockRejectedValueOnce(error)

      await expect(getCourses()).rejects.toThrow('Network Error')
    })
  })

  // ==================== getCourseById ====================
  describe('getCourseById', () => {
    it('fetches a specific course by ID', async () => {
      const mockCourse = {
        id: 'course-123',
        title: 'Test Course',
        description: 'A test course',
        status: 'published'
      }
      const mockResponse = { data: { success: true, course: mockCourse } }
      api.get.mockResolvedValueOnce(mockResponse)

      const result = await getCourseById('course-123')

      expect(api.get).toHaveBeenCalledWith('/api/courses/course-123')
      expect(result.course).toEqual(mockCourse)
    })

    it('throws error when course not found', async () => {
      const error = { response: { status: 404, data: { error: 'Course not found' } } }
      api.get.mockRejectedValueOnce(error)

      await expect(getCourseById('nonexistent')).rejects.toEqual(error)
    })
  })

  // ==================== createCourse ====================
  describe('createCourse', () => {
    it('creates a course with required data', async () => {
      const courseData = {
        title: 'New Course',
        description: 'Course description'
      }
      const mockResponse = {
        data: {
          success: true,
          course: { id: 'new-course-id', ...courseData },
          message: 'Course created successfully'
        }
      }
      api.post.mockResolvedValueOnce(mockResponse)

      const result = await createCourse(courseData)

      expect(api.post).toHaveBeenCalledWith('/api/courses', courseData)
      expect(result.success).toBe(true)
      expect(result.course.title).toBe('New Course')
    })

    it('creates a course with organization ID', async () => {
      const courseData = {
        title: 'Org Course',
        organization_id: 'org-123'
      }
      const mockResponse = {
        data: { success: true, course: { id: 'course-id', ...courseData } }
      }
      api.post.mockResolvedValueOnce(mockResponse)

      await createCourse(courseData)

      expect(api.post).toHaveBeenCalledWith('/api/courses', courseData)
    })

    it('throws error on validation failure', async () => {
      const error = {
        response: { status: 400, data: { error: 'Title is required' } }
      }
      api.post.mockRejectedValueOnce(error)

      await expect(createCourse({})).rejects.toEqual(error)
    })
  })

  // ==================== updateCourse ====================
  describe('updateCourse', () => {
    it('updates course data', async () => {
      const updateData = { title: 'Updated Title' }
      const mockResponse = {
        data: {
          success: true,
          course: { id: 'course-123', title: 'Updated Title' },
          message: 'Course updated successfully'
        }
      }
      api.put.mockResolvedValueOnce(mockResponse)

      const result = await updateCourse('course-123', updateData)

      expect(api.put).toHaveBeenCalledWith('/api/courses/course-123', updateData)
      expect(result.course.title).toBe('Updated Title')
    })

    it('throws error on unauthorized update', async () => {
      const error = {
        response: { status: 403, data: { error: 'Not authorized to update this course' } }
      }
      api.put.mockRejectedValueOnce(error)

      await expect(updateCourse('course-123', { title: 'New' })).rejects.toEqual(error)
    })
  })

  // ==================== publishCourse ====================
  describe('publishCourse', () => {
    it('publishes a course with empty body for CSRF', async () => {
      const mockResponse = {
        data: {
          success: true,
          course: { id: 'course-123', status: 'published' },
          message: 'Course published'
        }
      }
      api.post.mockResolvedValueOnce(mockResponse)

      const result = await publishCourse('course-123')

      expect(api.post).toHaveBeenCalledWith('/api/courses/course-123/publish', {})
      expect(result.course.status).toBe('published')
    })

    it('throws error when publishing incomplete course', async () => {
      const error = {
        response: { status: 400, data: { error: 'Course must have at least one quest' } }
      }
      api.post.mockRejectedValueOnce(error)

      await expect(publishCourse('course-123')).rejects.toEqual(error)
    })
  })

  // ==================== unpublishCourse ====================
  describe('unpublishCourse', () => {
    it('unpublishes a course by setting status to draft', async () => {
      const mockResponse = {
        data: {
          success: true,
          course: { id: 'course-123', status: 'draft' }
        }
      }
      api.put.mockResolvedValueOnce(mockResponse)

      const result = await unpublishCourse('course-123')

      expect(api.put).toHaveBeenCalledWith('/api/courses/course-123', { status: 'draft' })
      expect(result.course.status).toBe('draft')
    })
  })

  // ==================== addQuestToCourse ====================
  describe('addQuestToCourse', () => {
    it('adds a quest to a course', async () => {
      const mockResponse = {
        data: { success: true, message: 'Quest added to course' }
      }
      api.post.mockResolvedValueOnce(mockResponse)

      const result = await addQuestToCourse('course-123', 'quest-456')

      expect(api.post).toHaveBeenCalledWith('/api/courses/course-123/quests', {
        quest_id: 'quest-456'
      })
      expect(result.success).toBe(true)
    })

    it('adds a quest with sequence order', async () => {
      const mockResponse = {
        data: { success: true, message: 'Quest added' }
      }
      api.post.mockResolvedValueOnce(mockResponse)

      await addQuestToCourse('course-123', 'quest-456', { sequence_order: 2 })

      expect(api.post).toHaveBeenCalledWith('/api/courses/course-123/quests', {
        quest_id: 'quest-456',
        sequence_order: 2
      })
    })

    it('adds a required quest', async () => {
      const mockResponse = {
        data: { success: true, message: 'Quest added' }
      }
      api.post.mockResolvedValueOnce(mockResponse)

      await addQuestToCourse('course-123', 'quest-456', { is_required: true })

      expect(api.post).toHaveBeenCalledWith('/api/courses/course-123/quests', {
        quest_id: 'quest-456',
        is_required: true
      })
    })

    it('throws error when quest already in course', async () => {
      const error = {
        response: { status: 409, data: { error: 'Quest already in course' } }
      }
      api.post.mockRejectedValueOnce(error)

      await expect(addQuestToCourse('course-123', 'quest-456')).rejects.toEqual(error)
    })
  })

  // ==================== removeQuestFromCourse ====================
  describe('removeQuestFromCourse', () => {
    it('removes a quest from a course', async () => {
      const mockResponse = {
        data: { success: true, message: 'Quest removed from course' }
      }
      api.delete.mockResolvedValueOnce(mockResponse)

      const result = await removeQuestFromCourse('course-123', 'quest-456')

      expect(api.delete).toHaveBeenCalledWith('/api/courses/course-123/quests/quest-456')
      expect(result.success).toBe(true)
    })

    it('throws error when quest not in course', async () => {
      const error = {
        response: { status: 404, data: { error: 'Quest not found in course' } }
      }
      api.delete.mockRejectedValueOnce(error)

      await expect(removeQuestFromCourse('course-123', 'quest-999')).rejects.toEqual(error)
    })
  })

  // ==================== reorderQuests ====================
  describe('reorderQuests', () => {
    it('reorders quests in a course', async () => {
      const questIds = ['quest-3', 'quest-1', 'quest-2']
      const mockResponse = {
        data: { success: true, message: 'Quests reordered' }
      }
      api.put.mockResolvedValueOnce(mockResponse)

      const result = await reorderQuests('course-123', questIds)

      expect(api.put).toHaveBeenCalledWith('/api/courses/course-123/quests/reorder', {
        quest_order: questIds
      })
      expect(result.success).toBe(true)
    })

    it('handles empty quest order', async () => {
      const mockResponse = {
        data: { success: true, message: 'Quests reordered' }
      }
      api.put.mockResolvedValueOnce(mockResponse)

      await reorderQuests('course-123', [])

      expect(api.put).toHaveBeenCalledWith('/api/courses/course-123/quests/reorder', {
        quest_order: []
      })
    })
  })

  // ==================== enrollInCourse ====================
  describe('enrollInCourse', () => {
    it('enrolls user in a course with empty body for CSRF', async () => {
      const mockResponse = {
        data: {
          success: true,
          enrollment: {
            id: 'enrollment-123',
            course_id: 'course-123',
            user_id: 'user-456',
            status: 'active'
          },
          message: 'Successfully enrolled'
        }
      }
      api.post.mockResolvedValueOnce(mockResponse)

      const result = await enrollInCourse('course-123')

      expect(api.post).toHaveBeenCalledWith('/api/courses/course-123/enroll', {})
      expect(result.enrollment.status).toBe('active')
    })

    it('throws error when already enrolled', async () => {
      const error = {
        response: { status: 409, data: { error: 'Already enrolled in this course' } }
      }
      api.post.mockRejectedValueOnce(error)

      await expect(enrollInCourse('course-123')).rejects.toEqual(error)
    })

    it('throws error when course not published', async () => {
      const error = {
        response: { status: 400, data: { error: 'Course is not available for enrollment' } }
      }
      api.post.mockRejectedValueOnce(error)

      await expect(enrollInCourse('course-123')).rejects.toEqual(error)
    })
  })

  // ==================== getCourseProgress ====================
  describe('getCourseProgress', () => {
    it('fetches course progress for current user', async () => {
      const mockProgress = {
        course_id: 'course-123',
        total_quests: 5,
        completed_quests: 2,
        total_xp: 500,
        earned_xp: 200,
        percentage: 40
      }
      const mockResponse = {
        data: { success: true, progress: mockProgress }
      }
      api.get.mockResolvedValueOnce(mockResponse)

      const result = await getCourseProgress('course-123')

      expect(api.get).toHaveBeenCalledWith('/api/courses/course-123/progress')
      expect(result.progress.percentage).toBe(40)
    })

    it('throws error when not enrolled', async () => {
      const error = {
        response: { status: 403, data: { error: 'Not enrolled in this course' } }
      }
      api.get.mockRejectedValueOnce(error)

      await expect(getCourseProgress('course-123')).rejects.toEqual(error)
    })
  })

  // ==================== deleteCourse ====================
  describe('deleteCourse', () => {
    it('deletes a course', async () => {
      const mockResponse = {
        data: { success: true, message: 'Course deleted successfully' }
      }
      api.delete.mockResolvedValueOnce(mockResponse)

      const result = await deleteCourse('course-123')

      expect(api.delete).toHaveBeenCalledWith('/api/courses/course-123')
      expect(result.success).toBe(true)
    })

    it('throws error when not authorized to delete', async () => {
      const error = {
        response: { status: 403, data: { error: 'Only course creator or org admin can delete' } }
      }
      api.delete.mockRejectedValueOnce(error)

      await expect(deleteCourse('course-123')).rejects.toEqual(error)
    })

    it('throws error when course not found', async () => {
      const error = {
        response: { status: 404, data: { error: 'Course not found' } }
      }
      api.delete.mockRejectedValueOnce(error)

      await expect(deleteCourse('nonexistent')).rejects.toEqual(error)
    })
  })
})
