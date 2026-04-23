import api from './api'

/**
 * Student-Curated Class API Service.
 *
 * A "student-curated class" is a Course row with course_source='student_curated'.
 * These helpers target the same /api/courses endpoints used by admin Courses, but
 * are scoped to the simpler fields a student form needs and to the invite-link
 * workflow unique to student classes.
 */

const normalizeInt = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

const normalizeFloat = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : null
}

// ==================== Class CRUD ====================

export const createClass = async (form) => {
  const payload = {
    // Explicitly mark this as student-curated so the backend uses the student
    // defaults (visibility=public, org_id=null) even if the caller is a superadmin
    // test-driving the flow.
    course_source: 'student_curated',
    title: form.title,
    description: form.description || null,
    kickoff_at: form.kickoff_at || null,
    kickoff_meeting_url: form.kickoff_meeting_url || null,
    credit_subject: form.credit_subject || null,
    credit_amount: normalizeFloat(form.credit_amount),
    max_cohort_size: normalizeInt(form.max_cohort_size),
  }
  const response = await api.post('/api/courses', payload)
  return response.data
}

export const buildUpdatePayload = (form, { includeTeacherFields = false } = {}) => {
  const payload = {
    title: form.title,
    description: form.description || null,
    kickoff_at: form.kickoff_at || null,
    kickoff_meeting_url: form.kickoff_meeting_url || null,
    credit_subject: form.credit_subject || null,
    credit_amount: normalizeFloat(form.credit_amount),
    max_cohort_size: normalizeInt(form.max_cohort_size),
  }
  if (includeTeacherFields) {
    payload.teacher_bio = form.teacher_bio || null
    payload.teacher_credentials = form.teacher_credentials || null
  }
  return payload
}

export const updateClass = async (id, payload) => {
  const response = await api.put(`/api/courses/${id}`, payload)
  return response.data
}

export const publishClass = async (id) => {
  const response = await api.post(`/api/courses/${id}/publish`, {})
  return response.data
}

export const getClass = async (id) => {
  const response = await api.get(`/api/courses/${id}`)
  return response.data
}

export const submitForReview = async (id) => {
  const response = await api.put(`/api/courses/${id}`, { status: 'pending_review' })
  return response.data
}

export const returnToDraft = async (id) => {
  const response = await api.put(`/api/courses/${id}`, { status: 'draft' })
  return response.data
}

export const listMyClasses = async () => {
  const response = await api.get('/api/courses', { params: { filter: 'mine' } })
  const courses = response.data?.courses || []
  return courses.filter((c) => c.course_source === 'student_curated')
}

// ==================== Quests on a class ====================

export const getClassQuests = async (id) => {
  const response = await api.get(`/api/courses/${id}/quests`)
  return response.data
}

export const addQuestToClass = async (id, questId) => {
  // Student-curated classes require every activity; credit is only awarded on full completion.
  const response = await api.post(`/api/courses/${id}/quests`, {
    quest_id: questId,
    is_required: true,
  })
  return response.data
}

export const removeQuestFromClass = async (id, questId) => {
  const response = await api.delete(`/api/courses/${id}/quests/${questId}`)
  return response.data
}

export const reorderClassQuests = async (id, orderedQuestIds) => {
  const response = await api.put(`/api/courses/${id}/quests/reorder`, {
    ordered_quest_ids: orderedQuestIds,
  })
  return response.data
}

export const searchQuests = async (query, perPage = 20) => {
  // GET /api/quests returns `{ data: [...], meta, links }` (paginated_response shape).
  const response = await api.get('/api/quests', {
    params: { search: query, per_page: perPage },
  })
  return response.data?.data || []
}

// ==================== Invite links ====================

export const createInvite = async (id, options = {}) => {
  const response = await api.post(`/api/courses/${id}/invites`, options)
  return response.data
}

export const listInvites = async (id) => {
  const response = await api.get(`/api/courses/${id}/invites`)
  return response.data
}

export const revokeInvite = async (inviteId) => {
  const response = await api.delete(`/api/courses/invites/${inviteId}`)
  return response.data
}

export const getInvitePreview = async (token) => {
  const response = await api.get(`/api/courses/invites/${token}/preview`)
  return response.data
}

// ==================== Cover image ====================

export const uploadCoverImage = async (id, file) => {
  const formData = new FormData()
  formData.append('image', file)
  const response = await api.post(`/api/courses/${id}/cover-image`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

export const generateCoverImage = async (id) => {
  const response = await api.post(`/api/courses/${id}/cover-image/generate`, {})
  return response.data
}

// ==================== Kickoff attendance ====================

export const getKickoffAttendance = async (id) => {
  const response = await api.get(`/api/courses/${id}/kickoff/attendance`)
  return response.data
}

export const markKickoffAttended = async (id, enrollmentId, attended) => {
  const response = await api.post(`/api/courses/${id}/kickoff/attend`, {
    enrollment_id: enrollmentId,
    attended,
  })
  return response.data
}

// ==================== Helpers ====================

export const buildInviteUrl = (token, slug) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  if (slug) {
    return `${origin}/class/${slug}?invite_token=${encodeURIComponent(token)}`
  }
  return `${origin}/invite/${encodeURIComponent(token)}`
}

export const CREDIT_SUBJECTS = [
  'Language Arts',
  'Mathematics',
  'Science',
  'Social Studies',
  'Health',
  'Physical Education',
  'Art',
  'Music',
  'Foreign Language',
  'Electives',
]

export const CREDIT_AMOUNTS = [0.25, 0.5, 1.0]
