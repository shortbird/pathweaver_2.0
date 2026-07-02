import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'

/**
 * Resources — the school's document library for families (family guidebook,
 * student contract, forms). Read-only; staff manage the list in the SIS.
 */
const FamilyResourcesPage = () => {
  const [orgs, setOrgs] = useState(null)
  const [orgId, setOrgId] = useState(null)
  const [resources, setResources] = useState(null)

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
    api.get(`/api/sis/parent/resources?organization_id=${orgId}`)
      .then((r) => setResources(r.data?.resources || []))
      .catch(() => { toast.error('Could not load resources'); setResources([]) })
  }, [orgId])

  const org = orgs?.find((o) => o.organization_id === orgId)
  const grouped = (resources || []).reduce((acc, r) => {
    const key = r.category || 'General'
    ;(acc[key] = acc[key] || []).push(r)
    return acc
  }, {})

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900 mb-1">Resources</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Documents and links from {org?.organization_name || 'your school'} — guidebooks, contracts, and forms you can refer back to any time.
      </p>

      {orgs && orgs.length > 1 && (
        <select
          value={orgId || ''} onChange={(e) => { setResources(null); setOrgId(e.target.value) }}
          className="mb-5 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
        >
          {orgs.map((o) => <option key={o.organization_id} value={o.organization_id}>{o.organization_name}</option>)}
        </select>
      )}

      {(orgs === null || (orgId && resources === null)) && <p className="text-neutral-500">Loading…</p>}
      {orgs?.length === 0 && <p className="text-neutral-500">Your account isn't linked to a school yet.</p>}
      {resources?.length === 0 && <p className="text-neutral-500">Your school hasn't published any resources yet.</p>}

      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">{category}</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {items.map((r) => (
              <a
                key={r.id} href={r.url} target="_blank" rel="noreferrer"
                className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-neutral-50 group"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-neutral-900 group-hover:text-optio-purple">{r.title}</span>
                  {r.description && <span className="block text-xs text-neutral-500">{r.description}</span>}
                </span>
                <svg className="w-4 h-4 text-neutral-300 group-hover:text-optio-purple flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default FamilyResourcesPage
