import api from './api'

/**
 * Dependent Profiles API Service
 * Handles all API calls related to dependent child profiles (ages 5-12).
 * COPPA-compliant: Dependents have no email/password until promoted at age 13.
 */

/**
 * Get all dependents for the logged-in parent
 * @returns {Promise<{success: boolean, dependents: Array, count: number}>}
 */
export const getMyDependents = async () => {
  try {
    const response = await api.get('/api/dependents/my-dependents')
    return response.data
  } catch (error) {
    console.error('Error fetching dependents:', error)
    throw error
  }
}

/**
 * Create a new dependent profile
 * @param {Object} dependentData - Dependent profile data
 * @param {string} dependentData.display_name - Display name (required)
 * @param {string} dependentData.date_of_birth - Date of birth in YYYY-MM-DD format (required)
 * @param {string} [dependentData.avatar_url] - Optional avatar URL
 * @returns {Promise<{success: boolean, dependent: Object, message: string}>}
 */
export const createDependent = async (dependentData) => {
  try {
    const response = await api.post('/api/dependents/create', dependentData)
    return response.data
  } catch (error) {
    console.error('Error creating dependent:', error)
    throw error
  }
}

/**
 * Get a specific dependent profile
 * @param {string} dependentId - Dependent user ID
 * @returns {Promise<{success: boolean, dependent: Object}>}
 */
export const getDependent = async (dependentId) => {
  try {
    const response = await api.get(`/api/dependents/${dependentId}`)
    return response.data
  } catch (error) {
    console.error(`Error fetching dependent ${dependentId}:`, error)
    throw error
  }
}

/**
 * Update a dependent profile
 * @param {string} dependentId - Dependent user ID
 * @param {Object} updates - Fields to update (display_name, avatar_url, date_of_birth, bio)
 * @returns {Promise<{success: boolean, dependent: Object, message: string}>}
 */
export const updateDependent = async (dependentId, updates) => {
  try {
    const response = await api.put(`/api/dependents/${dependentId}`, updates)
    return response.data
  } catch (error) {
    console.error(`Error updating dependent ${dependentId}:`, error)
    throw error
  }
}

/**
 * Delete a dependent profile
 * CAUTION: This will delete the dependent account and all associated data
 * @param {string} dependentId - Dependent user ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const deleteDependent = async (dependentId) => {
  try {
    const response = await api.delete(`/api/dependents/${dependentId}`)
    return response.data
  } catch (error) {
    console.error(`Error deleting dependent ${dependentId}:`, error)
    throw error
  }
}

/**
 * Promote a dependent to an independent account (when they turn 13)
 * @param {string} dependentId - Dependent user ID
 * @param {Object} credentials - Login credentials for new independent account
 * @param {string} credentials.email - Email address
 * @param {string} credentials.password - Password (min 12 characters)
 * @returns {Promise<{success: boolean, user: Object, message: string}>}
 */
export const promoteDependent = async (dependentId, credentials) => {
  try {
    const response = await api.post(`/api/dependents/${dependentId}/promote`, credentials)
    return response.data
  } catch (error) {
    console.error(`Error promoting dependent ${dependentId}:`, error)
    throw error
  }
}

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

export default {
  getMyDependents,
  createDependent,
  getDependent,
  updateDependent,
  deleteDependent,
  promoteDependent,
  addDependentLogin,
  toggleDependentAIAccess,
  updateDependentAIFeatures
}
