/**
 * The one class form: the fields (ClassFieldsEditor), the validation, the
 * create-time registration choice and the submit. CreateClassModal is the
 * dialog around it for a new class; the class record's Details tab renders it
 * in place to edit one. It used to be CreateClassModal's `embedded` mode, so
 * the detail modal mounted a modal inside a modal to get at the form
 * (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, G4; M13d).
 */
import React, { useEffect, useState } from 'react'
import ClassFieldsEditor from './ClassFieldsEditor'
import { toDraft, draftToPayload, numOrUndef } from './classFields'

export default function ClassForm({ onCancel = null, onSubmit, initial = null, staff = [], timeBlocks = [], rooms = [], roomOccupancy = {}, inline = false }) {
  const isEdit = Boolean(initial)

  const [draft, setDraft] = useState(() => toDraft(initial || {}))
  // The DB defaults new classes to closed, which hides them from families --
  // make it an explicit, visible choice at creation (default: open). Editing
  // leaves it alone: the class list's toggle owns it.
  const [registrationOpen, setRegistrationOpen] = useState(
    initial ? initial.registration_status === 'open' : true,
  )
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(initial?.image_url || null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => () => {
    // Only object URLs (new uploads) need revoking, not an existing image_url.
    if (imageFile && imagePreview) URL.revokeObjectURL(imagePreview)
  }, [imageFile, imagePreview])

  const update = (patch) => setDraft((prev) => ({ ...prev, ...patch }))

  const pickImage = (file) => {
    if (imageFile && imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const removeImage = () => {
    if (imageFile && imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImagePreview(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!draft.name.trim()) {
      setError('Class name is required')
      return
    }
    const ageMin = numOrUndef(draft.min_age)
    const ageMax = numOrUndef(draft.max_age)
    if (ageMin !== undefined && ageMax !== undefined && ageMin > ageMax) {
      setError('Minimum age cannot be greater than maximum age')
      return
    }
    if (draft.days_of_week.length && (!draft.start_time || !draft.duration_minutes)) {
      setError(timeBlocks.length
        ? 'Pick a starting block for the selected days'
        : 'Add a start time and duration for the selected days')
      return
    }

    const payload = {
      ...draftToPayload(draft),
      ...(isEdit ? {} : { registration_status: registrationOpen ? 'open' : 'closed' }),
    }

    setSubmitting(true)
    try {
      await onSubmit(payload, imageFile)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={inline ? '' : 'flex flex-col min-h-0 flex-1'}>
      <div className={inline ? 'space-y-4' : 'p-4 space-y-4 overflow-y-auto'}>
        <ClassFieldsEditor
          draft={draft}
          onChange={update}
          staff={staff}
          timeBlocks={timeBlocks}
          rooms={rooms}
          roomOccupancy={roomOccupancy}
          imagePreview={imagePreview}
          onImageChange={pickImage}
          onImageRemove={removeImage}
        />

        {!isEdit && (
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={registrationOpen}
              onChange={(e) => setRegistrationOpen(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
            <span>
              <span className="block text-sm font-medium text-gray-700">Open for registration</span>
              <span className="block text-xs text-gray-500">
                Uncheck to keep this class hidden from families until you open it from the Classes list.
              </span>
            </span>
          </label>
        )}

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </div>

      <div className={inline
        ? 'flex items-center justify-end gap-3 pt-4 mt-2 border-t border-gray-100'
        : 'flex items-center justify-end gap-3 p-4 border-t border-gray-200 shrink-0'}>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
        )}
        <button type="submit" disabled={submitting || !draft.name.trim()}
          className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
          {submitting ? 'Saving...' : isEdit ? 'Save changes' : 'Create Class'}
        </button>
      </div>
    </form>
  )
}
