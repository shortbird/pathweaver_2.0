import React, { useEffect, useState } from 'react'
import { AcademicCapIcon, XMarkIcon } from '@heroicons/react/24/outline'
import ModalOverlay from '../ui/ModalOverlay'
import ClassFieldsEditor from './ClassFieldsEditor'
import { toDraft, draftToPayload, numOrUndef } from './classFields'

/**
 * Create (or edit) a class.
 *
 * The FIELDS are ClassFieldsEditor — the same grid the class list's inline row
 * editor uses. They used to be two hand-maintained copies differing by two
 * fields and by which bugs each had; iCreate could set an assistant teacher in
 * one and watch it vanish on save (2026-08-06). This component is now the modal
 * shell around that grid: validation, the create-time registration choice, and
 * the submit.
 *
 * Re-exports the day/time helpers it used to own from ./classFields, so existing
 * importers keep working.
 */

export {
  hhmm, minutesBetween, blockMinutes, blockLabel, addMin, fmt12ap,
  blockEndOptions, meetingsToForm,
} from './classFields'

export default function CreateClassModal({ onClose, onSubmit, initial = null, staff = [], embedded = false, timeBlocks = [] }) {
  const isEdit = Boolean(initial)

  const [draft, setDraft] = useState(() => toDraft(initial || {}))
  // The DB defaults new classes to closed, which hides them from families —
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

  // Embedded mode renders just the form (fields + Save) inside a host modal.
  const form = (
    <form onSubmit={handleSubmit} className={embedded ? '' : 'flex flex-col min-h-0 flex-1'}>
      <div className={embedded ? 'space-y-4' : 'p-4 space-y-4 overflow-y-auto'}>
        <ClassFieldsEditor
          draft={draft}
          onChange={update}
          staff={staff}
          timeBlocks={timeBlocks}
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

      <div className={embedded
        ? 'flex items-center justify-end gap-3 pt-4 mt-2 border-t border-gray-100'
        : 'flex items-center justify-end gap-3 p-4 border-t border-gray-200 shrink-0'}>
        {!embedded && (
          <button type="button" onClick={onClose}
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

  if (embedded) return form

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center">
              <AcademicCapIcon className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Class' : 'Create Class'}</h2>
          </div>
          <button type="button" onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        {form}
      </div>
    </ModalOverlay>
  )
}
