/**
 * Extracted from sis/PriorLearningPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import {
  ACCEPT_ATTR, MAX_FILES, isSupported, kindFor, prettySize,
} from '../../../utils/priorLearningFiles'
import api from '../../../services/api'
import { toast } from 'react-hot-toast'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import inputClass from './inputClass'

/**
 * The office filing a record itself: a transcript that came from the school it
 * came from, not from the family.
 *
 * One panel, one save. It creates the record and uploads every file behind that
 * one press, because "create the record, then attach the documents" is two
 * steps that only exist for the database's benefit — a half-filed record with
 * no evidence is worth nothing to anybody.
 *
 * The record opens in review (the office is already looking at it), so it is
 * immediately analyzable, acceptable and transcribable like any other.
 */
const ReceivedTranscriptForm = ({ orgId, onClose, onFiled }) => {
  const [students, setStudents] = useState(null)   // null while loading
  const [studentId, setStudentId] = useState('')
  const [school, setSchool] = useState('')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [staged, setStaged] = useState([])
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef(null)

  useEffect(() => {
    api.get(`/api/sis/prior-learning/students${orgId ? `?organization_id=${orgId}` : ''}`)
      .then((r) => setStudents(r.data?.students || []))
      .catch(() => { setStudents([]); toast.error('Could not load the student list') })
  }, [orgId])

  const addFiles = (fileList) => {
    const all = Array.from(fileList || [])
    if (!all.length) return
    const incoming = all.filter(isSupported)
    const refused = all.filter((f) => !isSupported(f))
    if (refused.length) {
      toast.error(`Can’t use ${refused.map((f) => f.name).join(', ')} — try a PDF, a photo, or a CSV.`)
    }
    if (!incoming.length) return
    setStaged((current) => {
      const room = MAX_FILES - current.length
      if (room <= 0) {
        toast.error(`You can upload ${MAX_FILES} documents at a time`)
        return current
      }
      if (incoming.length > room) {
        toast.error(`Only the first ${room} were added — ${MAX_FILES} at a time`)
      }
      return [...current, ...incoming.slice(0, room)]
    })
  }

  const save = async () => {
    if (!studentId) { toast.error('Choose which student this is for'); return }
    if (!staged.length) { toast.error('Add at least one document'); return }
    setSaving(true)
    try {
      // Never an untitled row in the queue: the school's name is what a
      // reviewer scanning the list actually recognizes, so it is the fallback
      // before the file name.
      const named = title.trim()
        || (school.trim() ? `Transcript from ${school.trim()}` : staged[0].name)
      const created = await api.post('/api/sis/prior-learning', {
        organization_id: orgId || undefined,
        student_user_id: studentId,
        title: named,
        provider: school.trim() || undefined,
        description: note.trim() || undefined,
      })
      const recordId = created.data?.record?.id
      if (!recordId) throw new Error('no record')

      const failed = []
      for (const file of staged) {
        const data = new FormData()
        data.append('evidence_type', kindFor(file))
        data.append('file', file)
        if (orgId) data.append('organization_id', orgId)
        try {
          await api.post(
            `/api/sis/prior-learning/${recordId}/evidence${orgId ? `?organization_id=${orgId}` : ''}`,
            data)
        } catch (err) {
          failed.push({ name: file.name, reason: err.response?.data?.error })
        }
      }

      if (failed.length === staged.length) {
        // The record exists and is in the queue with nothing on it. Say so, and
        // leave it visible — "+ Add a document" on the card is how it's fixed,
        // and claiming success over an empty record is how it gets forgotten.
        toast.error(failed[0].reason
          ? `Record created, but nothing uploaded — ${failed[0].reason}`
          : 'Record created, but no document uploaded. Add one from the record.')
      } else if (failed.length) {
        toast.error(`Uploaded, except: ${failed
          .map((f) => (f.reason ? `${f.name} (${f.reason})` : f.name)).join(', ')}`)
      } else {
        toast.success(staged.length === 1 ? 'Transcript filed' : `${staged.length} documents filed`)
      }
      onFiled()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not file this record')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Upload a transcript you received</h2>
          <p className="text-sm text-gray-600 mt-0.5">
            For paperwork that came to the school directly. It goes into review with
            the family’s submissions and is credited the same way.
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-sm text-gray-500 shrink-0">
          Cancel
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="pl-student">
            Student
          </label>
          <select id="pl-student" className={inputClass} value={studentId}
                  disabled={students === null}
                  onChange={(e) => setStudentId(e.target.value)}>
            <option value="">
              {students === null ? 'Loading students…' : 'Choose a student'}
            </option>
            {(students || []).map((s) => (
              <option key={s.student_id} value={s.student_id}>
                {s.name}
                {s.enrollment_status && s.enrollment_status !== 'active'
                  ? ` (${s.enrollment_status.replace('_', ' ')})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="pl-school">
            School it came from
          </label>
          <input id="pl-school" className={inputClass} value={school}
                 placeholder="Riverside High School"
                 onChange={(e) => setSchool(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="pl-title">
            Title <span className="text-gray-400">(optional)</span>
          </label>
          <input id="pl-title" className={inputClass} value={title}
                 placeholder={school.trim() ? `Transcript from ${school.trim()}` : 'Transcript'}
                 onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="pl-note">
            Note <span className="text-gray-400">(optional)</span>
          </label>
          <input id="pl-note" className={inputClass} value={note}
                 placeholder="Mailed 8/28, sealed copy on file"
                 onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <div onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
           onDragLeave={() => setDragging(false)}
           onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer?.files) }}
           className={`rounded-lg border-2 border-dashed p-5 text-center ${
             dragging ? 'border-optio-purple bg-purple-50' : 'border-gray-300'}`}>
        <p className="text-sm text-gray-600">
          Drop the transcript here, or
        </p>
        <button type="button" onClick={() => fileInput.current?.click()}
                className="mt-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300">
          Choose files
        </button>
        <input ref={fileInput} type="file" multiple className="sr-only" accept={ACCEPT_ATTR}
               aria-label="Choose documents to upload"
               onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
        <p className="text-xs text-gray-500 mt-2">PDFs, photos, Word documents or CSV exports</p>
      </div>

      {staged.length > 0 && (
        <ul className="space-y-1">
          {staged.map((file, i) => (
            <li key={`${file.name}-${i}`}
                className="flex items-center justify-between gap-3 text-sm bg-gray-50 rounded-lg px-3 py-2">
              <span className="truncate text-gray-800">{file.name}</span>
              <span className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-gray-500">{prettySize(file.size)}</span>
                <button type="button" className="text-xs text-gray-500 hover:text-red-600"
                        aria-label={`Remove ${file.name}`}
                        onClick={() => setStaged((c) => c.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <button type="button" disabled={saving || !studentId || !staged.length} onClick={save}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink disabled:opacity-50">
        {saving ? 'Uploading…' : 'File for review'}
      </button>
    </div>
  )
}

export default ReceivedTranscriptForm
