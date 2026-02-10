/**
 * Organization Classes Service
 *
 * API client for managing organization classes including:
 * - Class CRUD operations
 * - Advisor assignment
 * - Student enrollment
 * - Quest management
 * - Progress tracking
 */

import api from './api'

const classService = {
  // ===== Class CRUD =====

  /**
   * List all classes for an organization
   * @param {string} orgId - Organization ID
   * @param {object} options - Query options
   * @param {string} options.status - Filter by status ('active', 'archived')
   */
  getOrgClasses: async (orgId, options = {}) => {
    const params = new URLSearchParams()
    if (options.status) params.append('status', options.status)
    const queryString = params.toString()
    const url = `/api/organizations/${orgId}/classes${queryString ? '?' + queryString : ''}`
    const response = await api.get(url)
    return response.data
  },

  /**
   * Create a new class in an organization
   * @param {string} orgId - Organization ID
   * @param {object} data - Class data
   * @param {string} data.name - Class name
   * @param {string} data.description - Class description
   * @param {number} data.xp_threshold - XP required to complete
   */
  createClass: async (orgId, data) => {
    const response = await api.post(`/api/organizations/${orgId}/classes`, data)
    return response.data
  },

  /**
   * Get a class by ID with details
   * @param {string} orgId - Organization ID
   * @param {string} classId - Class ID
   */
  getClass: async (orgId, classId) => {
    const response = await api.get(`/api/organizations/${orgId}/classes/${classId}`)
    return response.data
  },

  /**
   * Update a class
   * @param {string} orgId - Organization ID
   * @param {string} classId - Class ID
   * @param {object} data - Fields to update
   */
  updateClass: async (orgId, classId, data) => {
    const response = await api.put(`/api/organizations/${orgId}/classes/${classId}`, data)
    return response.data
  },

  /**
   * Archive a class (soft delete)
   * @param {string} orgId - Organization ID
   * @param {string} classId - Class ID
   */
  archiveClass: async (orgId, classId) => {
    const response = await api.delete(`/api/organizations/${orgId}/classes/${classId}`)
    return response.data
  },

  // ===== Advisor Management =====

  /**
   * Get all advisors assigned to a class
   * @param {string} orgId - Organization ID
   * @param {string} classId - Class ID
   */
  getClassAdvisors: async (orgId, classId) => {
    const response = await api.get(`/api/organizations/${orgId}/classes/${classId}/advisors`)
    return response.data
  },

  /**
   * Add an advisor to a class
   * @param {string} orgId - Organization ID
   * @param {string} classId - Class ID
   * @param {string} advisorId - User ID of the advisor
   */
  addClassAdvisor: async (orgId, classId, advisorId) => {
    const response = await api.post(`/api/organizations/${orgId}/classes/${classId}/advisors`, {
      advisor_id: advisorId,
    })
    return response.data
  },

  /**
   * Remove an advisor from a class
   * @param {string} orgId - Organization ID
   * @param {string} classId - Class ID
   * @param {string} advisorId - User ID of the advisor
   */
  removeClassAdvisor: async (orgId, classId, advisorId) => {
    const response = await api.delete(
      `/api/organizations/${orgId}/classes/${classId}/advisors/${advisorId}`
    )
    return response.data
  },

  // ===== Student Enrollment =====

  /**
   * Get all students enrolled in a class with progress
   * @param {string} orgId - Organization ID
   * @param {string} classId - Class ID
   * @param {object} options - Query options
   * @param {boolean} options.withProgress - Include XP progress (default: true)
   */
  getClassStudents: async (orgId, classId, options = {}) => {
    const params = new URLSearchParams()
    if (options.withProgress !== undefined) {
      params.append('with_progress', options.withProgress.toString())
    }
    const queryString = params.toString()
    const url = `/api/organizations/${orgId}/classes/${classId}/students${queryString ? '?' + queryString : ''}`
    const response = await api.get(url)
    return response.data
  },

  /**
   * Enroll one or more students in a class
   * @param {string} orgId - Organization ID
   * @param {string} classId - Class ID
   * @param {string[]} studentIds - Array of student user IDs
   */
  enrollStudents: async (orgId, classId, studentIds) => {
    const response = await api.post(`/api/organizations/${orgId}/classes/${classId}/students`, {
      student_ids: studentIds,
    })
    return response.data
  },

  /**
   * Withdraw a student from a class
   * @param {string} orgId - Organization ID
   * @param {string} classId - Class ID
   * @param {string} studentId - Student user ID
   */
  withdrawStudent: async (orgId, classId, studentId) => {
    const response = await api.delete(
      `/api/organizations/${orgId}/classes/${classId}/students/${studentId}`
    )
    return response.data
  },

  /**
   * Get a specific student's progress in a class
   * @param {string} orgId - Organization ID
   * @param {string} classId - Class ID
   * @param {string} studentId - Student user ID
   */
  getStudentProgress: async (orgId, classId, studentId) => {
    const response = await api.get(
      `/api/organizations/${orgId}/classes/${classId}/students/${studentId}/progress`
    )
    return response.data
  },

  // ===== Quest Management =====

  /**
   * Get all quests assigned to a class
   * @param {string} orgId - Organization ID
   * @param {string} classId - Class ID
   */
  getClassQuests: async (orgId, classId) => {
    const response = await api.get(`/api/organizations/${orgId}/classes/${classId}/quests`)
    return response.data
  },

  /**
   * Add a quest to a class
   * @param {string} orgId - Organization ID
   * @param {string} classId - Class ID
   * @param {string} questId - Quest ID
   * @param {number} sequenceOrder - Optional display order
   */
  addClassQuest: async (orgId, classId, questId, sequenceOrder = null) => {
    const data = { quest_id: questId }
    if (sequenceOrder !== null) {
      data.sequence_order = sequenceOrder
    }
    const response = await api.post(
      `/api/organizations/${orgId}/classes/${classId}/quests`,
      data
    )
    return response.data
  },

  /**
   * Remove a quest from a class
   * @param {string} orgId - Organization ID
   * @param {string} classId - Class ID
   * @param {string} questId - Quest ID
   */
  removeClassQuest: async (orgId, classId, questId) => {
    const response = await api.delete(
      `/api/organizations/${orgId}/classes/${classId}/quests/${questId}`
    )
    return response.data
  },

  /**
   * Reorder quests in a class
   * @param {string} orgId - Organization ID
   * @param {string} classId - Class ID
   * @param {string[]} questIds - Quest IDs in new order
   */
  reorderClassQuests: async (orgId, classId, questIds) => {
    const response = await api.put(
      `/api/organizations/${orgId}/classes/${classId}/quests/reorder`,
      { quest_ids: questIds }
    )
    return response.data
  },

  /**
   * Get quests available for adding to classes in an organization
   * @param {string} orgId - Organization ID
   * @param {object} options - Query options
   * @param {string} options.search - Search term
   * @param {number} options.limit - Max results
   */
  getAvailableQuests: async (orgId, options = {}) => {
    const params = new URLSearchParams()
    if (options.search) params.append('search', options.search)
    if (options.limit) params.append('limit', options.limit.toString())
    const queryString = params.toString()
    const url = `/api/organizations/${orgId}/available-quests${queryString ? '?' + queryString : ''}`
    const response = await api.get(url)
    return response.data
  },

  // ===== Advisor View =====

  /**
   * Get all classes the current user is assigned to as an advisor
   * @param {object} options - Query options
   * @param {string} options.status - Filter by status ('active', 'archived')
   */
  getMyClasses: async (options = {}) => {
    const params = new URLSearchParams()
    if (options.status) params.append('status', options.status)
    const queryString = params.toString()
    const url = `/api/advisor/classes${queryString ? '?' + queryString : ''}`
    const response = await api.get(url)
    return response.data
  },
}

export default classService
