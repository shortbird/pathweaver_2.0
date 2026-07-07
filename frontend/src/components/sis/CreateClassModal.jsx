import React, { useState, useEffect } from 'react'
import { XMarkIcon, AcademicCapIcon, PhotoIcon } from '@heroicons/react/24/outline'
import { ModalOverlay } from '../ui'
import SearchSelect from '../ui/SearchSelect'

/**
 * CreateClassModal — create or edit a SIS class.
 *
 * Collects: name, description, image, teacher (from the org's staff), meeting days
 * (Mon-Fri), start time, duration (minutes), capacity (max students), optional
 * supply fee, and an age range.
 *
 * onSubmit(payload, imageFile) is called by the caller, which creates/updates the
 * class, reconciles its meetings, and uploads the image (needs the class id).
 *
 * Pass `initial` (a hydrated class incl. `meetings`) to edit an existing class.
 * Pass `staff` (rows from /api/sis/staff) to enable the teacher picker.
 */

const DAY_OPTIONS = [
  { code: 'mon', label: 'Mon' },
  { code: 'tue', label: 'Tue' },
  { code: 'wed', label: 'Wed' },
  { code: 'thu', label: 'Thu' },
  { code: 'fri', label: 'Fri' },
]

// SIS day_of_week convention: 0=Sun..6=Sat. The form only offers Mon-Fri.
const CODE_TO_DOW = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 }
const DOW_TO_CODE = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri' }

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent'

export const hhmm = (t) => (t ? String(t).slice(0, 5) : '')

export const minutesBetween = (start, end) => {
  if (!start || !end) return ''
  const [sh, sm] = hhmm(start).split(':').map(Number)
  const [eh, em] = hhmm(end).split(':').map(Number)
  if ([sh, sm, eh, em].some(Number.isNaN)) return ''
  return (eh * 60 + em) - (sh * 60 + sm)
}

export const blockMinutes = (b) => minutesBetween(b.start, b.end) || 60
const fmt12 = (t) => {
  const [h, m] = hhmm(t).split(':').map(Number)
  if (Number.isNaN(h)) return ''
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}`
}
export const blockLabel = (b) => `${fmt12(b.start)}–${fmt12(b.end)}`

const toMin = (t) => {
  const [h, m] = hhmm(t).split(':').map(Number)
  return Number.isNaN(h) ? null : h * 60 + (m || 0)
}
// "HH:MM" start + duration minutes -> "HH:MM" end.
export const addMin = (t, mins) => {
  const total = (toMin(t) ?? 0) + Number(mins || 0)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
// 12h time with am/pm, for end-time choices shown outside a block-pill context.
export const fmt12ap = (t) => {
  const [h, m] = hhmm(t).split(':').map(Number)
  if (Number.isNaN(h)) return ''
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`
}
// End-time choices for a class starting at `start`: the end of that block and of
// every later teaching block — long classes span multiple blocks (a 2-hour class,
// a full school day). Label-only blocks (e.g. Lunch) aren't valid end points, and
// a pre-existing custom end time stays selectable so opening the editor never
// silently changes a class.
export const blockEndOptions = (timeBlocks, start, currentEnd = null) => {
  const s = toMin(start)
  if (s == null) return []
  const ends = timeBlocks
    .filter((b) => !b.label && toMin(b.end) != null && toMin(b.end) > s)
    .map((b) => hhmm(b.end))
  if (currentEnd && toMin(currentEnd) > s && !ends.includes(hhmm(currentEnd))) ends.push(hhmm(currentEnd))
  return [...new Set(ends)].sort((a, b) => toMin(a) - toMin(b))
}

// Derive the form's single {days, start_time, duration} from a class's meetings.
export const meetingsToForm = (meetings = []) => {
  const days = meetings.map((m) => DOW_TO_CODE[m.day_of_week]).filter(Boolean)
  const first = meetings[0]
  return {
    days_of_week: [...new Set(days)],
    start_time: first ? hhmm(first.start_time) : '',
    duration_minutes: first ? String(minutesBetween(first.start_time, first.end_time)) : '',
  }
}

