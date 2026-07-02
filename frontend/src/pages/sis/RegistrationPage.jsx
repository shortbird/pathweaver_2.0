import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import ICreateRegistrationSettings from '../../components/sis/ICreateRegistrationSettings'

/**
 * SIS Registration page (Operations) — everything about how families register:
 * the parent registration funnel config (link, fees, paperwork, questions),
 * staggered tier opening dates for class signup, and the imported legacy
 * registration list (who's prepaid / on hold, and who has re-registered).
 */
const RegistrationPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin, loading: orgLoading } = useSisOrg()
  const [orgData, setOrgData] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchOrg = useCallback(() => {
    if (!orgId) { setOrgData(null); setLoading(false); return }
    setLoading(true)
    api.get(`/api/admin/organizations/${orgId}`)
      .then((r) => setOrgData(r.data))
      .catch(() => setOrgData(null))
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => { fetchOrg() }, [fetchOrg])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Registration</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      {(loading || orgLoading) ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
        </div>
      ) : !orgId ? (
        <p className="text-neutral-500">Select an organization to manage its registration.</p>
      ) : !orgData?.organization ? (
        <p className="text-neutral-500">Organization not found.</p>
      ) : (
        <div className="grid gap-6">
          {/* key remounts the uncontrolled forms when the superadmin switches orgs */}
          <TierOpeningCard key={`tiers-${orgId}`} orgId={orgId} org={orgData.organization} onUpdate={fetchOrg} />
          <ICreateRegistrationSettings key={`icr-${orgId}`} orgId={orgId} orgData={orgData} onUpdate={fetchOrg} />
          <ImportedFamiliesCard key={`dir-${orgId}`} orgId={orgId} />
        </div>
      )}
    </div>
  )
}

// The class-registration window: staggered tier opening dates (each family tier
// gets its own open date; "default" covers untiered families; no dates =
// registration always open) and the first day of school, which closes parent
// self-service schedule changes.
const TierOpeningCard = ({ orgId, org, onUpdate }) => {
  const settings = org.feature_flags?.sis_settings || {}
  const stored = settings.registration_tier_dates || {}
  const [dates, setDates] = useState({
    1: stored['1'] || '', 2: stored['2'] || '',
    3: stored['3'] || '', default: stored.default || '',
  })
  const [firstDay, setFirstDay] = useState(settings.first_day_of_school || '')
  const [saving, setSaving] = useState(false)

  const saveSettings = async (patch, successMsg) => {
    setSaving(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: {
          ...(org.feature_flags || {}),
          sis_settings: { ...settings, ...patch },
        },
      })
      toast.success(successMsg)
      onUpdate && onUpdate()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  const saveDate = (key, value) => {
    const next = { ...dates, [key]: value }
    setDates(next)
    const cleaned = Object.fromEntries(Object.entries(next).filter(([, v]) => v))
    saveSettings({ registration_tier_dates: Object.keys(cleaned).length ? cleaned : null },
      'Registration opening dates saved')
  }

  const saveFirstDay = (value) => {
    setFirstDay(value)
    saveSettings({ first_day_of_school: value || null },
      value ? 'First day of school saved' : 'First day of school cleared')
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-neutral-900 mb-1">Class registration opens</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Stagger when families can start signing up for classes. Assign each family a tier on its
        Families card; families without a tier use the "Everyone else" date. Leave all blank to
        keep registration open to everyone.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[['1', 'Tier 1'], ['2', 'Tier 2'], ['3', 'Tier 3'], ['default', 'Everyone else']].map(([key, label]) => (
          <label key={key} className="text-xs text-neutral-500 block">{label}
            <input
              type="date" value={dates[key]} disabled={saving}
              onChange={(e) => saveDate(key, e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple disabled:opacity-50"
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 mt-5 pt-5 border-t border-gray-100">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-neutral-900">First day of school</div>
          <div className="text-xs text-neutral-500">
            Families can add, drop, and waitlist classes in the Schedule Builder until this date; after
            that, schedule changes are made by staff here. Leave blank to keep it open.
          </div>
        </div>
        <input
          type="date" value={firstDay} disabled={saving}
          onChange={(e) => saveFirstDay(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple disabled:opacity-50"
        />
      </div>
    </div>
  )
}

// Families imported from the school's legacy registration list: their staged
// fee/hold/tier, and whether they've re-registered here yet (matched household).
// Renders nothing when no import has been loaded.
const ImportedFamiliesCard = ({ orgId }) => {
  const [directives, setDirectives] = useState(null)
  const [filter, setFilter] = useState('all') // all | pending | hold

  useEffect(() => {
    api.get(withOrg('/api/sis/family-directives', orgId))
      .then((r) => setDirectives(r.data?.directives || []))
      .catch(() => setDirectives([]))
  }, [orgId])

  if (!directives || directives.length === 0) return null

  const registered = directives.filter((d) => d.matched_household_id)
  const shown = directives.filter((d) => {
    if (filter === 'pending') return !d.matched_household_id
    if (filter === 'hold') return d.registration_hold
    return true
  })

  const FilterBtn = ({ value, label }) => (
    <button onClick={() => setFilter(value)}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
        filter === value ? 'bg-optio-purple text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
      }`}>
      {label}
    </button>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h2 className="text-lg font-semibold text-neutral-900">Imported families</h2>
        <span className="text-sm text-neutral-500">{registered.length} of {directives.length} re-registered</span>
      </div>
      <p className="text-sm text-neutral-500 mb-3">
        From the school's previous registration list. Each family's fee status, hold, and tier are
        applied automatically when they register here with the same email.
      </p>
      <div className="flex gap-2 mb-3">
        <FilterBtn value="all" label={`All (${directives.length})`} />
        <FilterBtn value="pending" label={`Not registered yet (${directives.length - registered.length})`} />
        <FilterBtn value="hold" label={`On hold (${directives.filter((d) => d.registration_hold).length})`} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-400 border-b border-gray-100">
              <th className="py-2 pr-3">Family</th>
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3">Tier</th>
              <th className="py-2 pr-3">Fee</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.id} className="border-b border-gray-50">
                <td className="py-2 pr-3 text-neutral-800">{(d.notes || '').split(' | ')[0] || '—'}</td>
                <td className="py-2 pr-3 text-neutral-500">{d.email}</td>
                <td className="py-2 pr-3 text-neutral-600">{d.registration_tier != null ? `Tier ${d.registration_tier}` : 'Default'}</td>
                <td className="py-2 pr-3">
                  {d.fee_prepaid
                    ? <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-green-100 text-green-700">Paid</span>
                    : <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">Unpaid</span>}
                </td>
                <td className="py-2">
                  <span className="inline-flex items-center gap-1.5 flex-wrap">
                    {d.matched_household_id
                      ? <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-green-100 text-green-700">Registered</span>
                      : <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-neutral-100 text-neutral-500">Not registered</span>}
                    {d.registration_hold && (
                      <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-red-100 text-red-700" title={d.hold_reason || ''}>Hold</span>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default RegistrationPage
