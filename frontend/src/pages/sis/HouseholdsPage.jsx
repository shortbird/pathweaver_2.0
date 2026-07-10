import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import FamilyDetailModal from './FamilyDetailModal'

const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const HouseholdsPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [households, setHouseholds] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

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

  // Keep the open modal in sync with fresh data (after edits reflect immediately).
  useEffect(() => {
    if (!selected) return
    const fresh = households.find((h) => h.id === selected.id)
    if (fresh) setSelected(fresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [households])

  const createHousehold = async () => {
    if (!newName.trim()) return
    try {
      await api.post('/api/sis/households', { name: newName.trim(), organization_id: orgId })
      setNewName('')
      toast.success('Family created')
      load()
    } catch { toast.error('Could not create family') }
  }

  const memberPreview = (list = []) => {
    if (!list.length) return 'No members yet'
    const names = list.map((m) => m.name)
    return names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '')
  }

  // Search matches the family name AND every member's name, so a kid whose
  // last name differs from the household name is still findable.
  const q = search.trim().toLowerCase()
  const visibleHouseholds = q
    ? households.filter((h) =>
        (h.name || '').toLowerCase().includes(q) ||
        (h.members || []).some((m) => (m.name || '').toLowerCase().includes(q)))
    : households

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

      {!loading && households.length > 0 && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${field} w-full sm:w-80 mb-4`}
          placeholder="Search families or any family member…"
        />
      )}

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !households.length && (
        <p className="text-neutral-500">No families yet. Create one above to group students and guardians.</p>
      )}
      {!loading && households.length > 0 && !visibleHouseholds.length && (
        <p className="text-neutral-500">No family or member matches "{search}".</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleHouseholds.map((h) => {
          const count = (h.members || []).length
          return (
            <button
              key={h.id}
              onClick={() => setSelected(h)}
              className="text-left bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col hover:border-optio-purple hover:shadow-md transition-all"
            >
              <div className="relative h-28 bg-gradient-to-br from-optio-purple/10 to-optio-pink/10">
                {h.image_url ? (
                  <img src={h.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-optio-purple/30">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM3 21v-1a6 6 0 0112 0v1M16 3.13a4 4 0 010 7.75M21 21v-1a6 6 0 00-4-5.659" />
                    </svg>
                  </div>
                )}
                <span className="absolute top-2 right-2 text-[11px] font-medium rounded-full px-2 py-0.5 bg-white/90 text-optio-purple shadow-sm">
                  {count} member{count === 1 ? '' : 's'}
                </span>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="font-semibold text-neutral-900 truncate">{h.name}</h3>
                  {h.registration_hold && (
                    <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-red-100 text-red-700 flex-shrink-0"
                      title={h.registration_hold_reason || 'Registration on hold'}>Hold</span>
                  )}
                </div>
                <p className="text-sm text-neutral-500 truncate mt-0.5">{memberPreview(h.members)}</p>
              </div>
            </button>
          )
        })}
      </div>

      {selected && (
        <FamilyDetailModal
          household={selected}
          orgId={orgId}
          members={members}
          onClose={() => setSelected(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}

export default HouseholdsPage
