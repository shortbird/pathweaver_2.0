import api from './api'

/**
 * Course Management API Service
 * Handles all API calls related to LMS courses and course-quest relationships.
 */

/**
 * Get all courses (with optional filters)
 * @param {Object} [params] - Query parameters
 * @param {string} [params.organization_id] - Filter by organization
 * @param {boolean} [params.is_active] - Filter by active status
 * @returns {Promise<{success: boolean, courses: Array}>}
 */
export const getCourses = async (params = {}) => {
  try {
    const response = await api.get('/api/courses', { params })
    return response.data
  } catch (error) {
    console.error('Error fetching courses:', error)
    throw error
  }
}

/**
 * Get a specific course by ID
 * @param {string} id - Course ID
 * @returns {Promise<{success: boolean, course: Object}>}
 */
export const getCourseById = async (id) => {
  try {
    const response = await api.get(`/api/courses/${id}`)
    return response.data
  } catch (error) {
    console.error(`Error fetching course ${id}:`, error)
    throw error
  }
}

/**
 * Create a new course
 * @param {Object} data - Course data
 * @param {string} data.title - Course title (required)
 * @param {string} [data.description] - Course description
 * @param {string} [data.organization_id] - Organization ID
 * @param {string} [data.lms_platform] - LMS platform name
 * @param {string} [data.lms_course_id] - External LMS course ID
 * @returns {Promise<{success: boolean, course: Object, message: string}>}
 */
export const createCourse = async (data) => {
  try {
    const response = await api.post('/api/courses', data)
    return response.data
  } catch (error) {
    console.error('Error creating course:', error)
    throw error
  }
}

/**
 * Update an existing course
 * @param {string} id - Course ID
 * @param {Object} data - Course data to update
 * @returns {Promise<{success: boolean, course: Object, message: string}>}
 */
export const updateCourse = async (id, data) => {
  try {
    const response = await api.put(`/api/courses/${id}`, data)
    return response.data
  } catch (error) {
    console.error(`Error updating course ${id}:`, error)
    throw error
  }
}

/**
 * Publish a course (make it active/visible)
 * @param {string} id - Course ID
 * @returns {Promise<{success: boolean, course: Object, message: string}>}
 */
export const publishCourse = async (id) => {
  try {
    // ✅ CSRF: Empty body required for POST requests
    const response = await api.post(`/api/courses/${id}/publish`, {})
    return response.data
  } catch (error) {
    console.error(`Error publishing course ${id}:`, error)
    throw error
  }
}

/**
 * Add a quest to a course with configuration
 * @param {string} courseId - Course ID
 * @param {string} questId - Quest ID to add
 * @param {Object} data - Quest configuration
 * @param {number} [data.sequence_order] - Order in the course
 * @param {boolean} [data.is_required] - Whether quest is required
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const addQuestToCourse = async (courseId, questId, data = {}) => {
  try {
    const response = await api.post(`/api/courses/${courseId}/quests/${questId}`, data)
    return response.data
  } catch (error) {
    console.error(`Error adding quest ${questId} to course ${courseId}:`, error)
    throw error
  }
}

/**
 * Remove a quest from a course
 * @param {string} courseId - Course ID
 * @param {string} questId - Quest ID to remove
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const removeQuestFromCourse = async (courseId, questId) => {
  try {
    const response = await api.delete(`/api/courses/${courseId}/quests/${questId}`)
    return response.data
  } catch (error) {
    console.error(`Error removing quest ${questId} from course ${courseId}:`, error)
    throw error
  }
}

/**
 * Reorder quests in a course
 * @param {string} courseId - Course ID
 * @param {Array<string>} questIds - Array of quest IDs in desired order
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const reorderQuests = async (courseId, questIds) => {
  try {
    const response = await api.put(`/api/courses/${courseId}/quests/reorder`, { quest_ids: questIds })
    return response.data
  } catch (error) {
    console.error(`Error reordering quests in course ${courseId}:`, error)
    throw error
  }
}

/**
 * Enroll in a course
 * @param {string} courseId - Course ID
 * @returns {Promise<{success: boolean, enrollment: Object, message: string}>}
 */
export const enrollInCourse = async (courseId) => {
  try {
    // ✅ CSRF: Empty body required for POST requests
    const response = await api.post(`/api/courses/${courseId}/enroll`, {})
    return response.data
  } catch (error) {
    console.error(`Error enrolling in course ${courseId}:`, error)
    throw error
  }
}

/**
 * Get course progress for the current user
 * @param {string} courseId - Course ID
 * @returns {Promise<{success: boolean, progress: Object}>}
 */
export const getCourseProgress = async (courseId) => {
  try {
    const response = await api.get(`/api/courses/${courseId}/progress`)
    return response.data
  } catch (error) {
    console.error(`Error fetching progress for course ${courseId}:`, error)
    throw error
  }
}

export default {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  publishCourse,
  addQuestToCourse,
  removeQuestFromCourse,
  reorderQuests,
  enrollInCourse,
  getCourseProgress
}
