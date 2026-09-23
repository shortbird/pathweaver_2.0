import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
 * Readable by guardians and staff, not students, since 2026-09-22 (82485501:
 * "should students have access to the entire family directory?" -- no). The
 * route sends a student home and the backend refuses them.
 *
 * How a family is LISTED (the switch and which contact details show) is not
 * on this page any more. iCreate asked for it "in a more hidden place (Like
 * settings.)" (2d456409, 2026-09-22), so it lives in Family Settings, on the
 * Directory tab (components/parent/DirectoryListingSettings), and this page
 * links there. "Carpool message can remain on top": the carpool checkbox and
 * filter stay here.
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
      })
      .catch(() => setOptedIn(false))
  }, [orgId])

  /**
   * The carpool flag, saved optimistically: it moves on the click, and goes
   * back and says why if the save fails. Only opted_in and carpool_interest
   * are sent -- the backend writes the keys it is given, so the sharing
   * choices made in Family Settings are left alone. The list refreshes in the
   * background, because the Carpool chip is on it.
   */
  const toggleCarpool = async () => {
    const next = !carpool
    setCarpool(next)
    try {
      await api.put(`/api/sis/parent/directory/opt-in?organization_id=${orgId}`,
        { opted_in: optedIn, carpool_interest: next })
      api.get(`/api/sis/parent/directory?organization_id=${orgId}`)
        .then((r) => setFamilies(r.data?.families || []))
        .catch(() => { /* the list is stale, not wrong — leave what's on screen */ })
      toast.success(next
        ? 'Other families can see you are open to carpooling'
        : 'Carpooling interest removed')
    } catch (e) {
      setCarpool(!next)
      toast.error(e?.response?.data?.error || 'Could not update your directory setting')
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
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Family Directory</h1>
      <p className="text-sm text-gray-500 mb-6">
        Connect with other {org?.organization_name || 'school'} families.{' '}
        {defaultIn
          ? 'Every family is listed unless they ask to be left out, and you choose what of yours is shown.'
          : `Only families who opt in appear here — ${org?.organization_name || 'staff'} can always reach everyone either way.`}
      </p>

      {orgs && orgs.length > 1 && (
        <select
          value={orgId || ''} onChange={(e) => { setFamilies(null); setOptedIn(null); setOrgId(e.target.value) }}
          className="mb-5 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
        >
          {orgs.map((o) => <option key={o.organization_id} value={o.organization_id}>{o.organization_name}</option>)}
        </select>
      )}

      {orgs?.length === 0 && <p className="text-gray-500">Your account isn't linked to a school yet.</p>}

      {orgId && isGuardian && optedIn !== null && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
          {optedIn && (
            <label className="mb-3 flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox" checked={carpool}
                onChange={toggleCarpool}
                className="mt-0.5 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
              />
              <span>
                We're open to carpooling
                <span className="block text-xs text-gray-500">
                  Other families can filter for this and reach out to arrange a ride share.
                </span>
              </span>
            </label>
          )}
          <p className="text-xs text-gray-500">
            {optedIn ? 'Your family is listed.' : 'Your family is not listed.'}{' '}
            <Link to="/family?settings=directory" className="font-medium text-optio-purple hover:underline">
              Change how your family is listed
            </Link>
          </p>
        </div>
      )}

      {orgId && families === null && <p className="text-gray-500">Loading…</p>}
      {families?.length === 0 && (
        <p className="text-gray-500">No families have joined the directory yet{optedIn === false ? ' — yours could be the first' : ''}.</p>
      )}

      {carpoolCount > 0 && (
        <div className="mb-4">
          <button
            type="button" onClick={() => setCarpoolOnly((v) => !v)}
            className={`btn-quiet ${carpoolOnly ? 'border-optio-purple text-optio-purple' : ''}`}
          >
            {carpoolOnly ? 'Showing families open to carpooling' : `Open to carpooling (${carpoolCount})`}
          </button>
        </div>
      )}

      {carpoolOnly && shownFamilies.length === 0 && (
        <p className="text-gray-500">No families have flagged carpooling yet.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {shownFamilies.map((f) => (
          <div key={f.household_id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="font-semibold text-gray-900">{f.family_name}</h3>
              {f.carpool_interest && (
                <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-optio-purple/10 text-optio-purple flex-shrink-0">
                  Carpool
                </span>
              )}
            </div>
            {f.city && <p className="text-xs text-gray-500 mb-1">{f.city}</p>}
            {f.students.length > 0 && (
              <p className="text-xs text-gray-500 mb-2">Kids: {f.students.join(', ')}</p>
            )}
            <div className="space-y-1">
              {f.guardians.map((g, i) => (
                <div key={i} className="text-sm text-gray-700">
                  {g.name}
                  {g.email && (
                    <a href={`mailto:${g.email}`} className="ml-2 text-xs text-optio-purple hover:underline">{g.email}</a>
                  )}
                </div>
              ))}
              {f.phone && <div className="text-sm text-gray-500">{f.phone}</div>}
              {f.address && <div className="text-sm text-gray-500">{f.address}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default FamilyDirectoryPage
