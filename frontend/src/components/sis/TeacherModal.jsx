import React, { useEffect, useState } from 'react'
import { XMarkIcon, UserCircleIcon, PhotoIcon, LinkIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { ModalOverlay } from '../ui'

/**
 * TeacherModal — add or edit a teacher on the SIS Staff page.
 *
 * Collects: first/last name, email, bio, a photo, and (when adding) an optional
 * onboarding checklist to assign so the teacher lands in the portal with it
 * ready. Creating a teacher makes the account (org advisor) and sends them a
 * set-password email; the photo is uploaded separately once the account exists.
 *
 * If a placeholder teacher of the same name already exists (a schedule-import
 * row that holds class assignments), the create is intercepted and the admin is
 * offered to LINK that account instead of creating a duplicate that would strand
 * the placeholder's classes.
 *
 * Pass `initial` (a staff row from /api/sis/staff) to edit an existing member.
 */

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent'

export default function TeacherModal({ orgId, onClose, onSaved, initial = null }) {
  const isEdit = Boolean(initial)
  const [formData, setFormData] = useState({
    first_name: initial?.first_name || '',
    last_name: initial?.last_name || '',
    email: initial?.email || '',
    bio: initial?.bio || '',
  })
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(initial?.avatar_url || null)
  const [templates, setTemplates] = useState([])
  const [onboardingTemplateId, setOnboardingTemplateId] = useState('')
  const [placeholderMatch, setPlaceholderMatch] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    return () => {
      if (photoFile && photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoFile, photoPreview])

  // Load the org's staff onboarding checklists so the admin can assign one at
  // add-time (the whole point of wiring onboarding into the flow). Only when
  // adding — editing a teacher doesn't re-run onboarding.
  useEffect(() => {
    if (isEdit || !orgId) return
    let active = true
    api.get(`/api/sis/staff-admin/onboarding/templates?organization_id=${orgId}`)
      .then((r) => {
        if (!active) return
        const staffTemplates = (r.data?.templates || []).filter((t) => t.audience !== 'family')
        setTemplates(staffTemplates)
        // Default to the first checklist so onboarding actually gets assigned;
        // still visible and changeable (including "No checklist").
        if (staffTemplates.length) setOnboardingTemplateId(staffTemplates[0].id)
      })
      .catch(() => { /* non-fatal: the picker just stays empty */ })
    return () => { active = false }
  }, [isEdit, orgId])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (photoFile && photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const uploadPhoto = async (staffId) => {
    const form = new FormData()
    form.append('file', photoFile)
    await api.post(`/api/sis/staff/${staffId}/photo?organization_id=${orgId}`, form)
  }

  // Best-effort onboarding assignment for the link path (create already assigns
  // it server-side). Never blocks the primary action.
  const assignOnboarding = async (userId) => {
    if (!onboardingTemplateId || !userId) return
    try {
      await api.post('/api/sis/staff-admin/onboarding/assignments', {
        organization_id: orgId, template_id: onboardingTemplateId, user_id: userId,
      })
    } catch { /* non-fatal */ }
  }

  const createTeacher = async (forceNew) => {
    setSubmitting(true)
    try {
      const body = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email.trim(),
        bio: formData.bio,
        organization_id: orgId,
        onboarding_template_id: onboardingTemplateId || null,
        ...(forceNew ? { force_new: true } : {}),
      }
      const r = await api.post('/api/sis/staff', body)
      const data = r.data || {}
      // Same-named placeholder found — pause and let the admin decide.
      if (data.placeholder_match) {
        setPlaceholderMatch(data.placeholder_match)
        setSubmitting(false)
        return
      }
      const staffId = data.teacher?.id
      if (photoFile && staffId) await uploadPhoto(staffId)
      if (data.email_sent === false) {
        toast.error('Teacher added, but the set-password email could not be sent. Ask them to use "Forgot password" on the login page.', { duration: 8000 })
      } else if (data.onboarding_assigned) {
        toast.success('Teacher added — they’ll get a setup email and their onboarding checklist is ready')
      } else {
        toast.success('Teacher added — they’ll get an email with setup instructions')
      }
      onSaved()
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not save teacher')
      setSubmitting(false)
    }
  }

  // Link the entered email to the matched placeholder instead of creating a new
  // account, so the placeholder's classes carry over.
  const linkToPlaceholder = async () => {
    setSubmitting(true)
    setError('')
    try {
      const r = await api.post(`/api/sis/staff/${placeholderMatch.id}/link`, {
        email: formData.email.trim(), organization_id: orgId,
      })
      const data = r.data || {}
      await assignOnboarding(data.staff_id)
      if (data.linked === 'merged') {
        if (data.placeholder_removed === false) {
          toast('Linked to their existing account, but the old placeholder row could not be removed — refresh and remove it if it lingers.',
            { icon: '⚠️', duration: 9000 })
        } else {
          toast.success(`${placeholderMatch.name} is now linked to their existing Optio account`)
        }
      } else if (data.email_sent === false) {
        toast.error('Account linked, but the set-password email could not be sent. Ask them to use "Forgot password" on the login page.', { duration: 8000 })
      } else {
        toast.success(`Invite sent — ${placeholderMatch.name} will get an email with setup instructions`)
      }
      onSaved()
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not link the account')
      setSubmitting(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      setError('First and last name are required')
      return
    }
    if (!formData.email.trim()) {
      setError('Email is required')
      return
    }
    if (isEdit) {
      setSubmitting(true)
      try {
        await api.patch(`/api/sis/staff/${initial.id}`, {
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          email: formData.email.trim(),
          bio: formData.bio,
          organization_id: orgId,
        })
        if (photoFile) await uploadPhoto(initial.id)
        toast.success('Teacher updated')
        onSaved()
      } catch (err) {
        setError(err?.response?.data?.error || 'Could not save teacher')
        setSubmitting(false)
      }
      return
    }
    createTeacher(false)
  }

  // ── Placeholder decision screen ──────────────────────────────────────────
  if (placeholderMatch) {
    const n = placeholderMatch.class_count
    return (
      <ModalOverlay onClose={onClose}>
        <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center">
                <LinkIcon className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">This teacher may already exist</h2>
            </div>
            <button type="button" onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
              <span className="font-semibold">{placeholderMatch.name}</span> already exists as a
              placeholder teacher{n ? ` with ${n} class${n === 1 ? '' : 'es'} assigned` : ''} but
              no login yet. Linking connects <span className="font-medium">{formData.email.trim()}</span> to
              that account so their {n ? 'classes carry over' : 'account is set up'} — creating a new
              teacher instead would leave those classes stranded on the placeholder.
            </div>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          </div>
          <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
            <button type="button" disabled={submitting} onClick={() => createTeacher(true)}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
              No, create a new teacher
            </button>
            <button type="button" disabled={submitting} onClick={linkToPlaceholder}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {submitting ? 'Linking…' : `Link ${placeholderMatch.name}’s account`}
            </button>
          </div>
        </div>
      </ModalOverlay>
    )
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center">
              <UserCircleIcon className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Teacher' : 'Add Teacher'}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="p-4 space-y-4 overflow-y-auto">
            {/* Photo */}
            <div className="flex items-center gap-4">
              {photoPreview ? (
                <img src={photoPreview} alt="Teacher" className="w-20 h-20 rounded-full object-cover border border-gray-200" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 flex items-center justify-center">
                  <PhotoIcon className="w-8 h-8 text-optio-purple/40" />
                </div>
              )}
              <div>
                <label htmlFor="teacher-photo"
                  className="inline-block px-3 py-1.5 text-sm font-medium text-optio-purple border border-optio-purple/40 rounded-lg cursor-pointer hover:bg-optio-purple/5 transition-colors">
                  {photoPreview ? 'Change photo' : 'Upload photo'}
                </label>
                <p className="text-xs text-gray-400 mt-1">JPG or PNG, max 5MB</p>
                <input id="teacher-photo" type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input type="text" id="first_name" name="first_name" value={formData.first_name}
                  onChange={handleChange} className={inputClass} required autoFocus />
              </div>
              <div>
                <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input type="text" id="last_name" name="last_name" value={formData.last_name}
                  onChange={handleChange} className={inputClass} required />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input type="email" id="email" name="email" value={formData.email}
                onChange={handleChange} placeholder="teacher@school.org" className={inputClass} required />
              {!isEdit && (
                <p className="text-xs text-gray-400 mt-1">They’ll receive an email to set their password.</p>
              )}
            </div>

            <div>
              <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
              <textarea id="bio" name="bio" value={formData.bio} onChange={handleChange}
                placeholder="A short introduction families will see"
                rows={4} className={`${inputClass} resize-none`} />
            </div>

            {/* Onboarding checklist (add only) */}
            {!isEdit && (
              <div>
                <label htmlFor="onboarding_template" className="block text-sm font-medium text-gray-700 mb-1">
                  Onboarding checklist
                </label>
                {templates.length ? (
                  <>
                    <select id="onboarding_template" value={onboardingTemplateId}
                      onChange={(e) => setOnboardingTemplateId(e.target.value)} className={inputClass}>
                      <option value="">No onboarding checklist</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}{t.role_type ? ` (${t.role_type})` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      Assigned when the teacher is added; they’ll see it in their portal.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-gray-400">
                    No staff onboarding checklists yet. Create one on the Onboarding page to assign it here.
                  </p>
                )}
              </div>
            )}

            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 shrink-0">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
              {submitting ? 'Saving...' : isEdit ? 'Save changes' : 'Add Teacher'}
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  )
}
