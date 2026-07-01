import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import ModalOverlay from '../../components/ui/ModalOverlay'
import SearchSelect from '../../components/ui/SearchSelect'
import StudentDetailModal from './StudentDetailModal'

const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
const money = (c) => (c == null ? '—' : `$${(c / 100).toFixed(2)}`)

const TABS = [
  { key: 'family', label: 'Family' },
  { key: 'details', label: 'Details' },
  { key: 'billing', label: 'Billing' },
  { key: 'contacts', label: 'Contacts' },
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

  const openStudentModal = async (userId) => {
    try {
      const r = await api.get(`/api/sis/students/${userId}?organization_id=${orgId}`)
      setOpenStudent(r.data?.student || null)
    } catch { toast.error('Could not open student') }
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
              <MembersSection household={household} orgId={orgId} members={members} onSaved={onSaved} onOpenStudent={openStudentModal} />
            </div>
          )}
          {tab === 'details' && <DetailsPanel household={household} orgId={orgId} onSaved={onSaved} />}
          {tab === 'billing' && <BillingPanel householdId={household.id} orgId={orgId} />}
          {tab === 'contacts' && <FamilyContactsPanel householdId={household.id} orgId={orgId} />}
        </div>
      </div>

      {messaging && <MessageComposeModal household={household} orgId={orgId} onClose={() => setMessaging(false)} />}
      {openStudent && (
        <StudentDetailModal student={openStudent} orgId={orgId} onClose={() => setOpenStudent(null)} onSaved={onSaved} />
      )}
    </ModalOverlay>
  )
}

const MembersSection = ({ household, orgId, members, onSaved, onOpenStudent }) => {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ user_id: '', relationship: 'student' })
  const list = household.members || []
  const primaryId = household.primary_contact_user_id

  const add = async () => {
    if (!form.user_id) { toast.error('Pick a person'); return }
    try {
      await api.post(`/api/sis/households/${household.id}/members`, {
        ...form, organization_id: orgId, is_primary_guardian: form.relationship === 'guardian',
      })
      setForm({ user_id: '', relationship: 'student' }); setAdding(false); onSaved?.()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not add member') }
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
      <div className="space-y-1.5">
        {list.length === 0 && !adding && <p className="text-sm text-neutral-400">No members yet.</p>}
        {list.map((m) => {
          const isStudent = m.relationship === 'student'
          const isPrimary = primaryId === m.user_id
          return (
            <div key={m.user_id} className="flex items-center justify-between text-sm gap-2">
              <span className="min-w-0 truncate">
                {isStudent ? (
                  <button onClick={() => onOpenStudent(m.user_id)} className="font-medium text-optio-purple hover:underline">{m.name}</button>
                ) : (
                  <span className="font-medium text-neutral-800">{m.name}</span>
                )}
                <span className="text-neutral-400"> · {m.relationship}</span>
                {isPrimary && <span className="ml-1 text-xs text-optio-purple">primary</span>}
                {isStudent && (m.status || m.grade_level) && (
                  <span className="text-xs text-neutral-400"> · {[m.status, m.grade_level].filter(Boolean).join(' · ')}</span>
                )}
                {!isStudent && m.email && <span className="block text-xs text-neutral-400 truncate">{m.email}</span>}
              </span>
              <span className="flex items-center gap-2 flex-shrink-0">
                {!isStudent && !isPrimary && <button onClick={() => makePrimary(m)} className="text-neutral-500 hover:underline">Make primary</button>}
                <button onClick={() => remove(m)} className="text-red-500 hover:underline">Remove</button>
              </span>
            </div>
          )
        })}
      </div>
      {adding && (
        <div className="mt-2 space-y-2">
          <SearchSelect value={form.user_id} onChange={(id) => setForm({ ...form, user_id: id })}
            options={members} getId={(m) => m.id} getLabel={(m) => `${m.name}${m.is_student ? ' (student)' : ''}`} placeholder="Search people…" />
          <div className="flex gap-2">
            <select value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} className={`${field} flex-1`}>
              <option value="student">student</option>
              <option value="guardian">guardian</option>
              <option value="other">other</option>
            </select>
            <Button size="sm" onClick={add}>Add</Button>
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
        <p className="text-sm text-neutral-500 mb-3">Sends a message to every guardian in {household.name} through Messages.</p>
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

export default FamilyDetailModal
