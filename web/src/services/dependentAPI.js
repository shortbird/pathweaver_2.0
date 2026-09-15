import api from './api'

/**
 * Dependent Profiles API Service
 * Handles all API calls related to dependent child profiles (ages 5-12).
 * COPPA-compliant: Dependents have no email/password until promoted at age 13.
 *
 * create / get / update / delete / promote were exported here without a
 * caller until 2026-09-15 (AddChildModal posts /api/dependents/add-child
 * itself; promotion is "add a login" below). Deleted rather than kept.
 * getMyDependents went the same day: the family list is
 * hooks/api/useFamilyChildren over GET /api/family/children.
 */

/**
 * Add login credentials to a dependent (child keeps dependent status)
 * Unlike promotion, the child remains under parental management.
 * @param {string} dependentId - Dependent user ID
 * @param {Object} credentials - Login credentials
 * @param {string} credentials.email - Email address
 * @param {string} credentials.password - Password (min 12 characters)
 * @returns {Promise<{success: boolean, dependent: Object, message: string}>}
 */
export const addDependentLogin = async (dependentId, credentials) => {
  try {
    const response = await api.post(`/api/dependents/${dependentId}/add-login`, credentials)
    return response.data
  } catch (error) {
    console.error(`Error adding login for dependent ${dependentId}:`, error)
    throw error
  }
}

/**
 * Toggle AI features access for a dependent
 * @param {string} dependentId - Dependent user ID
 * @param {boolean} enabled - Whether to enable or disable AI features
 * @returns {Promise<{success: boolean, dependent_id: string, ai_features_enabled: boolean, message: string}>}
 */
export const toggleDependentAIAccess = async (dependentId, enabled) => {
  try {
    const response = await api.post(`/api/dependents/${dependentId}/ai-access`, { enabled })
    return response.data
  } catch (error) {
    console.error(`Error toggling AI access for dependent ${dependentId}:`, error)
    throw error
  }
}

/**
 * Update individual AI feature settings for a dependent
 * @param {string} dependentId - Dependent user ID
 * @param {Object} features - Feature settings to update
 * @param {boolean} [features.chatbot] - AI Tutor/chatbot enabled
 * @param {boolean} [features.lesson_helper] - Lesson helper enabled
 * @param {boolean} [features.task_generation] - Task generation enabled
 * @returns {Promise<{success: boolean, dependent_id: string, features: Object, message: string}>}
 */
export const updateDependentAIFeatures = async (dependentId, features) => {
  try {
    const response = await api.put(`/api/dependents/${dependentId}/ai-features`, features)
    return response.data
  } catch (error) {
    console.error(`Error updating AI features for dependent ${dependentId}:`, error)
    throw error
  }
}

/**
 * Correct a child's first and last name.
 *
 * Works for both kinds of child a guardian can have — a managed dependent and a
 * linked student with their own login — which is why it is NOT updateDependent:
 * that route is dependents-only and takes display_name, so a linked student's
 * name had no editor anywhere in the parent's portal.
 *
 * @param {string} studentId - The child's user ID
 * @param {{first_name: string, last_name: string}} name
 * @returns {Promise<{success: boolean, student: Object, message: string}>}
 */
export const updateChildName = async (studentId, name) => {
  try {
    const response = await api.put(`/api/parent/children/${studentId}/name`, name)
    return response.data
  } catch (error) {
    console.error(`Error updating name for child ${studentId}:`, error)
    throw error
  }
}

export default {
  addDependentLogin,
  toggleDependentAIAccess,
  updateDependentAIFeatures,
  updateChildName
}
