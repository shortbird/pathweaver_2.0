import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import SearchSelect from '../../components/ui/SearchSelect'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import FamilyDetailModal from './FamilyDetailModal'

const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const collageInitials = (name) =>
  (name || '?').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('')

/**
 * Card-hero fallback when a family hasn't uploaded a photo: the members' own
 * pictures as an overlapping row, sized down as the family grows. Guardians
 * first (they're likelier to have photos), at most six circles, then a +N
 * bubble for the rest.
 */
const MemberCollage = ({ members = [] }) => {
  const ordered = [...members].sort((a, b) =>
    (a.relationship === 'guardian' ? 0 : 1) - (b.relationship === 'guardian' ? 0 : 1))
  const shown = ordered.slice(0, 6)
  const extra = ordered.length - shown.length
  const size = shown.length <= 2 ? 'w-16 h-16 text-lg'
    : shown.length <= 4 ? 'w-14 h-14 text-base'
      : 'w-12 h-12 text-sm'
  const overlap = shown.length <= 2 ? '' : shown.length <= 4 ? '-ml-3 first:ml-0' : '-ml-4 first:ml-0'
  return (
    <div className="w-full h-full flex items-center justify-center px-3">
      <div className={`flex items-center ${shown.length <= 2 ? 'gap-2' : ''}`}>
        {shown.map((m) => (
          m.avatar_url ? (
            <img key={m.user_id} src={m.avatar_url} alt="" title={m.name}
              className={`${size} ${overlap} rounded-full object-cover border-2 border-white shadow-sm`} />
          ) : (
            <div key={m.user_id} title={m.name}
              className={`${size} ${overlap} rounded-full bg-gradient-to-br from-optio-purple to-optio-pink text-white flex items-center justify-center font-semibold border-2 border-white shadow-sm`}>
              {collageInitials(m.name)}
            </div>
          )
        ))}
        {extra > 0 && (
          <div className={`${size} ${overlap} rounded-full bg-white/90 text-optio-purple flex items-center justify-center font-semibold border-2 border-white shadow-sm`}>
            +{extra}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Students in the org who aren't in any family yet (school imports, accounts
 * connected before households existed). Each row lets staff drop the student
 * into a family in place; the add endpoint also normalizes their account (org
 * fields + parent links). "Connect by email" reaches accounts that are not in
 * the org yet, e.g. a kid's pre-existing Optio account a parent asked about.
 */
const UnassignedStudentsPanel = ({ students, households, orgId, onSaved }) => {
  const [picks, setPicks] = useState({}) // student_id -> household_id
  const [email, setEmail] = useState('')
  const [emailPick, setEmailPick] = useState('')
  const [busy, setBusy] = useState(null)

  const add = async (key, householdId, body, confirmDuplicate = false) => {
    if (!householdId) { toast.error('Pick a family first'); return }
    setBusy(key)
    try {
      await api.post(`/api/sis/households/${householdId}/members`,
        { ...body, relationship: 'student', organization_id: orgId,
          ...(confirmDuplicate ? { confirm_duplicate: true } : {}) })
      toast.success('Added to the family')
      setEmail(''); setEmailPick('')
      onSaved?.()
    } catch (e) {
      const d = e?.response?.data
      // The student already looks present in this family — confirm before doubling up.
      if (d?.needs_confirmation && !confirmDuplicate) {
        setBusy(null)
        return window.confirm(d.error) ? add(key, householdId, body, true) : undefined
      }
      toast.error(d?.error || 'Could not add to the family')
    }
    setBusy(null)
  }

  // Graduated / no-longer-enrolled students clutter this list. Marking them
  // graduated drops them off it without needing a family.
  const markGraduated = async (s) => {
    if (!window.confirm(`Mark ${s.name} as graduated and remove them from this list?`)) return
    setBusy(s.id)
    try {
      await api.patch(`/api/sis/enrollments/${s.id}`, { status: 'graduated', organization_id: orgId })
      toast.success(`${s.name} marked graduated`)
      onSaved?.()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not update')
    }
    setBusy(null)
  }

  if (!students.length && !households.length) return null
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
      <h2 className="font-semibold text-neutral-900">
        Students without a family
        {students.length > 0 && <span className="ml-2 text-sm font-normal text-neutral-500">{students.length}</span>}
      </h2>
      <p className="text-sm text-neutral-500 mt-0.5 mb-3">
        These students aren't grouped into a family yet, so they won't appear with their siblings
        on the Families or Learning Plan pages. Pick their family to connect them.
      </p>
      <div className="space-y-2">
        {students.map((s) => {
          const dup = s.possible_duplicate_of?.[0]
          return (
          <div key={s.id} className="flex items-center gap-2 flex-wrap bg-white rounded-lg border border-gray-200 px-3 py-2">
            <span className="text-sm font-medium text-neutral-800 min-w-0 truncate">{s.name}</span>
            {s.email && <span className="text-xs text-neutral-400 truncate">{s.email}</span>}
            {dup && (
              <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-amber-100 text-amber-700"
                title={`Looks like ${dup.name}, already in ${dup.household_name}. They may be the same student registered twice — merge instead of adding a second copy.`}>
                Possible duplicate of {dup.name} · {dup.household_name}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <SearchSelect
                value={picks[s.id] || ''}
                onChange={(id) => setPicks((p) => ({ ...p, [s.id]: id }))}
                options={households}
                getId={(h) => h.id}
                getLabel={(h) => h.name}
                placeholder="Search families…"
                className="w-56"
              />
              <Button size="sm" disabled={busy === s.id}
                onClick={() => add(s.id, picks[s.id], { user_id: s.id })}>
                {busy === s.id ? '…' : 'Add'}
              </Button>
              <button onClick={() => markGraduated(s)} disabled={busy === s.id}
                title="Remove from this list — marks the student graduated"
                className="text-xs text-neutral-400 hover:text-red-500 hover:underline flex-shrink-0">
                Graduated
              </button>
            </div>
          </div>
        )})}
        {!students.length && (
          <p className="text-sm text-neutral-400">Every student is in a family.</p>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-amber-200 flex items-center gap-2 flex-wrap">
        <span className="text-sm text-neutral-600">Connect a student's existing Optio account:</span>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
          placeholder="student@example.com" className={`${field} w-56`} />
        <SearchSelect value={emailPick} onChange={setEmailPick} options={households}
          getId={(h) => h.id} getLabel={(h) => h.name} placeholder="Search families…" className="w-56" />
        <Button size="sm" variant="outline" disabled={busy === 'email' || !email.trim()}
          onClick={() => add('email', emailPick, { email: email.trim() })}>
          {busy === 'email' ? '…' : 'Connect'}
        </Button>
      </div>
    </div>
  )
}

const HouseholdsPage = ({ embedded = false }) => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [households, setHouseholds] = useState([])
  const [members, setMembers] = useState([])
  const [unassigned, setUnassigned] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      api.get(withOrg('/api/sis/households', orgId)),
      api.get(withOrg('/api/sis/members', orgId)),
      api.get(withOrg('/api/sis/unassigned-students', orgId)),
    ])
      .then(([h, m, u]) => {
        setHouseholds(h.data?.households || [])
        setMembers(m.data?.members || [])
        setUnassigned(u.data?.students || [])
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
      setShowCreate(false)
      toast.success('Family created')
      load()
    } catch { toast.error('Could not create family') }
  }

  // Students show their age next to the name (staff asked to see ages at a
  // glance); guardians just show the name.
  const memberPreview = (list = []) => {
    if (!list.length) return 'No members yet'
    const labels = list.map((m) => (m.age != null ? `${m.name} (${m.age})` : m.name))
    return labels.slice(0, 3).join(', ') + (labels.length > 3 ? ` +${labels.length - 3}` : '')
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
      {!embedded && (
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">Families</h1>
          <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
        </div>
      )}

      {/* Search first — staff search far more often than they create, and a
          prominent Create button at the top led to accidental family creation. */}
      {!loading && households.length > 0 && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${field} w-full mb-3`}
          placeholder="Search families or any family member…"
        />
      )}

      {!loading && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-sm text-neutral-500">Most families are created when they register.</span>
          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="text-sm font-medium text-optio-purple hover:underline"
            >
              + Create a family manually
            </button>
          ) : (
            <div className="flex flex-1 min-w-[240px] gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createHousehold()}
                className={`${field} flex-1`}
                placeholder="New family / household name"
                autoFocus
              />
              <Button size="sm" onClick={createHousehold}>Create</Button>
              <Button size="sm" variant="outline" onClick={() => { setShowCreate(false); setNewName('') }}>Cancel</Button>
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !households.length && (
        <p className="text-neutral-500">No families yet. Create one above to group students and guardians.</p>
      )}
      {!loading && households.length > 0 && !visibleHouseholds.length && (
        <p className="text-neutral-500">No family or member matches "{search}".</p>
      )}

      {!loading && unassigned.length > 0 && (
        <UnassignedStudentsPanel
          students={unassigned}
          households={households}
          orgId={orgId}
          onSaved={load}
        />
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
                ) : count > 0 ? (
                  <MemberCollage members={h.members} />
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
