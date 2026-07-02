import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'

/**
 * Family Directory — opt-in contact list so families can reach each other.
 * Families that don't opt in are invisible here (staff can always reach
 * everyone through the school). The family's own opt-in toggle lives at the top.
 */
const FamilyDirectoryPage = () => {
  const [orgs, setOrgs] = useState(null)
  const [orgId, setOrgId] = useState(null)
  const [families, setFamilies] = useState(null)
  const [optedIn, setOptedIn] = useState(null) // null until loaded
  const [savingOptIn, setSavingOptIn] = useState(false)

  useEffect(() => {
    api.get('/api/sis/parent/context')
      .then((r) => {
        const list = r.data?.orgs || []
        setOrgs(list)
        if (list.length) setOrgId(list[0].organization_id)
      })
      .catch(() => { toast.error('Could not load your school'); setOrgs([]) })
  }, [])

  useEffect(() => {
    if (!orgId) return
    api.get(`/api/sis/parent/directory?organization_id=${orgId}`)
      .then((r) => setFamilies(r.data?.families || []))
      .catch(() => { toast.error('Could not load the directory'); setFamilies([]) })
    api.get(`/api/sis/parent/directory/opt-in?organization_id=${orgId}`)
      .then((r) => setOptedIn(!!r.data?.opted_in))
      .catch(() => setOptedIn(false))
  }, [orgId])

  const toggleOptIn = async () => {
    const next = !optedIn
    setSavingOptIn(true)
    try {
      await api.put(`/api/sis/parent/directory/opt-in?organization_id=${orgId}`, { opted_in: next })
      setOptedIn(next)
      toast.success(next ? 'Your family is now in the directory' : 'Your family was removed from the directory')
      const r = await api.get(`/api/sis/parent/directory?organization_id=${orgId}`)
      setFamilies(r.data?.families || [])
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not update your directory setting')
    } finally { setSavingOptIn(false) }
  }

  const org = orgs?.find((o) => o.organization_id === orgId)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900 mb-1">Family Directory</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Connect with other {org?.organization_name || 'school'} families. Only families who opt in appear here —
        the school can always reach everyone either way.
      </p>

      {orgs && orgs.length > 1 && (
        <select
          value={orgId || ''} onChange={(e) => { setFamilies(null); setOptedIn(null); setOrgId(e.target.value) }}
          className="mb-5 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
        >
          {orgs.map((o) => <option key={o.organization_id} value={o.organization_id}>{o.organization_name}</option>)}
        </select>
      )}

      {orgs?.length === 0 && <p className="text-neutral-500">Your account isn't linked to a school yet.</p>}

      {orgId && optedIn !== null && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-neutral-900">Include our family in the directory</div>
            <div className="text-xs text-neutral-500">
              Shares your family name, parent names and emails, family phone, and your kids' first names with other families.
            </div>
          </div>
          <button
            type="button" role="switch" aria-checked={optedIn} aria-label="Include our family in the directory"
            onClick={toggleOptIn} disabled={savingOptIn}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${optedIn ? 'bg-optio-purple' : 'bg-neutral-300'} ${savingOptIn ? 'opacity-50' : ''}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${optedIn ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      )}

      {orgId && families === null && <p className="text-neutral-500">Loading…</p>}
      {families?.length === 0 && (
        <p className="text-neutral-500">No families have joined the directory yet{optedIn === false ? ' — yours could be the first' : ''}.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(families || []).map((f) => (
          <div key={f.household_id} className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-neutral-900 mb-1">{f.family_name}</h3>
            {f.students.length > 0 && (
              <p className="text-xs text-neutral-500 mb-2">Kids: {f.students.join(', ')}</p>
            )}
            <div className="space-y-1">
              {f.guardians.map((g, i) => (
                <div key={i} className="text-sm text-neutral-700">
                  {g.name}
                  {g.email && (
                    <a href={`mailto:${g.email}`} className="ml-2 text-xs text-optio-purple hover:underline">{g.email}</a>
                  )}
                </div>
              ))}
              {f.phone && <div className="text-sm text-neutral-500">{f.phone}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default FamilyDirectoryPage
