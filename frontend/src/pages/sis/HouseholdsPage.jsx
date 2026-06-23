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

      <div className="space-y-4">
        {households.map((h) => (
          <div key={h.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-neutral-900">{h.name}</h3>
              <button
                onClick={() => setAddingTo(addingTo === h.id ? null : h.id)}
                className="text-sm text-optio-purple font-medium hover:underline"
              >
                {addingTo === h.id ? 'Cancel' : '+ Add member'}
              </button>
            </div>

            <div className="space-y-1.5 mb-3">
              {(h.members || []).length === 0 && (
                <p className="text-sm text-neutral-400">No members yet.</p>
              )}
              {(h.members || []).map((m) => (
                <div key={m.user_id} className="flex items-center justify-between text-sm">
                  <span>
                    <span className="font-medium text-neutral-800">{m.name}</span>
                    <span className="text-neutral-400"> · {m.relationship}</span>
                    {m.is_primary_guardian && <span className="ml-2 text-xs text-optio-purple">primary guardian</span>}
                  </span>
                  <button onClick={() => removeMember(h.id, m.user_id)} className="text-red-500 hover:underline">Remove</button>
                </div>
              ))}
            </div>

            {addingTo === h.id && (
              <div className="flex gap-2 border-t border-gray-100 pt-3">
                <select
                  value={memberForm.user_id}
                  onChange={(e) => setMemberForm({ ...memberForm, user_id: e.target.value })}
                  className={`${field} flex-1`}
                >
                  <option value="">Select person…</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} {m.is_student ? '(student)' : ''}</option>
                  ))}
                </select>
                <select
                  value={memberForm.relationship}
                  onChange={(e) => setMemberForm({ ...memberForm, relationship: e.target.value })}
                  className={field}
                >
                  <option value="student">student</option>
                  <option value="guardian">guardian</option>
                  <option value="other">other</option>
                </select>
                <Button size="sm" onClick={() => addMember(h.id)}>Add</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default HouseholdsPage
