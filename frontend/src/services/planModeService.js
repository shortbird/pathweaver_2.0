/**
 * Plan Mode Service
 *
 * API client for the iterative course design feature.
 * Teachers can describe course ideas and refine outlines through conversation.
 */

import api from './api'

export const planModeService = {
  /**
   * Start a new plan mode session
   * @param {string} prompt - Initial course description/idea
   * @returns {Promise<{session, outline, message, suggestions}>}
   */
  startSession: (prompt) => {
    return api.post('/api/admin/curriculum/plan/start', { prompt })
  },

  /**
   * Refine the outline with a new request
   * @param {string} sessionId - The plan session ID
   * @param {string} message - The refinement request
   * @returns {Promise<{outline, changes, message, suggestions}>}
   */
  refineOutline: (sessionId, message) => {
    return api.post(`/api/admin/curriculum/plan/${sessionId}/refine`, { message })
  },

  /**
   * Get session state (outline and conversation)
   * @param {string} sessionId - The plan session ID
   * @returns {Promise<{session, outline, conversation}>}
   */
  getSession: (sessionId) => {
    return api.get(`/api/admin/curriculum/plan/${sessionId}`)
  },

  /**
   * List user's plan sessions
   * @param {string} [status] - Optional status filter
   * @returns {Promise<{sessions: Array}>}
   */
  listSessions: (status = null) => {
    const params = status ? { status } : {}
    return api.get('/api/admin/curriculum/plan/sessions', { params })
  },

  /**
   * Update session (save draft or abandon)
   * @param {string} sessionId - The plan session ID
   * @param {object} updates - Updates to apply (e.g., { status: 'abandoned' })
   * @returns {Promise<{session}>}
   */
  updateSession: (sessionId, updates) => {
    return api.put(`/api/admin/curriculum/plan/${sessionId}`, updates)
  },

  /**
   * Approve outline and create draft course
   * @param {string} sessionId - The plan session ID
   * @returns {Promise<{course_id, status, message}>}
   */
  approveAndGenerate: (sessionId) => {
    return api.post(`/api/admin/curriculum/plan/${sessionId}/approve`, {})
  },

  /**
   * Get generation progress
   * @param {string} sessionId - The plan session ID
   * @returns {Promise<{status, progress, current_step, course_id?}>}
   */
  getProgress: (sessionId) => {
    return api.get(`/api/admin/curriculum/plan/${sessionId}/progress`)
  },

  /**
   * Abandon a draft session
   * @param {string} sessionId - The plan session ID
   * @returns {Promise<{session}>}
   */
  abandonSession: (sessionId) => {
    return api.put(`/api/admin/curriculum/plan/${sessionId}`, { status: 'abandoned' })
  }
}

export default planModeService
