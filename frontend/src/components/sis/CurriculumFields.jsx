import React from 'react'

/**
 * The curriculum entry fields, shared by the admin library editor
 * (CurriculumPage) and the teacher's per-class editor (ClassCurriculumLibrary)
 * so both surfaces are literally the same form. The admin editor adds its
 * multi-class attach selector around these fields; the teacher editor doesn't
 * (the class is implied), but every other field is identical.
 */

export const curriculumInputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent'

export const blankCurriculum = () => ({
  title: '', subject: '', description: '', drive_url: '', notes: '',
})

// Pull the shared fields off an existing entry (leaves class_ids to the caller).
export const curriculumFieldsOf = (entry) => ({
  title: entry?.title || '',
  subject: entry?.subject || '',
  description: entry?.description || '',
  drive_url: entry?.drive_url || '',
  notes: entry?.notes || '',
})

export default function CurriculumFields({ f, set }) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input value={f.title} onChange={(e) => set('title', e.target.value)}
          placeholder="Title (e.g. Reading Workshop)" className={curriculumInputClass} />
        <input value={f.subject} onChange={(e) => set('subject', e.target.value)}
          placeholder="Subject (optional — e.g. Language Arts)" className={curriculumInputClass} />
      </div>
      <input value={f.drive_url} onChange={(e) => set('drive_url', e.target.value)}
        placeholder="Google Drive folder link (optional)" className={curriculumInputClass} />
      <input value={f.description} onChange={(e) => set('description', e.target.value)}
        placeholder="Short description teachers will see (optional)" className={curriculumInputClass} />
      <textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2}
        placeholder="Staff notes (optional)" className={curriculumInputClass} />
    </>
  )
}
