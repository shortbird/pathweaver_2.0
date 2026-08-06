import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import useSchoolContext from '../hooks/useSchoolContext'
import BackToSchool from '../components/navigation/BackToSchool'

/**
 * Family Directory — the contact list families use to reach each other.
 *
 * Two models, chosen per school (sis_settings.directory_default_in): opt-in,
 * where a family joins deliberately, or default-listed, where every family is
 * in it until they say otherwise. iCreate asked for the second — an opt-in
 * directory that nobody opts into is an empty directory.
 *
 * Readable by everyone in the school as of 2026-08-06, not only by other
 * guardians — students and staff too. The toggle's copy says so outright
 * rather than leaving families to assume a family-to-family audience.
 *
 * Carpooling is the reason the city is shown: a family can flag that they're
 * open to sharing a drive, and the list filters down to those families.
 */
const FamilyDirectoryPage = () => {
  const { orgs, isGuardian } = useSchoolContext()
  const [orgId, setOrgId] = useState(null)
  const [families, setFamilies] = useState(null)
  const [optedIn, setOptedIn] = useState(null) // null until loaded
  const [defaultIn, setDefaultIn] = useState(false)
  const [carpool, setCarpool] = useState(false)
  const [carpoolOnly, setCarpoolOnly] = useState(false)
  const [shares, setShares] = useState({ share_email: true, share_phone: true, share_address: false })
  const [savingOptIn, setSavingOptIn] = useState(false)

  useEffect(() => {
    if (orgs?.length && !orgId) setOrgId(orgs[0].organization_id)
  }, [orgs, orgId])

  useEffect(() => {
    if (!orgId) return
    api.get(`/api/sis/parent/directory?organization_id=${orgId}`)
      .then((r) => setFamilies(r.data?.families || []))
      .catch(() => { toast.error('Could not load the directory'); setFamilies([]) })
    api.get(`/api/sis/parent/directory/opt-in?organization_id=${orgId}`)
      .then((r) => {
        setOptedIn(!!r.data?.opted_in)
        setDefaultIn(r.data?.default_in === true)
        setCarpool(r.data?.carpool_interest === true)
        setShares({
          share_email: r.data?.share_email !== false,
          share_phone: r.data?.share_phone !== false,
          share_address: r.data?.share_address === true,
        })
      })
      .catch(() => setOptedIn(false))
  }, [orgId])

  const saveOptIn = async (nextOptedIn, nextShares, nextCarpool = carpool) => {
    setSavingOptIn(true)
    try {
      await api.put(`/api/sis/parent/directory/opt-in?organization_id=${orgId}`,
        { opted_in: nextOptedIn, carpool_interest: nextCarpool, ...nextShares })
      setOptedIn(nextOptedIn)
      setShares(nextShares)
      setCarpool(nextCarpool)
      const r = await api.get(`/api/sis/parent/directory?organization_id=${orgId}`)
      setFamilies(r.data?.families || [])
      return true
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not update your directory setting')
      return false
    } finally { setSavingOptIn(false) }
  }

  const toggleOptIn = async () => {
    const next = !optedIn
    if (await saveOptIn(next, shares)) {
      toast.success(next ? 'Your family is now in the directory' : 'Your family was removed from the directory')
    }
  }

  const toggleShare = async (key) => {
    const nextShares = { ...shares, [key]: !shares[key] }
    if (await saveOptIn(optedIn, nextShares)) toast.success('Sharing preference saved')
  }

  const toggleCarpool = async () => {
    const next = !carpool
    if (await saveOptIn(optedIn, shares, next)) {
      toast.success(next
        ? 'Other families can see you are open to carpooling'
        : 'Carpooling interest removed')
    }
  }

  const org = orgs?.find((o) => o.organization_id === orgId)
  const carpoolCount = (families || []).filter((f) => f.carpool_interest).length
  const shownFamilies = carpoolOnly
    ? (families || []).filter((f) => f.carpool_interest)
    : (families || [])

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <BackToSchool className="mb-3" />
      <h1 className="text-2xl font-bold text-neutral-900 mb-1">Family Directory</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Connect with other {org?.organization_name || 'school'} families.{' '}
        {defaultIn
          ? 'Every family is listed unless they ask to be left out, and you choose what of yours is shown.'
          : 'Only families who opt in appear here — the school can always reach everyone either way.'}
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

      {orgId && isGuardian && optedIn !== null && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-neutral-900">
                {defaultIn ? 'Our family is listed in the directory' : 'Include our family in the directory'}
              </div>
              <div className="text-xs text-neutral-500">
                Visible to everyone at {org?.organization_name || 'the school'} — families, students and staff.
                Always shows your family name, parent names, and your kids' first names. You choose the rest below.
                {defaultIn && ' Turn this off to be left out entirely.'}
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
          {optedIn && (
            <>
              <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-x-5 gap-y-2">
                {[['share_email', 'Parent emails'], ['share_phone', 'Family phone'], ['share_address', 'Street address']].map(([key, label]) => (
                  <label key={key} className="inline-flex items-center gap-1.5 text-sm text-neutral-700 cursor-pointer">
                    <input
                      type="checkbox" checked={!!shares[key]} disabled={savingOptIn}
                      onChange={() => toggleShare(key)}
                      className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <label className="inline-flex items-start gap-2 text-sm text-neutral-700 cursor-pointer">
                  <input
                    type="checkbox" checked={carpool} disabled={savingOptIn}
                    onChange={toggleCarpool}
                    className="mt-0.5 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                  />
                  <span>
                    We're open to carpooling
                    <span className="block text-xs text-neutral-500">
                      Other families can filter for this and reach out to arrange a ride share.
                    </span>
                  </span>
                </label>
              </div>
            </>
          )}
        </div>
      )}

      {orgId && families === null && <p className="text-neutral-500">Loading…</p>}
      {families?.length === 0 && (
        <p className="text-neutral-500">No families have joined the directory yet{optedIn === false ? ' — yours could be the first' : ''}.</p>
      )}

      {carpoolCount > 0 && (
        <div className="mb-4">
          <button
            type="button" onClick={() => setCarpoolOnly((v) => !v)}
            className={`text-sm rounded-full px-3 py-1.5 border transition-colors ${carpoolOnly
              ? 'bg-optio-purple text-white border-optio-purple'
              : 'bg-white text-neutral-700 border-gray-300 hover:border-optio-purple'}`}
          >
            {carpoolOnly ? 'Showing families open to carpooling' : `Open to carpooling (${carpoolCount})`}
          </button>
        </div>
      )}

      {carpoolOnly && shownFamilies.length === 0 && (
        <p className="text-neutral-500">No families have flagged carpooling yet.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {shownFamilies.map((f) => (
          <div key={f.household_id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="font-semibold text-neutral-900">{f.family_name}</h3>
              {f.carpool_interest && (
                <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-optio-purple/10 text-optio-purple flex-shrink-0">
                  Carpool
                </span>
              )}
            </div>
            {f.city && <p className="text-xs text-neutral-500 mb-1">{f.city}</p>}
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
              {f.address && <div className="text-sm text-neutral-500">{f.address}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default FamilyDirectoryPage
