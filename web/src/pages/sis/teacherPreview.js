/**
 * Teacher-portal preview for SIS admins ("View portal" on the Staff page).
 *
 * While active, the SIS chrome renders the teacher nav and the portal pages
 * fetch the selected teacher's data via the admin-only ?teacher_id= param.
 * Preview is read-only by design: action buttons (clock in/out, submit form,
 * check off items) are hidden, because those writes would be recorded against
 * the admin, not the teacher. Stored in sessionStorage so it ends with the tab.
 */

const KEY = 'sis_teacher_preview'

export const getPreviewTeacher = () => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY))
  } catch {
    return null
  }
}

export const setPreviewTeacher = (teacher) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ id: teacher.id, name: teacher.name }))
  } catch { /* ignore */ }
}

export const clearPreviewTeacher = () => {
  try {
    sessionStorage.removeItem(KEY)
  } catch { /* ignore */ }
}

/** Append &teacher_id= to a SIS API path when a preview is active. */
export const withPreview = (path, preview) => {
  if (!preview?.id) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}teacher_id=${encodeURIComponent(preview.id)}`
}
