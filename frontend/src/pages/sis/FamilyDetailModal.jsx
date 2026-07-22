import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import ModalOverlay from '../../components/ui/ModalOverlay'
import SearchSelect from '../../components/ui/SearchSelect'
import { RolePill, PrimaryTag } from '../../components/ui/RolePill'
import StudentDetailModal from './StudentDetailModal'

const initials = (name) => (name || '?').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('')
const Avatar = ({ name, src }) => (
  src ? (
    <img src={src} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
  ) : (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink text-white flex items-center justify-center text-[11px] font-semibold flex-shrink-0">
      {initials(name)}
    </div>
  )
)

const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
const money = (c) => (c == null ? '—' : `$${(c / 100).toFixed(2)}`)

const TABS = [
  { key: 'family', label: 'Family' },
  { key: 'details', label: 'Details' },
  { key: 'billing', label: 'Billing' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'registration', label: 'Registration' },
]

const FamilyDetailModal = ({ household, orgId, members, onClose, onSaved }) => {
  const [tab, setTab] = useState('family')
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(household.name || '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [messaging, setMessaging] = useState(false)
  const [openStudent, setOpenStudent] = useState(null)

  const startEdit = () => { setName(household.name || ''); setEditingName(true) }
  const saveName = async () => {
    if (!name.trim()) { toast.error('Family name is required'); return }
    setSaving(true)
    try {
      await api.patch(`/api/sis/households/${household.id}`, { name: name.trim(), organization_id: orgId })
      onSaved?.(); setEditingName(false)
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not save') }
    finally { setSaving(false) }
  }

  const uploadPhoto = async (file) => {
    if (!file) return
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    try {
      await api.post(`/api/sis/households/${household.id}/image?organization_id=${orgId}`, form)
      toast.success('Photo updated'); onSaved?.()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not upload photo') }
    finally { setUploading(false) }
  }

  const deleteFamily = async () => {
    if (!window.confirm(`Delete ${household.name}? This removes the family and its member links. Students and guardians keep their accounts.`)) return
    try {
      await api.delete(`/api/sis/households/${household.id}?organization_id=${orgId}`)
      toast.success('Family deleted')
      onSaved?.()
      onClose()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not delete family') }
  }

  const openUserModal = async (userId) => {
    try {
      const r = await api.get(`/api/sis/users/${userId}?organization_id=${orgId}`)
      setOpenStudent(r.data?.user || null)
    } catch { toast.error('Could not open user') }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 pb-3 border-b border-gray-100 gap-3">
          {editingName ? (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <input
                value={name} onChange={(e) => setName(e.target.value)} autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-1.5 text-lg font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-optio-purple"
              />
              <Button size="sm" onClick={saveName} loading={saving}>Save</Button>
              <button onClick={() => setEditingName(false)} className="text-sm text-neutral-500 hover:underline flex-shrink-0">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-lg font-bold text-neutral-900 truncate">{household.name}</h2>
              <button onClick={startEdit} title="Rename family" className="text-neutral-400 hover:text-optio-purple flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
            </div>
          )}
          <div className="flex items-center gap-3 flex-shrink-0">
            {!editingName && <Button size="sm" variant="outline" onClick={() => setMessaging(true)}>Message</Button>}
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
          </div>
        </div>

        <div className="flex gap-1 px-4 pt-3 border-b border-gray-100">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-optio-purple text-optio-purple' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto">
          {tab === 'family' && (
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 flex items-center justify-center flex-shrink-0">
                  {household.image_url
                    ? <img src={household.image_url} alt="" className="w-full h-full object-cover" />
                    : <svg className="w-9 h-9 text-optio-purple/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM3 21v-1a6 6 0 0112 0v1M16 3.13a4 4 0 010 7.75M21 21v-1a6 6 0 00-4-5.659" /></svg>}
                </div>
                <label className="text-sm text-optio-purple font-medium hover:underline cursor-pointer">
                  {uploading ? 'Uploading…' : household.image_url ? 'Change photo' : 'Upload photo'}
                  <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => uploadPhoto(e.target.files?.[0])} />
                </label>
              </div>
              <MembersSection household={household} orgId={orgId} members={members} onSaved={onSaved} onOpenUser={openUserModal} />
              <div className="border-t border-gray-100 pt-4">
                <button onClick={deleteFamily} className="text-sm text-red-600 font-medium hover:underline">Delete family</button>
              </div>
            </div>
          )}
          {tab === 'details' && <DetailsPanel household={household} orgId={orgId} onSaved={onSaved} />}
          {tab === 'billing' && <BillingPanel householdId={household.id} orgId={orgId} />}
          {tab === 'contacts' && <FamilyContactsPanel householdId={household.id} orgId={orgId} />}
          {tab === 'registration' && <RegistrationPanel householdId={household.id} orgId={orgId} />}
        </div>
      </div>

      {messaging && <MessageComposeModal household={household} orgId={orgId} onClose={() => setMessaging(false)} />}
      {openStudent && (
        <StudentDetailModal student={openStudent} orgId={orgId} onClose={() => setOpenStudent(null)} onSaved={onSaved} />
      )}
    </ModalOverlay>
  )
}

const MembersSection = ({ household, orgId, members, onSaved, onOpenUser }) => {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ user_id: '', email: '', relationship: 'student' })
  const list = household.members || []
  const primaryId = household.primary_contact_user_id

  const add = async (confirmDuplicate = false) => {
    if (!form.user_id && !form.email.trim()) { toast.error('Pick a person or enter their account email'); return }
    try {
      // user_id from the org picker; email reaches a student's existing Optio
      // account that isn't in the org yet (the backend attaches it fully).
      const body = form.user_id
        ? { user_id: form.user_id, relationship: form.relationship }
        : { email: form.email.trim(), relationship: form.relationship }
      await api.post(`/api/sis/households/${household.id}/members`, {
        ...body, organization_id: orgId, is_primary_guardian: form.relationship === 'guardian',
        ...(confirmDuplicate ? { confirm_duplicate: true } : {}),
      })
      setForm({ user_id: '', email: '', relationship: 'student' }); setAdding(false); onSaved?.()
    } catch (e) {
      const d = e?.response?.data
      // The student looks like one already in this family — confirm before doubling them up.
      if (d?.needs_confirmation && !confirmDuplicate) {
        if (window.confirm(d.error)) return add(true)
        return
      }
      toast.error(d?.error || 'Could not add member')
    }
  }
  const remove = async (m) => {
    if (!window.confirm(`Remove ${m.name} from this family?`)) return
    try { await api.delete(`/api/sis/households/${household.id}/members/${m.user_id}?organization_id=${orgId}`); onSaved?.() }
    catch { toast.error('Could not remove member') }
  }
  const makePrimary = async (m) => {
    try {
      await api.patch(`/api/sis/households/${household.id}`, { primary_contact_user_id: m.user_id, organization_id: orgId })
      toast.success(`${m.name} is now the primary contact`); onSaved?.()
    } catch { toast.error('Could not set primary contact') }
  }

  return (
    <section className="border-t border-gray-100 pt-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Members</h4>
        {!adding && <button onClick={() => setAdding(true)} className="text-sm text-optio-purple font-medium hover:underline">+ Add member</button>}
      </div>
      <div className="space-y-1">
        {list.length === 0 && !adding && <p className="text-sm text-neutral-400">No members yet.</p>}
        {list.map((m) => {
          const isStudent = m.relationship === 'student'
          const isPrimary = primaryId === m.user_id
          const sub = isStudent ? [m.status, m.grade_level].filter(Boolean).join(' · ') : m.email
          return (
            <div
              key={m.user_id}
              onClick={() => onOpenUser(m.user_id)}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-neutral-50 cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar name={m.name} src={m.avatar_url} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-neutral-800 truncate">{m.name}</span>
                    <RolePill role={m.relationship} />
                    {isPrimary && <PrimaryTag />}
                    {m.possible_duplicate && (
                      <span
                        className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-amber-100 text-amber-700 flex-shrink-0"
                        title={`Looks like the same student as ${(m.duplicate_with || []).map((d) => d.name).join(', ') || 'another member'} — they may have been added twice. Remove the extra account if so.`}
                      >
                        Possible duplicate
                      </span>
                    )}
                  </div>
                  {sub && <div className="text-xs text-neutral-400 truncate">{sub}</div>}
                </div>
              </div>
              <span className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                {!isStudent && !isPrimary && (
                  <button onClick={() => makePrimary(m)} title="Make primary contact" className="p-1.5 rounded-md text-neutral-400 hover:text-optio-purple hover:bg-neutral-100">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                  </button>
                )}
                <button onClick={() => remove(m)} title="Remove" className="p-1.5 rounded-md text-neutral-400 hover:text-red-500 hover:bg-neutral-100">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </span>
            </div>
          )
        })}
      </div>
      {adding && (
        <div className="mt-2 space-y-2">
          <SearchSelect value={form.user_id} onChange={(id) => setForm({ ...form, user_id: id, email: '' })}
            options={members} getId={(m) => m.id} getLabel={(m) => `${m.name}${m.is_student ? ' (student)' : ''}`} placeholder="Search people…" />
          {!form.user_id && form.relationship === 'student' && (
            <input type="email" value={form.email} placeholder="…or a student's Optio account email"
              onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${field} w-full`} />
          )}
          <div className="flex gap-2">
            <select value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} className={`${field} flex-1`}>
              <option value="student">student</option>
              <option value="guardian">guardian</option>
              <option value="other">other</option>
            </select>
            <Button size="sm" onClick={() => add()}>Add</Button>
            <button onClick={() => setAdding(false)} className="text-sm text-neutral-500 hover:underline">Cancel</button>
          </div>
        </div>
      )}
    </section>
  )
}

const DetailsPanel = ({ household, orgId, onSaved }) => {
  const [f, setF] = useState({
    address_line1: household.address_line1 || '', address_line2: household.address_line2 || '',
    city: household.city || '', state: household.state || '', postal_code: household.postal_code || '',
    phone: household.phone || '', notes: household.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      await api.patch(`/api/sis/households/${household.id}`, { ...f, organization_id: orgId })
      toast.success('Saved'); onSaved?.()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not save') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <RegistrationAccessSection household={household} orgId={orgId} onSaved={onSaved} />
      <label className="text-xs text-neutral-500 block">Address line 1
        <input value={f.address_line1} onChange={(e) => set('address_line1', e.target.value)} className={field} />
      </label>
      <label className="text-xs text-neutral-500 block">Address line 2
        <input value={f.address_line2} onChange={(e) => set('address_line2', e.target.value)} className={field} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-neutral-500">City<input value={f.city} onChange={(e) => set('city', e.target.value)} className={field} /></label>
        <label className="text-xs text-neutral-500">State<input value={f.state} onChange={(e) => set('state', e.target.value)} className={field} /></label>
        <label className="text-xs text-neutral-500">ZIP<input value={f.postal_code} onChange={(e) => set('postal_code', e.target.value)} className={field} /></label>
      </div>
      <label className="text-xs text-neutral-500 block">Phone
        <input value={f.phone} onChange={(e) => set('phone', e.target.value)} className={field} />
      </label>
      <label className="text-xs text-neutral-500 block">Staff notes
        <textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className={`${field} resize-none`} placeholder="Internal notes about this family" />
      </label>
      <Button size="sm" onClick={save} loading={saving}>Save details</Button>
    </div>
  )
}

// Class-signup access: a hold blocks the family entirely; the tier controls when
// their registration window opens (dates configured in Settings).
const RegistrationAccessSection = ({ household, orgId, onSaved }) => {
  const [hold, setHold] = useState(!!household.registration_hold)
  const [reason, setReason] = useState(household.registration_hold_reason || '')
  const [busy, setBusy] = useState(false)

  const patch = async (fields, apply) => {
    setBusy(true)
    try {
      await api.patch(`/api/sis/households/${household.id}`, { ...fields, organization_id: orgId })
      apply?.(); onSaved?.()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not save') }
    finally { setBusy(false) }
  }

  const toggleHold = () => {
    const next = !hold
    patch({ registration_hold: next, registration_hold_reason: next ? reason || null : null }, () => {
      setHold(next)
      if (!next) setReason('')
      toast.success(next ? 'Registration hold placed' : 'Registration hold cleared')
    })
  }
  const saveReason = () => {
    if ((household.registration_hold_reason || '') === reason.trim()) return
    patch({ registration_hold_reason: reason.trim() || null })
  }
  return (
    <section className="rounded-lg border border-gray-200 p-3 space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Class registration access</h4>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-neutral-900">Registration hold</div>
          <div className="text-xs text-neutral-500">Blocks this family from signing up for classes until cleared.</div>
        </div>
        <button
          type="button" role="switch" aria-checked={hold} aria-label="Registration hold" onClick={toggleHold} disabled={busy}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${hold ? 'bg-red-500' : 'bg-neutral-300'} ${busy ? 'opacity-50' : ''}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${hold ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
      {hold && (
        <label className="text-xs text-neutral-500 block">Hold reason (internal)
          <input value={reason} onChange={(e) => setReason(e.target.value)} onBlur={saveReason} disabled={busy}
            className={field} placeholder="e.g. registration fee unpaid" />
        </label>
      )}
      <DirectoryRow household={household} orgId={orgId} onSaved={onSaved} />
    </section>
  )
}

// Directory visibility is the FAMILY's choice (opt-in on their Directory page);
// staff see it here and can change it on a family's explicit request.
const DirectoryRow = ({ household, orgId, onSaved }) => {
  const [optIn, setOptIn] = useState(!!household.directory_opt_in)
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    const next = !optIn
    setBusy(true)
    try {
      await api.patch(`/api/sis/households/${household.id}`, { directory_opt_in: next, organization_id: orgId })
      setOptIn(next)
      toast.success(next ? 'Family added to the directory' : 'Family removed from the directory')
      onSaved?.()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not save') }
    finally { setBusy(false) }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-neutral-900">Family directory</div>
        <div className="text-xs text-neutral-500">The family opts in themselves on their Directory page — only change this if they ask.</div>
      </div>
      <button
        type="button" role="switch" aria-checked={optIn} aria-label="Family directory" onClick={toggle} disabled={busy}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${optIn ? 'bg-optio-purple' : 'bg-neutral-300'} ${busy ? 'opacity-50' : ''}`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${optIn ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

const BillingPanel = ({ householdId, orgId }) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/api/sis/households/${householdId}/billing?organization_id=${orgId}`)
      .then((r) => setData(r.data || {}))
      .catch(() => toast.error('Could not load billing'))
      .finally(() => setLoading(false))
  }, [householdId, orgId])

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>
  const invoices = data?.invoices || []
  const outstanding = invoices
    .filter((i) => i.status !== 'paid' && i.status !== 'void')
    .reduce((sum, i) => sum + ((i.total_cents || 0) - (i.amount_paid_cents || 0)), 0)

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-neutral-50 px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-neutral-500">Outstanding balance</span>
        <span className={`text-lg font-bold ${outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>{money(outstanding)}</span>
      </div>

      {data?.sbs_pay_url && (
        <a href={data.sbs_pay_url} target="_blank" rel="noreferrer" className="inline-block text-sm text-optio-purple font-medium hover:underline">Open pay portal →</a>
      )}

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Invoices</h4>
        {invoices.length === 0 ? <p className="text-sm text-neutral-400">No invoices yet.</p> : (
          <div className="space-y-1.5">
            {invoices.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm border border-gray-100 rounded-lg px-3 py-2">
                <span className="text-neutral-600">
                  {money(i.total_cents)}
                  {i.amount_paid_cents ? <span className="text-neutral-400"> · paid {money(i.amount_paid_cents)}</span> : null}
                  {i.due_date && <span className="text-neutral-400"> · due {String(i.due_date).slice(0, 10)}</span>}
                </span>
                <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${i.status === 'paid' ? 'bg-green-100 text-green-700' : i.status === 'void' ? 'bg-neutral-100 text-neutral-500' : 'bg-amber-100 text-amber-700'}`}>{i.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {(data?.upcoming_installments || []).length > 0 && (
        <p className="text-xs text-neutral-400">{data.upcoming_installments.length} upcoming installment{data.upcoming_installments.length === 1 ? '' : 's'} scheduled.</p>
      )}
    </div>
  )
}

const MessageComposeModal = ({ household, orgId, onClose }) => {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!body.trim()) { toast.error('Write a message'); return }
    setSending(true)
    try {
      const r = await api.post(`/api/sis/households/${household.id}/message`, { subject, body, organization_id: orgId })
      const n = r.data?.sent ?? 0
      toast.success(n ? `Sent to ${n} guardian${n === 1 ? '' : 's'}` : 'No guardians to message')
      onClose()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not send') }
    finally { setSending(false) }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-neutral-900">Message the family</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
        </div>
        <p className="text-sm text-neutral-500 mb-3">Sends a message to every guardian in {household.name} through Messages, sent from your school's account.</p>
        <label className="text-xs text-neutral-500 block mb-3">Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} placeholder="Optional" />
        </label>
        <label className="text-xs text-neutral-500 block mb-4">Message
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={`${field} resize-none`} />
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg">Cancel</button>
          <Button size="sm" onClick={send} loading={sending}>Send</Button>
        </div>
      </div>
    </ModalOverlay>
  )
}

const FamilyContactsPanel = ({ householdId, orgId }) => {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [nc, setNc] = useState({ name: '', relationship: '', phone: '', email: '' })

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/api/sis/households/${householdId}/emergency-contacts?organization_id=${orgId}`)
      .then((r) => setContacts(r.data?.contacts || []))
      .catch(() => toast.error('Could not load contacts'))
      .finally(() => setLoading(false))
  }, [householdId, orgId])

  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!nc.name.trim()) { toast.error('Contact name required'); return }
    try {
      const r = await api.post(`/api/sis/households/${householdId}/emergency-contacts`, { ...nc, organization_id: orgId })
      setContacts(r.data?.contacts || [])
      setNc({ name: '', relationship: '', phone: '', email: '' }); setAdding(false)
      toast.success('Added for the family')
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not add contact') }
  }
  const remove = async (c) => {
    if (!window.confirm(`Remove ${c.name} as an emergency contact for the family?`)) return
    try {
      const r = await api.post(`/api/sis/households/${householdId}/emergency-contacts/delete`, { ids: c.ids, organization_id: orgId })
      setContacts(r.data?.contacts || [])
    } catch { toast.error('Could not remove contact') }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Emergency contacts</h4>
        {!adding && <button onClick={() => setAdding(true)} className="text-sm text-optio-purple font-medium hover:underline">+ Emergency Contact</button>}
      </div>
      {loading ? <p className="text-sm text-neutral-400">Loading…</p> : (
        <div className="space-y-2">
          {contacts.length === 0 && !adding && <p className="text-sm text-neutral-400">No contacts yet.</p>}
          {contacts.map((c) => (
            <div key={c.ids.join(',')} className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2 gap-2">
              <div className="text-sm min-w-0">
                <span className="font-medium text-neutral-800">{c.name}</span>
                {c.relationship && <span className="text-neutral-400"> · {c.relationship}</span>}
                {c.student_count < c.total_students && <span className="ml-1 text-xs text-amber-600" title="Not on every student in the family">partial</span>}
                <div className="text-xs text-neutral-400">{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
              </div>
              <button onClick={() => remove(c)} className="text-red-500 text-sm hover:underline flex-shrink-0">Remove</button>
            </div>
          ))}
        </div>
      )}
      {adding && (
        <div className="mt-2 rounded-lg border border-gray-200 p-3">
          <div className="grid grid-cols-2 gap-2">
            <input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} className={field} placeholder="Name" autoFocus />
            <input value={nc.relationship} onChange={(e) => setNc({ ...nc, relationship: e.target.value })} className={field} placeholder="Relationship" />
            <input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} className={field} placeholder="Phone" />
            <input value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} className={field} placeholder="Email" />
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={add}>Add for family</Button>
            <button onClick={() => setAdding(false)} className="text-sm text-neutral-500 hover:underline">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Registration: what the family submitted in the iCreate registration funnel ─
// (answers, signed paperwork, kids, fee). Empty state for households that were
// created by staff rather than through the registration flow.
const RegistrationPanel = ({ householdId, orgId }) => {
  const [reg, setReg] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/api/sis/households/${householdId}/registration?organization_id=${orgId}`)
      .then((r) => setReg(r.data?.registration || null))
      .catch(() => { /* non-fatal */ })
      .finally(() => setLoading(false))
  }, [householdId, orgId])

  if (loading) return <p className="text-sm text-neutral-400">Loading…</p>
  if (!reg) return <p className="text-sm text-neutral-400">This family did not register through the online registration flow.</p>

  const fmtWhen = (d) => (d ? new Date(d).toLocaleString() : null)
  const answerText = (v) => (Array.isArray(v) ? v.join(', ') : (v || '—'))

  return (
    <div className="space-y-5">
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Status</h4>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
            reg.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          }`}>{reg.status}</span>
          {reg.fee_cents != null && <span className="text-neutral-600">Fee: {money(reg.fee_cents)}</span>}
          {reg.fee_recorded_at && <span className="text-neutral-400 text-xs">fee step {fmtWhen(reg.fee_recorded_at)}</span>}
          {reg.scheduling_emailed_at && <span className="text-neutral-400 text-xs">scheduling email sent</span>}
        </div>
      </section>

      {(reg.kids || []).length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Children registered</h4>
          <div className="space-y-1">
            {reg.kids.map((k) => (
              <div key={k.user_id} className="text-sm text-neutral-700">
                {k.name} <span className="text-neutral-400 text-xs">· {k.type === 'dependent' ? 'managed (under parent account)' : 'own account'}{k.dob ? ` · DOB ${k.dob}` : ''}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {Object.keys(reg.answers || {}).length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Answers</h4>
          <div className="space-y-1.5">
            {Object.entries(reg.answers).map(([k, v]) => (
              <div key={k} className="text-sm">
                <span className="text-neutral-400 capitalize">{k.replace(/_/g, ' ')}: </span>
                <span className="text-neutral-800">{answerText(v)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(reg.paperwork || []).length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Signed paperwork</h4>
          <div className="space-y-1.5">
            {reg.paperwork.map((p) => (
              <div key={p.key} className="text-sm text-neutral-700">
                {p.label}
                <span className="text-neutral-400 text-xs"> — signed "{p.signed_name}"{p.acknowledged_at ? ` on ${new Date(p.acknowledged_at).toLocaleDateString()}` : ''}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(reg.emergency_contacts || []).length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Emergency contacts submitted</h4>
          <div className="space-y-1">
            {reg.emergency_contacts.map((c, i) => (
              <div key={i} className="text-sm text-neutral-700">
                {c.name}
                <span className="text-neutral-400 text-xs"> · {[c.relationship, c.phone].filter(Boolean).join(' · ')}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export default FamilyDetailModal
