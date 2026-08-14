import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import ModalOverlay from '../../ui/ModalOverlay'
import { withOrg } from '../../../pages/sis/useSisOrg'

/**
 * Send a document out for signature.
 *
 * iCreate's ask, in one dialog: pick the file, pick the people, send. Each
 * recipient gets their own copy in their portal and a task to sign it; the
 * office tracks the batch on the Sent-paperwork tab.
 *
 * Staff and families are two lists rather than one, because the roster they come
 * from is different and so is the portal the notification points at. A single
 * merged list would have to disambiguate an org admin who is also a parent, and
 * guessing which hat they are wearing is not something a picker should do.
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
      <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
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

export default function SendForSignatureModal({ orgId, endpoint, allowHr = false, onClose, onSent }) {
  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [sensitivity, setSensitivity] = useState('general')
  const [tab, setTab] = useState('staff')
  const [staff, setStaff] = useState([])
  const [families, setFamilies] = useState([])
  const [staffIds, setStaffIds] = useState([])
  const [familyIds, setFamilyIds] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!orgId) return
    // The same recipient lists checklists are assigned to — staff who can log
    // in, and the org's guardians.
    api.get(withOrg('/api/sis/staff-admin/onboarding/recipients?audience=staff', orgId))
      .then((r) => setStaff(r.data?.recipients || [])).catch(() => setStaff([]))
    api.get(withOrg('/api/sis/staff-admin/onboarding/recipients?audience=family', orgId))
      .then((r) => setFamilies(r.data?.recipients || [])).catch(() => setFamilies([]))
  }, [orgId])

  const total = staffIds.length + familyIds.length

  const toggle = (setter) => (id) => setter((prev) => (
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  ))

  const send = async () => {
    if (!file) { toast.error('Choose a document to send'); return }
    if (!total) { toast.error('Select at least one person'); return }
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('organization_id', orgId)
      if (title.trim()) form.append('title', title.trim())
      if (message.trim()) form.append('message', message.trim())
      if (dueDate) form.append('due_date', dueDate)
      form.append('sensitivity', allowHr ? sensitivity : 'general')
      staffIds.forEach((id) => form.append('staff_user_id', id))
      familyIds.forEach((id) => form.append('family_user_id', id))
      // The org also rides in the query string, not just the form body: it is
      // the one place every SIS endpoint reads it from regardless of content
      // type, and a superadmin has no own-org fallback to rescue the request.
      const r = await api.post(withOrg(endpoint, orgId), form)
      toast.success(`Sent to ${r.data?.sent ?? total} ${total === 1 ? 'person' : 'people'}`)
      onSent?.()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not send the document')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4"
        role="dialog" aria-modal="true" aria-label="Send a document for signature">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Send for signature</h2>
          <button onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-800">Close</button>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-neutral-500 mb-1">Document</span>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" className="text-sm" />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-neutral-500 mb-1">Name it (optional)</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={file?.name || 'Employee handbook 2026'} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-neutral-500 mb-1">Due date (optional)</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
          </label>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-neutral-500 mb-1">Note for the signer (optional)</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2}
            placeholder="Please read and sign before the first day of term."
            className={`${inputClass} resize-none`} />
        </label>

        {allowHr && (
          <label className="block">
            <span className="block text-xs font-medium text-neutral-500 mb-1">Sensitivity</span>
            <select value={sensitivity} onChange={(e) => setSensitivity(e.target.value)} className={inputClass}>
              <option value="general">Campus paperwork — the front office can see and track it</option>
              <option value="hr">HR paperwork — administrators only</option>
            </select>
          </label>
        )}

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
                emptyLabel="No staff to send to yet." />
            ) : (
              <RecipientList people={families} selected={familyIds} onToggle={toggle(setFamilyIds)}
                emptyLabel="No families to send to yet." />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-neutral-500">{total} selected</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">Cancel</button>
            <button onClick={send} disabled={busy || !total || !file}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
              {busy ? 'Sending…' : 'Send for signature'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}