export default function CreateClassModal({ onClose, onSubmit, initial = null, staff = [], embedded = false, timeBlocks = [] }) {
  const isEdit = Boolean(initial)
  const seed = initial ? meetingsToForm(initial.meetings) : null

  const [formData, setFormData] = useState({
    name: initial?.name || '',
    description: initial?.description || '',
    primary_instructor_id: initial?.primary_instructor_id || '',
    location: initial?.location || '',
    days_of_week: seed?.days_of_week || [],
    start_time: seed?.start_time || '',
    duration_minutes: seed?.duration_minutes || '',
    max_students: initial?.capacity != null ? String(initial.capacity) : '',
    tuition: initial?.price_cents != null ? String(initial.price_cents / 100) : '',
    supply_fee: initial?.supply_fee != null ? String(initial.supply_fee) : '',
    age_min: initial?.min_age != null ? String(initial.min_age) : '',
    age_max: initial?.max_age != null ? String(initial.max_age) : '',
  })
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(initial?.image_url || null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    return () => {
      // Only object URLs (new uploads) need revoking, not the existing image_url.
      if (imageFile && imagePreview) URL.revokeObjectURL(imagePreview)
    }
  }, [imageFile, imagePreview])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const toggleDay = (code) => {
    setFormData((prev) => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(code)
        ? prev.days_of_week.filter((d) => d !== code)
        : [...prev.days_of_week, code],
    }))
  }

  const handleImageChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (imageFile && imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const removeImage = () => {
    if (imageFile && imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImagePreview(null)
  }

  const numOrUndef = (v) => (v === '' || v === null ? undefined : Number(v))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!formData.name.trim()) {
      setError('Class name is required')
      return
    }
    const ageMin = numOrUndef(formData.age_min)
    const ageMax = numOrUndef(formData.age_max)
    if (ageMin !== undefined && ageMax !== undefined && ageMin > ageMax) {
      setError('Minimum age cannot be greater than maximum age')
      return
    }
    if (formData.days_of_week.length && (!formData.start_time || !formData.duration_minutes)) {
      setError(timeBlocks.length
        ? 'Pick a starting block for the selected days'
        : 'Add a start time and duration for the selected days')
      return
    }

    const dow = formData.days_of_week.map((c) => CODE_TO_DOW[c]).filter((n) => n != null)
    const payload = {
      name: formData.name.trim(),
      description: formData.description,
      location: formData.location.trim() || null,
      primary_instructor_id: formData.primary_instructor_id || null,
      days_of_week: dow,                          // SIS day_of_week ints (0=Sun..6=Sat)
      start_time: formData.start_time || undefined,
      duration_minutes: numOrUndef(formData.duration_minutes),
      capacity: numOrUndef(formData.max_students),
      price_cents: formData.tuition === '' ? null : Math.round(Number(formData.tuition) * 100),
      supply_fee: numOrUndef(formData.supply_fee),
      min_age: ageMin,
      max_age: ageMax,
    }

    setSubmitting(true)
    try {
      await onSubmit(payload, imageFile)
    } finally {
      setSubmitting(false)
    }
  }

  // Embedded mode renders just the form (fields + Save) inside a host modal —
  // same pattern as CourseEnrollmentManager's embedded mode.
  const form = (
        <form onSubmit={handleSubmit} className={embedded ? '' : 'flex flex-col min-h-0 flex-1'}>
          <div className={embedded ? 'space-y-4' : 'p-4 space-y-4 overflow-y-auto'}>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Class Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text" id="name" name="name" value={formData.name} onChange={handleChange}
                placeholder="e.g., Intro to Robotics" className={inputClass} required autoFocus
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                id="description" name="description" value={formData.description} onChange={handleChange}
                placeholder="What students will do in this class" rows={3} className={`${inputClass} resize-none`}
              />
            </div>

            {/* Image */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Class Image</label>
              {imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} alt="Class preview" className="w-full h-40 object-cover rounded-lg border border-gray-200" />
                  <button type="button" onClick={removeImage}
                    className="absolute top-2 right-2 p-1.5 bg-white/90 text-gray-600 hover:text-gray-900 rounded-full shadow">
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label htmlFor="class-image"
                  className="flex flex-col items-center justify-center gap-1.5 w-full h-28 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-optio-purple hover:bg-gray-50 transition-colors">
                  <PhotoIcon className="w-7 h-7 text-gray-400" />
                  <span className="text-sm text-gray-500">Click to upload an image (max 5MB)</span>
                  <span className="text-xs text-gray-400">Best: wide landscape, about 1400×500px — shown center-cropped</span>
                </label>
              )}
              <input id="class-image" type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
            </div>

            {/* Teacher */}
            {staff.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
                <SearchSelect
                  value={formData.primary_instructor_id}
                  onChange={(id) => setFormData((prev) => ({ ...prev, primary_instructor_id: id }))}
                  options={staff}
                  getId={(s) => s.id}
                  getLabel={(s) => s.name}
                  placeholder="Search staff…"
                />
              </div>
            )}

            {/* Days of week */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Days Offered</label>
              <div className="flex gap-2">
                {DAY_OPTIONS.map((day) => {
                  const selected = formData.days_of_week.includes(day.code)
                  return (
                    <button key={day.code} type="button" onClick={() => toggleDay(day.code)} aria-pressed={selected}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        selected
                          ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white border-transparent'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-optio-purple'
                      }`}>
                      {day.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Time block — classes meet in the school's standard periods. Pills
                pick the starting block; "Ends at" lets a class run past it (a
                2-hour class or a full school day spans several blocks). The
                custom start/duration inputs only exist for orgs WITHOUT blocks. */}
            {timeBlocks.length > 0 ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Starting Block</label>
                <div className="flex flex-wrap gap-2">
                  {timeBlocks.filter((b) => !b.label).map((b, i) => {
                    const selected = formData.start_time === hhmm(b.start)
                    return (
                      <button key={i} type="button" aria-pressed={selected}
                        onClick={() => setFormData((prev) => ({ ...prev, start_time: hhmm(b.start), duration_minutes: String(blockMinutes(b)) }))}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                          selected
                            ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white border-transparent'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-optio-purple'
                        }`}>
                        {blockLabel(b)}
                      </button>
                    )
                  })}
                </div>
                {formData.start_time && (
                  <div className="flex items-center gap-2 mt-2">
                    <label htmlFor="block_end" className="text-sm text-gray-600 shrink-0">Ends at</label>
                    <select id="block_end" className={`${inputClass} !w-auto`}
                      value={addMin(formData.start_time, formData.duration_minutes)}
                      onChange={(e) => setFormData((prev) => ({
                        ...prev, duration_minutes: String(minutesBetween(prev.start_time, e.target.value)),
                      }))}>
                      {blockEndOptions(timeBlocks, formData.start_time, addMin(formData.start_time, formData.duration_minutes)).map((end) => (
                        <option key={end} value={end}>{fmt12ap(end)}</option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-400">Pick a later block's end for a longer class.</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="start_time" className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input type="time" id="start_time" name="start_time" value={formData.start_time} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="duration_minutes" className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
                  <input type="number" id="duration_minutes" name="duration_minutes" value={formData.duration_minutes}
                    onChange={handleChange} min={5} step={5} placeholder="60" className={inputClass} />
                </div>
              </div>
            )}

            {/* Classroom */}
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">Classroom</label>
              <input
                type="text" id="location" name="location" value={formData.location} onChange={handleChange}
                placeholder="e.g., Room 3" className={inputClass}
              />
            </div>

            {/* Max students + Tuition + Supply fee */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="max_students" className="block text-sm font-medium text-gray-700 mb-1">Max Students</label>
                <input type="number" id="max_students" name="max_students" value={formData.max_students}
                  onChange={handleChange} min={1} placeholder="12" className={inputClass} />
              </div>
              <div>
                <label htmlFor="tuition" className="block text-sm font-medium text-gray-700 mb-1">Tuition</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input type="number" id="tuition" name="tuition" value={formData.tuition}
                    onChange={handleChange} min={0} step="0.01" placeholder="0.00" className={`${inputClass} pl-7`} />
                </div>
              </div>
              <div>
                <label htmlFor="supply_fee" className="block text-sm font-medium text-gray-700 mb-1">Supply Fee</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input type="number" id="supply_fee" name="supply_fee" value={formData.supply_fee}
                    onChange={handleChange} min={0} step="0.01" placeholder="0.00" className={`${inputClass} pl-7`} />
                </div>
              </div>
            </div>

            {/* Age range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Age Range</label>
              <div className="flex items-center gap-3">
                <input type="number" name="age_min" aria-label="Minimum age" value={formData.age_min}
                  onChange={handleChange} min={0} placeholder="Min" className={inputClass} />
                <span className="text-gray-400">to</span>
                <input type="number" name="age_max" aria-label="Maximum age" value={formData.age_max}
                  onChange={handleChange} min={0} placeholder="Max" className={inputClass} />
              </div>
            </div>

            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          </div>

          {/* Actions */}
          <div className={embedded
            ? 'flex items-center justify-end gap-3 pt-4 mt-2 border-t border-gray-100'
            : 'flex items-center justify-end gap-3 p-4 border-t border-gray-200 shrink-0'}>
            {!embedded && (
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                Cancel
              </button>
            )}
            <button type="submit" disabled={submitting || !formData.name.trim()}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
              {submitting ? 'Saving...' : isEdit ? 'Save changes' : 'Create Class'}
            </button>
          </div>
        </form>
  )

  if (embedded) return form

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center">
              <AcademicCapIcon className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Class' : 'Create Class'}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        {form}
      </div>
    </ModalOverlay>
  )
}
