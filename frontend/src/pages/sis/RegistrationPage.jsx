import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import ICreateRegistrationSettings from '../../components/sis/ICreateRegistrationSettings'

/**
 * SIS Registration page (Operations) — everything about how families register:
 * the parent registration funnel config (link, fees, paperwork, questions),
 * the first day of school (closes self-service schedule changes), and the
 * prepaid/hold family list (who's prepaid / on hold, and who has registered).
 * Access to registration itself is controlled by who has the registration
 * link — there are no date-staggered tiers.
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
          <SchoolYearCard key={`year-${orgId}`} orgId={orgId} org={orgData.organization} onUpdate={fetchOrg} />
          <ICreateRegistrationSettings key={`icr-${orgId}`} orgId={orgId} orgData={orgData} onUpdate={fetchOrg} />
          <FamilyDirectivesCard key={`dir-${orgId}`} orgId={orgId} />
        </div>
      )}
    </div>
  )
}

// The first day of school closes parent self-service schedule changes. Class
// registration itself opens as soon as a family registers — access is
// controlled by who has the registration link, not by dates.
const SchoolYearCard = ({ orgId, org, onUpdate }) => {
  const settings = org.feature_flags?.sis_settings || {}
  const [firstDay, setFirstDay] = useState(settings.first_day_of_school || '')
  const [saving, setSaving] = useState(false)

  const saveFirstDay = async (value) => {
    setFirstDay(value)
    setSaving(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: {
          ...(org.feature_flags || {}),
          sis_settings: { ...settings, first_day_of_school: value || null },
        },
      })
      toast.success(value ? 'First day of school saved' : 'First day of school cleared')
      onUpdate && onUpdate()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-neutral-900">First day of school</h2>
          <div className="text-sm text-neutral-500">
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

// Parse a pasted list of emails: commas, semicolons, whitespace, and newlines
// all separate entries; "Name <email>" address-book formats are unwrapped.
const parseEmails = (text) => {
  const found = String(text || '').match(/[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/g) || []
  return [...new Set(found.map((e) => e.toLowerCase()))]
}

// Pre-staged family settings (sis_family_directives): who has already paid the
// registration fee (the school emails these in), who's on hold, and whether
// they've registered here yet (matched household). The paste box marks parents
// prepaid by email — applied automatically when they register with that email.
const FamilyDirectivesCard = ({ orgId }) => {
  const [directives, setDirectives] = useState(null)
  const [filter, setFilter] = useState('all') // all | pending | hold
  const [pasted, setPasted] = useState('')
  const [saving, setSaving] = useState(false)

  const reload = useCallback(() => {
    api.get(withOrg('/api/sis/family-directives', orgId))
      .then((r) => setDirectives(r.data?.directives || []))
      .catch(() => setDirectives([]))
  }, [orgId])

  useEffect(() => { reload() }, [reload])

  const emails = parseEmails(pasted)

  const markPrepaid = async () => {
    if (!emails.length) return toast.error('Paste at least one email address')
    setSaving(true)
    try {
      const byEmail = Object.fromEntries((directives || []).map((d) => [d.email, d]))
      const { data } = await api.post(withOrg('/api/sis/family-directives', orgId), {
        directives: emails.map((email) => ({
          ...(byEmail[email] || {}), // keep an existing hold/notes when re-marking
          email,
          fee_prepaid: true,
        })),
      })
      toast.success(`Marked ${data.saved} famil${data.saved === 1 ? 'y' : 'ies'} as prepaid`)
      setPasted('')
      reload()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not save')
    } finally { setSaving(false) }
  }

  const list = directives || []
  const registered = list.filter((d) => d.matched_household_id)
  const shown = list.filter((d) => {
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
        <h2 className="text-lg font-semibold text-neutral-900">Prepaid & held families</h2>
        {list.length > 0 && (
          <span className="text-sm text-neutral-500">{registered.length} of {list.length} registered</span>
        )}
      </div>
      <p className="text-sm text-neutral-500 mb-3">
        Paste the emails of parents who have already paid the registration fee. When they register
        with that email, their fee is waived automatically. Holds staged here are applied the same way.
      </p>

      <div className="mb-5">
        <textarea
          rows={3}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder={'parent1@example.com\nparent2@example.com, parent3@example.com'}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-optio-purple"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-neutral-400">
            {emails.length ? `${emails.length} email${emails.length === 1 ? '' : 's'} found` : 'Commas, spaces, or new lines all work.'}
          </span>
          <button onClick={markPrepaid} disabled={saving || !emails.length}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saving…' : 'Mark as prepaid'}
          </button>
        </div>
      </div>

      {list.length > 0 && (
        <>
          <div className="flex gap-2 mb-3">
            <FilterBtn value="all" label={`All (${list.length})`} />
            <FilterBtn value="pending" label={`Not registered yet (${list.length - registered.length})`} />
            <FilterBtn value="hold" label={`On hold (${list.filter((d) => d.registration_hold).length})`} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-400 border-b border-gray-100">
                  <th className="py-2 pr-3">Family</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Fee</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => (
                  <tr key={d.id} className="border-b border-gray-50">
                    <td className="py-2 pr-3 text-neutral-800">{(d.notes || '').split(' | ')[0] || '—'}</td>
                    <td className="py-2 pr-3 text-neutral-500">{d.email}</td>
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
        </>
      )}
    </div>
  )
}

export default RegistrationPage
