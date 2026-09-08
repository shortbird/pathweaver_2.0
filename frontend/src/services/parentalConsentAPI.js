import api from './api';

/**
 * Parental Consent API Service
 * COPPA compliance: Admin-assisted ID verification
 */

/**
 * Submit parental consent documents for review
 * @param {File} idDocument - Parent's government ID photo
 * @param {File} consentForm - Signed parental consent form
 * @param {string} childId - Optional child ID (defaults to current user)
 * @returns {Promise<Object>} Submission result with status
 */
export const submitConsentDocuments = async (idDocument, consentForm, childId = null) => {
  const formData = new FormData();
  formData.append('id_document', idDocument);
  formData.append('signed_consent_form', consentForm);

  if (childId) {
    formData.append('child_id', childId);
  }

  const response = await api.post('/api/parental-consent/submit-documents', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
};

/**
 * Get parental consent status for a user
 * @param {string} userId - User ID to check
 * @returns {Promise<Object>} Consent status details
 */
export const getConsentStatus = async (userId) => {
  const response = await api.get(`/api/parental-consent/status/${userId}`);
  return response.data;
};

/**
 * Resend parental consent email
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Resend result
 */
export const resendConsentEmail = async (userId) => {
  const response = await api.post('/api/parental-consent/resend', { user_id: userId });
  return response.data;
};

// Admin endpoints

/**
 * Get all pending parental consent reviews (admin only)
 * @returns {Promise<Object>} List of pending reviews
 */
export const getPendingReviews = async () => {
  const response = await api.get('/api/admin/parental-consent/pending');
  return response.data;
};

/**
 * Approve parental consent (admin only)
 * @param {string} childId - Child user ID
 * @param {string} notes - Optional review notes
 * @returns {Promise<Object>} Approval result
 */
export const approveConsent = async (childId, notes = '') => {
  const response = await api.post(`/api/admin/parental-consent/approve/${childId}`, {
    notes,
  });
  return response.data;
};

/**
 * Reject parental consent (admin only)
 * @param {string} childId - Child user ID
 * @param {string} reason - Required rejection reason
 * @returns {Promise<Object>} Rejection result
 */
export const rejectConsent = async (childId, reason) => {
  if (!reason || reason.trim() === '') {
    throw new Error('Rejection reason is required');
  }

  const response = await api.post(`/api/admin/parental-consent/reject/${childId}`, {
    reason,
  });
  return response.data;
};

export default {
  submitConsentDocuments,
  getConsentStatus,
  resendConsentEmail,
  getPendingReviews,
  approveConsent,
  rejectConsent,
};
