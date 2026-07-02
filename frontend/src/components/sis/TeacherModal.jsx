import React, { useEffect, useState } from 'react'
import { XMarkIcon, UserCircleIcon, PhotoIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { ModalOverlay } from '../ui'

/**
 * TeacherModal — add or edit a teacher on the SIS Staff page.
 *
 * Collects: first/last name, email, bio, and a photo. Creating a teacher makes
 * the account (org advisor) and sends them a set-password email; the photo is
 * uploaded separately once the account exists.
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
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    return () => {
      if (photoFile && photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoFile, photoPreview])

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
    setSubmitting(true)
    try {
      const body = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email.trim(),
        bio: formData.bio,
        organization_id: orgId,
      }
      let staffId = initial?.id
      let emailSent = true
      if (isEdit) {
        await api.patch(`/api/sis/staff/${staffId}`, body)
      } else {
        const r = await api.post('/api/sis/staff', body)
        staffId = r.data?.teacher?.id
        emailSent = r.data?.email_sent !== false
      }
      if (photoFile && staffId) await uploadPhoto(staffId)
      if (isEdit) toast.success('Teacher updated')
      else if (emailSent) toast.success('Teacher added — they’ll get an email to set their password')
      else toast.error('Teacher added, but the set-password email could not be sent. Ask them to use "Forgot password" on the login page.', { duration: 8000 })
      onSaved()
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not save teacher')
    } finally {
      setSubmitting(false)
    }
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
