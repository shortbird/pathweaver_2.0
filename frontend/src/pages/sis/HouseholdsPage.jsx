import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

const HouseholdsPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [households, setHouseholds] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [addingTo, setAddingTo] = useState(null)
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
                  <button
                    onClick={() => setAddingTo(addingTo === h.id ? null : h.id)}
                    className="text-sm text-optio-purple font-medium hover:underline flex-shrink-0"
                  >
                    {addingTo === h.id ? 'Cancel' : '+ Add'}
                  </button>
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

                {addingTo === h.id && (
                  <div className="mt-auto pt-3 border-t border-gray-100 space-y-2">
                    <select
                      value={memberForm.user_id}
                      onChange={(e) => setMemberForm({ ...memberForm, user_id: e.target.value })}
                      className={`${field} w-full`}
                    >
                      <option value="">Select person…</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} {m.is_student ? '(student)' : ''}</option>
                      ))}
                    </select>
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

export default HouseholdsPage
