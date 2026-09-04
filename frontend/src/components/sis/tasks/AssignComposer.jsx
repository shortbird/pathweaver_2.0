import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import ModalOverlay from '../../ui/ModalOverlay'
import { withOrg } from '../../../pages/sis/useSisOrg'

/**
 * Assign — the one way to ask people to do something.
 *
 * The admin never has to pick a noun before starting. It opens as the simplest
 * thing (a title and some people; ticking it off is the whole job) and the
 * options quietly change what it is:
 *
 *   - "They send a file back"        → an upload task
 *   - "Add steps"                    → a checklist (that is all one ever was)
 *   - "Attach a document to sign"    → a signature send, tracked per person
 *
 * Underneath, the first two are one ad-hoc assignment record and the third is
 * the signature-request flow — but that is the implementation's business, not
 * the admin's. A saved checklist is one link away rather than a fourth option
 * here, because reusing a template starts from the template, not from a blank
 * title.
 *
 * Staff and families are two lists rather than one, because the roster they
 * come from is different and so is the portal the notification points at.
 */

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent'

const RecipientList = ({ people, selected, onToggle, emptyLabel }) => {
  const [q, setQ] = useState('')
  const shown = q.trim()
    ? people.filter((p) => (p.name || '').toLowerCase().includes(q.trim().toLowerCase()))
    : people

  if (!people.length) return <p className="text-sm text-neutral-400 py-2">{emptyLabel}</p>
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name"
        className={`${inputClass} mb-2`} aria-label="Search recipients" />
      <div className="max-h-44 overflow-y-auto divide-y divide-gray-50">
        {shown.map((p) => (
          <label key={p.id} className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
            <input type="checkbox" checked={selected.includes(p.id)} onChange={() => onToggle(p.id)}
              className="h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
            <span className="text-neutral-800">{p.name}</span>
          </label>
        ))}
        {!shown.length && <p className="text-sm text-neutral-400 py-2">No match.</p>}
      </div>
    </div>
  )
}

