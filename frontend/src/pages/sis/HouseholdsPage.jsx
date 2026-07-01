import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import SearchSelect from '../../components/ui/SearchSelect'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

const HouseholdsPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [households, setHouseholds] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [addingTo, setAddingTo] = useState(null)
  const [contactsOpen, setContactsOpen] = useState(null)
  const [memberForm, setMemberForm] = useState({ user_id: '', relationship: 'student' })

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      api.get(withOrg('/api/sis/households', orgId)),
      api.get(withOrg('/api/sis/members', orgId)),
    ])
      .then(([h, m]) => {
        setHouseholds(h.data?.households || [])
        setMembers(m.data?.members || [])
      })
      .catch(() => toast.error('Failed to load families'))
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => { load() }, [load])

  const createHousehold = async () => {
    if (!newName.trim()) return
    try {
      await api.post('/api/sis/households', { name: newName.trim(), organization_id: orgId })
      setNewName('')
      toast.success('Family created')
      load()
    } catch {
      toast.error('Could not create family')
    }
  }

  const addMember = async (householdId) => {
    if (!memberForm.user_id) { toast.error('Pick a person'); return }
    try {
      await api.post(`/api/sis/households/${householdId}/members`, {
        ...memberForm, organization_id: orgId,
        is_primary_guardian: memberForm.relationship === 'guardian',
      })
      setAddingTo(null)
      setMemberForm({ user_id: '', relationship: 'student' })
      load()
    } catch {
      toast.error('Could not add member')
    }
  }

  const removeMember = async (householdId, userId) => {
    try {
      await api.delete(`/api/sis/households/${householdId}/members/${userId}?organization_id=${orgId}`)
      load()
    } catch {
      toast.error('Could not remove member')
    }
  }

  const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Families</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex gap-3">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createHousehold()}
          className={`${field} flex-1`}
          placeholder="New family / household name"
        />
        <Button size="sm" onClick={createHousehold}>Create family</Button>
      </div>

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !households.length && (
        <p className="text-neutral-500">No families yet. Create one above to group students and guardians.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {households.map((h) => {
          const memberCount = (h.members || []).length
          return (
            <div key={h.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
              {/* Hero */}
              <div className="relative h-24 bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 flex items-center justify-center">
                <svg className="w-12 h-12 text-optio-purple/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM3 21v-1a6 6 0 0112 0v1M16 3.13a4 4 0 010 7.75M21 21v-1a6 6 0 00-4-5.659" />
                </svg>
                <span className="absolute top-2 right-2 text-[11px] font-medium rounded-full px-2 py-0.5 bg-white/90 text-optio-purple shadow-sm">
                  {memberCount} member{memberCount === 1 ? '' : 's'}
                </span>
              </div>

              {/* Body */}
              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-neutral-900 truncate">{h.name}</h3>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <button
                      onClick={() => setContactsOpen(contactsOpen === h.id ? null : h.id)}
                      className="text-sm text-neutral-500 hover:underline"
                    >
                      {contactsOpen === h.id ? 'Hide contacts' : 'Contacts'}
                    </button>
                    <button
                      onClick={() => setAddingTo(addingTo === h.id ? null : h.id)}
                      className="text-sm text-optio-purple font-medium hover:underline"
                    >
                      {addingTo === h.id ? 'Cancel' : '+ Add'}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 mt-3">
                  {memberCount === 0 && <p className="text-sm text-neutral-400">No members yet.</p>}
                  {(h.members || []).map((m) => (
                    <div key={m.user_id} className="flex items-center justify-between text-sm gap-2">
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-neutral-800">{m.name}</span>
                        <span className="text-neutral-400"> · {m.relationship}</span>
                        {m.is_primary_guardian && <span className="ml-1 text-xs text-optio-purple">primary</span>}
                      </span>
                      <button onClick={() => removeMember(h.id, m.user_id)} className="text-red-500 hover:underline flex-shrink-0">Remove</button>
                    </div>
                  ))}
                </div>

                {contactsOpen === h.id && <HouseholdContacts householdId={h.id} orgId={orgId} />}

                {addingTo === h.id && (
                  <div className="mt-auto pt-3 border-t border-gray-100 space-y-2">
                    <SearchSelect
                      value={memberForm.user_id}
                      onChange={(id) => setMemberForm({ ...memberForm, user_id: id })}
                      options={members}
                      getId={(m) => m.id}
                      getLabel={(m) => `${m.name}${m.is_student ? ' (student)' : ''}`}
                      placeholder="Search people…"
                    />
                    <div className="flex gap-2">
                      <select
                        value={memberForm.relationship}
                        onChange={(e) => setMemberForm({ ...memberForm, relationship: e.target.value })}
                        className={`${field} flex-1`}
                      >
                        <option value="student">student</option>
                        <option value="guardian">guardian</option>
                        <option value="other">other</option>
                      </select>
                      <Button size="sm" onClick={() => addMember(h.id)}>Add</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const cField = 'rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

// Family-shared emergency contacts (per-student rows aggregated across the household).
const HouseholdContacts = ({ householdId, orgId }) => {
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
      setNc({ name: '', relationship: '', phone: '', email: '' })
      setAdding(false)
      toast.success('Added for the family')
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not add contact') }
  }

  const remove = async (ids) => {
    try {
      const r = await api.post(`/api/sis/households/${householdId}/emergency-contacts/delete`, { ids, organization_id: orgId })
      setContacts(r.data?.contacts || [])
    } catch { toast.error('Could not remove contact') }
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Emergency contacts</span>
        {!adding && <button onClick={() => setAdding(true)} className="text-sm text-optio-purple font-medium hover:underline">+ Add</button>}
      </div>
      {loading ? <p className="text-sm text-neutral-400">Loading…</p> : (
        <div className="space-y-1.5">
          {contacts.length === 0 && !adding && <p className="text-sm text-neutral-400">None yet.</p>}
          {contacts.map((c) => (
            <div key={c.ids.join(',')} className="flex items-center justify-between text-sm gap-2">
              <span className="min-w-0 truncate">
                <span className="font-medium text-neutral-800">{c.name}</span>
                {c.relationship && <span className="text-neutral-400"> · {c.relationship}</span>}
                {c.student_count < c.total_students && <span className="ml-1 text-xs text-amber-600" title="Not on every student in the family">partial</span>}
                <span className="block text-xs text-neutral-400">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
              </span>
              <button onClick={() => remove(c.ids)} className="text-red-500 hover:underline flex-shrink-0">Remove</button>
            </div>
          ))}
        </div>
      )}
      {adding && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} className={cField} placeholder="Name" autoFocus />
          <input value={nc.relationship} onChange={(e) => setNc({ ...nc, relationship: e.target.value })} className={cField} placeholder="Relationship" />
          <input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} className={cField} placeholder="Phone" />
          <input value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} className={cField} placeholder="Email" />
          <div className="col-span-2 flex gap-2">
            <Button size="sm" onClick={add}>Add for family</Button>
            <button onClick={() => setAdding(false)} className="text-sm text-neutral-500 hover:underline">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default HouseholdsPage
