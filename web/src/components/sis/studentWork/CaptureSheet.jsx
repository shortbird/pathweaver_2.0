import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import Button from '../../ui/Button'
import { INPUT_CLASS } from '../../ui/Input'
import { Modal } from '../../ui/Modal'
import usePersistedChoice from '../../../hooks/usePersistedChoice'
import { studentWorkApi } from '../../../hooks/api/useStudentWork'

/**
 * A teacher adds a student's work to one task, and may mark it done (ticket
 * 77637c3a, Apogee Cache Valley: "our chromebooks do not have the ability to
 * take pictures and one kiosk for 30 kids is going to be challenging").
 *
 * Photos and a note go onto the student's task as evidence. "Mark this task
 * done" completes it for them: they get the XP, and it counts as already
 * reviewed, so it never waits in the Submissions inbox. The server decides all
 * of that (services/staff_task_capture.py); this is the form.
 *
 * The toggle remembers the teacher's last choice on this device, because a
 * teacher walking the room makes the same call thirty times.
 */

export const MARK_DONE_KEY = 'sis_capture_mark_done'
const MAX_FILES = 10
const asBool = (v) => (typeof v === 'boolean' ? v : null)

const previewUrl = (file) => {
  try {
    return typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(file) : null
  } catch {
    return null
  }
}

const release = (list) => list.forEach((f) => {
  try { if (f.url) URL.revokeObjectURL(f.url) } catch { /* no object URLs here (jsdom) */ }
})

export const wrapFiles = (fileList) => Array.from(fileList || []).map((file) => ({ file, url: previewUrl(file) }))

export default function CaptureSheet({ orgId, student, task, initialFiles = [], onSaved, onCancel }) {
  const first = (student?.name || '').split(' ')[0] || 'this student'
  const [files, setFiles] = useState(initialFiles)
  const [note, setNote] = useState('')
  const [markDone, setMarkDone] = usePersistedChoice(MARK_DONE_KEY, false, { validate: asBool })
  const [saving, setSaving] = useState(false)
  const cameraRef = useRef(null)
  const uploadRef = useRef(null)

  const filesRef = useRef(files)
  useEffect(() => { filesRef.current = files }, [files])
  useEffect(() => () => release(filesRef.current), [])

  const addFiles = (e) => {
    const picked = wrapFiles(e.target.files)
    e.target.value = ''
    setFiles((prev) => [...prev, ...picked].slice(0, MAX_FILES))
  }

  const save = async () => {
    if (!files.length && !note.trim()) return toast.error('Add a photo or a note')
    setSaving(true)
    try {
      const out = await studentWorkApi.capture(orgId, student.id, task.id, {
        files: files.map((f) => f.file), note, markDone: markDone && !task.done,
      })
      toast.success(out?.completed && !out?.already_done
        ? `Saved and marked done for ${first}`
        : `Saved to ${first}’s task`)
      onSaved?.(out)
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={saving ? () => {} : onCancel} size="md"
      header={(
        <div>
          <p className="text-xs font-medium text-neutral-500">{student.name}</p>
          <h2 className="text-lg font-semibold text-neutral-900">{task.title}</h2>
        </div>
      )}
      bodyClassName="space-y-4"
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={saving || (!files.length && !note.trim())}>
            {markDone && !task.done ? 'Save and mark done' : 'Save'}
          </Button>
        </div>
      )}>
      <section>
        {/* capture="environment" opens the back camera on phones and tablets. */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={addFiles} aria-label="Take a photo" data-testid="sheet-camera-input" />
        <input ref={uploadRef} type="file" accept="image/*,video/*" multiple className="hidden"
          onChange={addFiles} aria-label="Upload photos" data-testid="sheet-upload-input" />
        {files.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <li key={`${f.file.name}-${i}`} className="relative">
                {f.url && (f.file.type || '').startsWith('image')
                  ? <img src={f.url} alt={f.file.name} className="h-20 w-20 rounded-lg object-cover border border-gray-200" />
                  : <span className="flex h-20 w-20 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-1 text-xs text-gray-600 break-all">{f.file.name}</span>}
                <button type="button" aria-label={`Remove ${f.file.name}`}
                  onClick={() => { release([f]); setFiles((prev) => prev.filter((_, idx) => idx !== i)) }}
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white border border-gray-300 text-xs text-gray-700 hover:border-optio-purple">
                  &times;
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => cameraRef.current?.click()}>
            {files.length ? 'Take another' : 'Take a photo'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => uploadRef.current?.click()}>Upload</Button>
        </div>
      </section>

      <label className="block">
        <span className="block text-sm font-medium text-neutral-700">Note (optional)</span>
        <textarea className={`${INPUT_CLASS} mt-1`} rows={2} maxLength={4000} value={note}
          onChange={(e) => setNote(e.target.value)} placeholder="What did they do?" />
      </label>

      {task.done ? (
        <p className="text-sm text-neutral-500">This task is already done. The work is added to it.</p>
      ) : (
        <label className="flex items-start gap-3 rounded-lg bg-gray-50 p-3 cursor-pointer">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-optio-purple" checked={markDone}
            onChange={(e) => setMarkDone(e.target.checked)} />
          <span>
            <span className="block text-sm font-medium text-neutral-900">Mark this task done</span>
            <span className="block text-xs text-neutral-500">
              {first} gets the XP, and it counts as reviewed.
            </span>
          </span>
        </label>
      )}
    </Modal>
  )
}
