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
 * Adding needs ONLY an email (2026-07-29): the teacher fills in their own name
 * and bio when they set their password, so an admin never has to know how
 * someone spells their name to invite them.
 *
 * That removed the old name-match guard against duplicating a placeholder
 * teacher (a schedule-import row holding class assignments) — with no name
 * typed there is nothing to match on. In its place, when the org still has
 * unlinked placeholders the add form names them and points at "Link their
 * account", which is what carries their classes across. The backend match still
 * runs for callers that do send a name.
 *
 * Pass `initial` (a staff row from /api/sis/staff) to edit an existing member.
 */

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent'

export default function TeacherModal({ orgId, onClose, onSaved, initial = null, placeholders = [] }) {
  const isEdit = Boolean(initial)
  const [formData, setFormData] = useState({
    first_name: initial?.first_name || '',
    last_name: initial?.last_name || '',
    email: initial?.email || '',
    phone_number: initial?.phone_number || '',
    bio: initial?.bio || '',
  })
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(initial?.avatar_url || null)
  const [templates, setTemplates] = useState([])
  const [onboardingTemplateId, setOnboardingTemplateId] = useState('')
  const [placeholderMatch, setPlaceholderMatch] = useState(null)
  // The entered email already has an Optio account (usually a parent here).
  const [existingAccount, setExistingAccount] = useState(null)
  // Placeholder chosen on the add form: submitting links to them instead of
  // creating a second record for the same person.
  const [linkTarget, setLinkTarget] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    return () => {
      if (photoFile && photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoFile, photoPreview])

  useEffect(() => {
    if (initial) {
      setFormData({
        first_name: initial.first_name || '',
        last_name: initial.last_name || '',
        email: initial.email || '',
        phone_number: initial.phone_number || '',
        bio: initial.bio || '',
      })
      setPhotoPreview(initial.avatar_url || null)
    }
  }, [initial])

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
        phone_number: formData.phone_number.trim(),
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
      // One person, one login: offer the teacher role on the account they have.
      if (data.existing_account) {
        setExistingAccount(data.existing_account)
        setSubmitting(false)
        return
      }
      const staffId = data.teacher?.id
      if (photoFile && staffId) await uploadPhoto(staffId)
      if (data.email_sent === false) {
        toast.error('Teacher added, but the set-password email could not be sent. Ask them to use "Forgot password" on the login page.', { duration: 8000 })
      } else if (data.onboarding_assigned) {
        toast.success('Invite sent — they’ll add their name when they set their password, and their onboarding checklist is ready')
      } else {
        toast.success('Invite sent — they’ll add their name when they set their password')
      }
      onSaved()
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not save teacher')
      setSubmitting(false)
    }
  }

  // Link the entered email to a placeholder instead of creating a new account,
  // so the placeholder's classes carry over. Called from the decision screen
  // (backend name match) and from the picker on the add form.
  const linkToPlaceholder = async (ph = placeholderMatch) => {
    setSubmitting(true)
    setError('')
    try {
      const r = await api.post(`/api/sis/staff/${ph.id}/link`, {
        email: formData.email.trim(), organization_id: orgId,
      })
      const data = r.data || {}
      await assignOnboarding(data.staff_id)
      if (data.linked === 'merged') {
        if (data.placeholder_removed === false) {
          toast('Linked to their existing account, but the old placeholder row could not be removed — refresh and remove it if it lingers.',
            { icon: '⚠️', duration: 9000 })
        } else {
          toast.success(`${ph.name} is now linked to their existing Optio account`)
        }
      } else if (data.email_sent === false) {
        toast.error('Account linked, but the set-password email could not be sent. Ask them to use "Forgot password" on the login page.', { duration: 8000 })
      } else {
        toast.success(`Invite sent — ${ph.name} will get an email with setup instructions`)
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
    if (!formData.email.trim()) {
      setError('Email is required')
      return
    }
    // Adding a teacher needs nothing but an email — they supply their own name
    // and bio when they set their password. Editing still requires a name,
    // because by then there is one to keep.
    if (isEdit && (!formData.first_name.trim() || !formData.last_name.trim())) {
      setError('First and last name are required')
      return
    }
    if (isEdit) {
      setSubmitting(true)
      try {
        await api.patch(`/api/sis/staff/${initial.id}`, {
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          email: formData.email.trim(),
          phone_number: formData.phone_number.trim(),
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
    // The admin named who this is on the staff list — link rather than create,
    // which is the whole difference between Julia keeping her twelve classes
    // and a second Julia starting from zero.
    const chosen = placeholders.find((p) => p.id === linkTarget)
    if (chosen) {
      linkToPlaceholder(chosen)
      return
    }
    createTeacher(false)
  }

  // Give the teacher role to the account this email already belongs to, rather
  // than failing with "a user with this email already exists". Their existing
  // roles are kept, so a parent who teaches stays a parent too.
  const grantTeacherRole = async () => {
    setSubmitting(true)
    setError('')
    try {
      const r = await api.post('/api/sis/staff/grant-role', {
        user_id: existingAccount.id,
        bio: formData.bio,
        onboarding_template_id: onboardingTemplateId || null,
        organization_id: orgId,
      })
      const data = r.data || {}
      if (photoFile) await uploadPhoto(existingAccount.id)
      toast.success(`${existingAccount.name} is now a teacher here — they keep their existing login`
        + (data.onboarding_assigned ? ', and their onboarding checklist is ready' : ''))
      onSaved()
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not add the teacher role')
      setSubmitting(false)
    }
  }

  // ── Existing-account decision screen ─────────────────────────────────────
  if (existingAccount) {
    const roles = (existingAccount.roles || []).filter(Boolean)
    // "a parent", "an admin", "a parent and an observer" — or nothing to name.
    const roleLabel = roles.length
      ? roles.map((r) => (r === 'org_admin' ? 'an admin' : `a ${r}`)).join(' and ')
      : null
    return (
      <ModalOverlay onClose={onClose}>
        <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center">
                <LinkIcon className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">They already have an account</h2>
            </div>
            <button type="button" onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
              <span className="font-medium">{existingAccount.email}</span>
              {roleLabel ? ` is already ${roleLabel} here.` : ' already has an Optio account.'}{' '}
              Making <span className="font-semibold">{existingAccount.name}</span> a teacher adds the
              role to that account: they keep everything they have now, sign in exactly as before,
              and gain the teacher portal.
            </div>
            <p className="text-sm text-neutral-500">
              No second account is created, so their family records and their teaching stay on one login.
            </p>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          </div>
          <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
            <button type="button" disabled={submitting} onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button type="button" disabled={submitting} onClick={grantTeacherRole}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {submitting ? 'Adding…' : 'Make them a teacher'}
            </button>
          </div>
        </div>
      </ModalOverlay>
    )
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

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input type="email" id="email" name="email" value={formData.email}
                onChange={handleChange} placeholder="teacher@school.org" className={inputClass}
                required autoFocus={!isEdit} />
              {!isEdit && (
                <p className="text-xs text-gray-400 mt-1">
                  That’s all you need. They’ll get an email to set their password, and add their
                  own name and bio when they do.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700 mb-1">
                Phone {!isEdit && <span className="text-gray-400 font-normal">(optional)</span>}
              </label>
              <input type="tel" id="phone_number" name="phone_number" value={formData.phone_number}
                onChange={handleChange} placeholder="801-555-0100" className={inputClass} />
            </div>

            {/* Replaces the old name-match guard: with no name typed we can't
                detect the duplicate, so the people it could be are offered
                here. iCreate, 2026-08-01: "I messed up and invited Julia 'ADD
                TEACHER' instead of inviting her from her card that was already
                created!" — the previous version of this said the same thing in
                prose and sent the admin to another screen to act on it. Now the
                choice is on the form that would otherwise make the duplicate. */}
            {!isEdit && placeholders.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <label htmlFor="link-placeholder" className="block text-sm font-medium text-amber-900 mb-1">
                  Is this someone already on the staff list?
                </label>
                <select
                  id="link-placeholder"
                  value={linkTarget}
                  onChange={(e) => setLinkTarget(e.target.value)}
                  className={inputClass}
                >
                  <option value="">No — this is a new teacher</option>
                  {placeholders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.class_count ? ` — ${p.class_count} class${p.class_count === 1 ? '' : 'es'}` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-amber-800 mt-1.5">
                  {linkTarget
                    ? 'This email will be attached to their existing card, so their classes come with them.'
                    : `${placeholders.length === 1 ? 'One teacher is' : `${placeholders.length} teachers are`} set up without a login. Adding a second record for one of them would leave their classes on the old card.`}
                </p>
              </div>
            )}

            {/* Name and bio are the teacher's to fill in, so these only appear
                when editing someone who already has an account. */}
            {isEdit && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-1">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input type="text" id="first_name" name="first_name" value={formData.first_name}
                      onChange={handleChange} className={inputClass} required />
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
                  <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                  <textarea id="bio" name="bio" value={formData.bio} onChange={handleChange}
                    placeholder="A short introduction families will see"
                    rows={4} className={`${inputClass} resize-none`} />
                </div>
              </>
            )}

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
              {submitting ? 'Saving...'
                : isEdit ? 'Save changes'
                : linkTarget ? `Link ${placeholders.find((p) => p.id === linkTarget)?.name || 'their'} account`
                : 'Add Teacher'}
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  )
}
