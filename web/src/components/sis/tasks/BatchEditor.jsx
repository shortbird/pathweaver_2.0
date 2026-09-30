import React, { useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import ModalOverlay from '../../ui/ModalOverlay'
import { INPUT_CLASS } from '../../ui/Input'
import { StepList, emptyStep } from './AssignComposer'
import { officeTaskApi } from '../../../hooks/api/useTasks'

/**
 * Edit a task that was already sent, for everyone on its card.
 *
 * Ticket 6eeaef78: "I would like to be able to edit tasks." Until this, fixing
 * a typo in a task sent to 30 people meant unassigning all 30 and sending it
 * again, which also threw away whatever they had already done.
 *
 * The fields are the composer's (title, note or directions, due date,
 * priority, and the same StepList). Recipients are not here: moving one
 * person's task is Reassign on their row, and the rest is Delete and send
 * again.
 *
 * Each existing step goes back with its `key`, which is how the server knows
 * it is the same step and keeps the progress people made on it. A step that
 * now asks for more (an upload, a signature, approval) starts over for
 * anyone who had finished it -- the server decides that
 * (sis_tasks_service.merge_steps); the note under the steps says so.
 */

const PRIORITIES = [['', 'Normal'], ['low', 'Low'], ['high', 'High'], ['urgent', 'Urgent']]
const ymd = (v) => (v ? String(v).slice(0, 10) : '')

// The wording and rules of a step, without anybody's progress on it.
const stepOf = (i) => ({
  key: i.key, title: i.title || '', description: i.description || '', link: i.link || '',
  needs_document: !!i.needs_document, needs_signature: !!i.needs_signature,
  needs_approval: !!i.needs_approval, required: i.required !== false,
})

const payloadOf = (s) => ({
  ...(s.key ? { key: s.key } : {}),
  title: s.title.trim(), description: (s.description || '').trim() || null,
  link: (s.link || '').trim() || null, required: s.required !== false,
  needs_document: !!s.needs_document, needs_signature: !!s.needs_signature,
  needs_approval: !!s.needs_approval,
})

export default function BatchEditor({ orgId, batch: b, onClose, onSaved }) {
  const original = useMemo(() => (b.people?.[0]?.items || []).map(stepOf), [b])
  // A one-step task is written the way the composer writes one: the title is
  // the step, and the note rides on the step rather than above it.
  const single = original.length === 1 && original[0].title === b.title
  const [title, setTitle] = useState(b.title || '')
  const [note, setNote] = useState(single ? original[0].description : (b.description || ''))
  const [dueDate, setDueDate] = useState(ymd(b.due_date))
  const [priority, setPriority] = useState(b.priority || '')
  const [needsDocument, setNeedsDocument] = useState(single ? original[0].needs_document : false)
  const [steps, setSteps] = useState(single ? null : original)
  const [busy, setBusy] = useState(false)
  const multiStep = Array.isArray(steps)

  const setStep = (i, fields) => setSteps((prev) =>
    prev.map((s, idx) => (idx === i ? { ...s, ...fields } : s)))
  const filled = (steps || []).filter((s) => s.title.trim())

  const save = async () => {
    if (!title.trim()) { toast.error('Give it a title'); return }
    if (multiStep && !filled.length) { toast.error('Add at least one step'); return }
    const body = { title: title.trim(), priority: priority || null }
    if (multiStep) {
      body.description = note.trim() || null
      body.items = filled.map(payloadOf)
    } else {
      const step = single ? original[0] : emptyStep()
      body.description = null
      body.items = [payloadOf({ ...step, title: title.trim(), description: note,
        needs_document: needsDocument })]
    }
    if (dueDate !== ymd(b.due_date)) body.due_date = dueDate || null
    setBusy(true)
    try {
      const r = await officeTaskApi.editBatch(orgId, b.key, body)
      const n = r.data?.updated ?? b.total
      toast.success(`Updated for ${n} ${n === 1 ? 'person' : 'people'}`)
      onSaved?.()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the changes')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4"
        role="dialog" aria-modal="true" aria-label="Edit task">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Edit task</h2>
          <button onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-800">Close</button>
        </div>
        <p className="text-xs text-neutral-500">
          Changes go to all {b.total} {b.total === 1 ? 'person' : 'people'} on this task.
        </p>

        <label className="block">
          <span className="block text-xs font-medium text-neutral-500 mb-1">What needs doing</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className={INPUT_CLASS} aria-label="Title" autoFocus />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-neutral-500 mb-1">
            {multiStep ? 'Directions' : 'Note for them'} <span className="font-normal text-neutral-400">(optional)</span>
          </span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            className={INPUT_CLASS} aria-label={multiStep ? 'Directions' : 'Note'} />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-neutral-500 mb-1">
              Due date <span className="font-normal text-neutral-400">(optional)</span>
            </span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className={INPUT_CLASS} aria-label="Due date" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-neutral-500 mb-1">Priority</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}
              className={INPUT_CLASS} aria-label="Priority">
              {PRIORITIES.map(([v, l]) => <option key={v || 'normal'} value={v}>{l}</option>)}
            </select>
          </label>
        </div>

        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          {!multiStep && (
            <label className="flex items-start gap-2 text-sm text-neutral-700 cursor-pointer">
              <input type="checkbox" checked={needsDocument}
                onChange={(e) => setNeedsDocument(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-purple-700" />
              They send a file back
            </label>
          )}
          {multiStep && (
            <StepList steps={steps} setStep={setStep}
              onRemove={(i) => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
              onAdd={() => setSteps((prev) => [...prev, emptyStep()])} />
          )}
          {!multiStep && (
            <button type="button" className="text-sm text-optio-purple hover:underline"
              onClick={() => setSteps([{ ...(single ? original[0] : emptyStep()),
                title: title.trim(), description: note, needs_document: needsDocument }])}>
              + Add steps
            </button>
          )}
          <p className="text-xs text-neutral-500">
            Work people already did on a step is kept when you reword it. If a step now asks
            for more, like a file or a signature, anyone who finished it does it again.
            A step you remove stays for anyone who already started it.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">Cancel</button>
          <button type="button" onClick={save} disabled={busy || !title.trim()}
            className="px-4 py-2 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