export default function AssignComposer({ orgId, sigEndpoint, allowHr = false,
  onClose, onAssigned, onUseTemplate }) {
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [needsDocument, setNeedsDocument] = useState(false)
  const [steps, setSteps] = useState(null) // null = a single task; [] once "Add steps"
  const [signFile, setSignFile] = useState(null)
  const [sensitivity, setSensitivity] = useState('general')
  const [blocksAccess, setBlocksAccess] = useState(false)
  const [tab, setTab] = useState('staff')
  const [staff, setStaff] = useState([])
  const [families, setFamilies] = useState([])
  const [staffIds, setStaffIds] = useState([])
  const [familyIds, setFamilyIds] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!orgId) return
    api.get(withOrg('/api/sis/staff-admin/onboarding/recipients?audience=staff', orgId))
      .then((r) => setStaff(r.data?.recipients || [])).catch(() => setStaff([]))
    api.get(withOrg('/api/sis/staff-admin/onboarding/recipients?audience=family', orgId))
      .then((r) => setFamilies(r.data?.recipients || [])).catch(() => setFamilies([]))
  }, [orgId])

  const total = staffIds.length + familyIds.length
  const signing = Boolean(signFile)

  // The hold is a family-side rule (a teacher is not locked out of their
  // classroom over paperwork), so the option only exists once a family is on
  // the list — and un-ticks itself if the last family comes back off it.
  const requireable = signing && familyIds.length > 0
  useEffect(() => { if (!requireable) setBlocksAccess(false) }, [requireable])

  const toggle = (setter) => (id) => setter((prev) => (
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  ))

  const setStep = (i, fields) => setSteps((prev) =>
    prev.map((s, idx) => (idx === i ? { ...s, ...fields } : s)))
  const filledSteps = (steps || []).filter((s) => s.title.trim())

  const assign = async () => {
    if (!title.trim()) { toast.error('Give it a title'); return }
    if (!total) { toast.error('Pick at least one person'); return }
    setBusy(true)
    try {
      if (signing) {
        // A document to sign rides the signature-request flow: each recipient
        // gets their own copy and a task to sign it, tracked per person.
        const form = new FormData()
        form.append('file', signFile)
        form.append('organization_id', orgId)
        form.append('title', title.trim())
        if (note.trim()) form.append('message', note.trim())
        if (dueDate) form.append('due_date', dueDate)
        form.append('sensitivity', allowHr ? sensitivity : 'general')
        if (requireable && blocksAccess) form.append('blocks_access', 'true')
        staffIds.forEach((id) => form.append('staff_user_id', id))
        familyIds.forEach((id) => form.append('family_user_id', id))
        const r = await api.post(withOrg(sigEndpoint, orgId), form)
        const sent = r.data?.sent ?? total
        toast.success(r.data?.blocks_access
          ? `Sent to ${sent} ${sent === 1 ? 'person' : 'people'} — required before they can use Optio`
          : `Sent to ${sent} ${sent === 1 ? 'person' : 'people'} to sign`)
      } else {
        // An ad-hoc task or checklist: one assignment per person, one POST per
        // audience (staff and families live behind different portals).
        const base = {
          organization_id: orgId, title: title.trim(),
          description: note.trim() || null, due_date: dueDate || null,
        }
        if (steps ? filledSteps.length : false) {
          base.items = filledSteps.map((s) => ({
            title: s.title.trim(), needs_document: s.needs_document,
          }))
        } else {
          base.needs_document = needsDocument
        }
        let assigned = 0
        for (const [audience, ids] of [['staff', staffIds], ['family', familyIds]]) {
          if (!ids.length) continue
          const r = await api.post('/api/sis/staff-admin/onboarding/assignments',
            { ...base, audience, user_ids: ids })
          assigned += r.data?.assigned ?? ids.length
        }
        toast.success(`Assigned to ${assigned} ${assigned === 1 ? 'person' : 'people'}`)
      }
      onAssigned?.()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not assign it')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4"
        role="dialog" aria-modal="true" aria-label="Assign">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Assign</h2>
          <button onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-800">Close</button>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-neutral-500 mb-1">What needs doing</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Turn in your field trip roster" className={inputClass}
            aria-label="Title" autoFocus />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-neutral-500 mb-1">
              {steps ? 'Directions / note for them' : 'Note for them'} <span className="font-normal text-neutral-400">(optional)</span>
            </span>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={steps ? 'Directions for completing this checklist' : 'Anything they need to know'}
              className={inputClass} aria-label={steps ? 'Directions' : 'Note'} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-neutral-500 mb-1">
              Due date <span className="font-normal text-neutral-400">(optional)</span>
            </span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className={inputClass} aria-label="Due date" />
          </label>
        </div>

        {/* What kind of thing this is, decided by what you add — not by
            picking a noun up front. */}
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          {!signing && !steps && (
            <label className="flex items-start gap-2 text-sm text-neutral-700 cursor-pointer">
              <input type="checkbox" checked={needsDocument}
                onChange={(e) => setNeedsDocument(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-purple-700" />
              <span>
                They send a file back
                <span className="block text-xs text-neutral-400">
                  Done when they upload it — e.g. a signed permission slip, a photo of a form.
                </span>
              </span>
            </label>
          )}

          {steps && (
            <div className="space-y-2">
              <span className="block text-xs font-medium text-neutral-500">Steps</span>
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={s.title} onChange={(e) => setStep(i, { title: e.target.value })}
                    placeholder={`Step ${i + 1}`} className={inputClass}
                    aria-label={`Step ${i + 1}`} />
                  <label className="flex items-center gap-1.5 text-xs text-neutral-600 whitespace-nowrap cursor-pointer">
                    <input type="checkbox" checked={s.needs_document}
                      onChange={(e) => setStep(i, { needs_document: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 accent-purple-700" />
                    file back
                  </label>
                  <button onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label={`Remove step ${i + 1}`}
                    className="text-neutral-400 hover:text-red-600 font-bold px-1">×</button>
                </div>
              ))}
              <button onClick={() => setSteps((prev) => [...prev, { title: '', needs_document: false }])}
                className="text-sm text-optio-purple hover:underline">+ Another step</button>
            </div>
          )}

          <div className="flex items-center gap-4 flex-wrap text-sm">
            {!signing && !steps && (
              <button onClick={() => setSteps([{ title: '', needs_document: false }])}
                className="text-optio-purple hover:underline">+ Add steps</button>
            )}
            {steps && (
              <button onClick={() => setSteps(null)}
                className="text-neutral-500 hover:underline">Back to a single task</button>
            )}
            {!steps && (
              <label className="text-optio-purple hover:underline cursor-pointer">
                {signing ? 'Change the document' : '+ Attach a document to sign'}
                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => setSignFile(e.target.files?.[0] || null)} />
              </label>
            )}
            {signing && (
              <>
                <span className="text-xs text-neutral-500">{signFile.name}</span>
                <button onClick={() => setSignFile(null)}
                  className="text-neutral-500 hover:underline">Remove</button>
              </>
            )}
          </div>

          {signing && (
            <>
              <p className="text-xs text-neutral-500">
                Each person gets their own copy and is asked to sign it by typing their name.
                You track who has signed from the Assigned list.
              </p>
              {allowHr && (
                <label className="block">
                  <span className="block text-xs font-medium text-neutral-500 mb-1">Sensitivity</span>
                  <select value={sensitivity} onChange={(e) => setSensitivity(e.target.value)} className={inputClass}>
                    <option value="general">Campus paperwork — the front office can see and track it</option>
                    <option value="hr">HR paperwork — administrators only</option>
                  </select>
                </label>
              )}
              {requireable && (
                <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 cursor-pointer">
                  <input type="checkbox" checked={blocksAccess}
                    onChange={(e) => setBlocksAccess(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-purple-700" />
                  <span className="text-sm text-neutral-800">
                    <span className="font-medium">Require this before they can use Optio</span>
                    <span className="block text-xs text-neutral-600 mt-0.5">
                      The {familyIds.length === 1 ? 'family' : 'families'} you selected will see only
                      this document until they sign it. Their students are not affected, and you can
                      release the hold at any time from the Assigned list.
                    </span>
                  </span>
                </label>
              )}
            </>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setTab('staff')}
              className={`px-3 py-1.5 rounded-lg text-sm ${tab === 'staff' ? 'bg-optio-purple/10 text-optio-purple font-semibold' : 'text-neutral-600 hover:bg-gray-100'}`}>
              Staff{staffIds.length ? ` (${staffIds.length})` : ''}
            </button>
            <button onClick={() => setTab('family')}
              className={`px-3 py-1.5 rounded-lg text-sm ${tab === 'family' ? 'bg-optio-purple/10 text-optio-purple font-semibold' : 'text-neutral-600 hover:bg-gray-100'}`}>
              Families{familyIds.length ? ` (${familyIds.length})` : ''}
            </button>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            {tab === 'staff' ? (
              <RecipientList people={staff} selected={staffIds} onToggle={toggle(setStaffIds)}
                emptyLabel="No staff to assign to yet." />
            ) : (
              <RecipientList people={families} selected={familyIds} onToggle={toggle(setFamilyIds)}
                emptyLabel="No families to assign to yet." />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-500">{total} selected</span>
            {onUseTemplate && (
              <button onClick={onUseTemplate} className="text-xs text-optio-purple hover:underline">
                Use a saved checklist instead
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">Cancel</button>
            <button onClick={assign} disabled={busy || !total || !title.trim()}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
              {busy ? 'Assigning…' : signing ? 'Send for signature' : 'Assign'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}
