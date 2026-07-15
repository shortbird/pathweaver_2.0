import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import ICreateRegistrationSettings from '../../components/sis/ICreateRegistrationSettings'
import AgeExceptionRequestsCard from '../../components/sis/AgeExceptionRequestsCard'

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
          <AgeExceptionRequestsCard key={`aex-${orgId}`} orgId={orgId} />
          <EnrollmentWaitlistCard key={`ewl-${orgId}`} orgId={orgId} />
          <SchoolYearCard key={`year-${orgId}`} orgId={orgId} org={orgData.organization} onUpdate={fetchOrg} />
          <AgeGatesCard key={`gates-${orgId}`} orgId={orgId} org={orgData.organization} onUpdate={fetchOrg} />
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

// Age groups whose NEW registrations join an enrollment waitlist instead of
// picking classes (sis_settings.enrollment_age_gates). Toggling a band open
// only affects future registrants — students already waiting stay on the list
// until released from the card above.
const AgeGatesCard = ({ orgId, org, onUpdate }) => {
  const settings = org.feature_flags?.sis_settings || {}
  const [gates, setGates] = useState(settings.enrollment_age_gates || [])
  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (next) => {
    setSaving(true)
    const prev = gates
    setGates(next)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: {
          ...(org.feature_flags || {}),
          sis_settings: { ...settings, enrollment_age_gates: next },
        },
      })
      toast.success('Age groups saved')
      onUpdate && onUpdate()
    } catch (e) {
      setGates(prev)
      toast.error(e.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  const addBand = () => {
    const lo = minAge === '' ? null : Number(minAge)
    const hi = maxAge === '' ? null : Number(maxAge)
    if (lo == null && hi == null) return toast.error('Give the band a minimum or maximum age')
    if (lo != null && hi != null && lo > hi) return toast.error('Minimum age cannot be greater than maximum')
    save([...gates, { min_age: lo, max_age: hi, mode: 'waitlist' }])
    setMinAge(''); setMaxAge('')
  }

  const bandText = (g) => (g.min_age != null && g.max_age != null
    ? `Ages ${g.min_age}–${g.max_age}`
    : g.min_age != null ? `Ages ${g.min_age}+` : `Up to age ${g.max_age}`)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-neutral-900">Enrollment age groups</h2>
      <p className="text-sm text-neutral-500 mb-4">
        New students whose age (on the first day of school) falls in a waitlisted band finish
        registering but can't choose classes until you release them. Removing a band only
        affects future registrations — students already waiting stay until released.
      </p>
      {gates.length > 0 && (
        <div className="space-y-2 mb-4">
          {gates.map((g, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
              <span className="text-sm font-medium text-neutral-800">
                {bandText(g)}
                <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">Waitlist</span>
              </span>
              <button onClick={() => save(gates.filter((_, j) => j !== i))} disabled={saving}
                className="text-sm text-neutral-500 hover:text-red-600 hover:underline disabled:opacity-50">
                Open this group
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input type="number" min={0} value={minAge} onChange={(e) => setMinAge(e.target.value)}
          placeholder="Min age" aria-label="Minimum age"
          className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple" />
        <span className="text-neutral-400">to</span>
        <input type="number" min={0} value={maxAge} onChange={(e) => setMaxAge(e.target.value)}
          placeholder="Max age" aria-label="Maximum age"
          className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple" />
        <button onClick={addBand} disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold border border-optio-purple/40 text-optio-purple hover:bg-optio-purple/5 disabled:opacity-50">
          Waitlist this age group
        </button>
      </div>
    </div>
  )
}

// Students waiting on the enrollment age-group waitlist, grouped by band, in
// queue order. Releasing one student unlocks class selection for exactly that
// student (and reopens the family's deferred registration fee, if any).
const EnrollmentWaitlistCard = ({ orgId }) => {
  const [entries, setEntries] = useState([])
  const [busy, setBusy] = useState(null) // entry id (or band label) mid-release

  const reload = useCallback(() => {
    api.get(withOrg('/api/sis/enrollment-waitlist', orgId))
      .then((r) => setEntries(r.data?.entries || []))
      .catch(() => setEntries([]))
  }, [orgId])

  useEffect(() => { reload() }, [reload])

  const waiting = entries.filter((e) => e.status === 'waiting')
  const released = entries.filter((e) => e.status !== 'waiting')
  if (!entries.length) return null

  const bands = [...new Map(waiting.map((e) => [e.band_label, e])).values()]

  const releaseOne = async (e) => {
    setBusy(e.id)
    try {
      const { data } = await api.post(`/api/sis/enrollment-waitlist/${e.id}/release`, { organization_id: orgId })
      toast.success(`${e.student_name} released — ${data.emailed ? 'their family was emailed' : 'email could not be sent, contact the family'}${data.fee_due_cents > 0 ? `. Their $${(data.fee_due_cents / 100).toFixed(2)} registration fee is now due.` : ''}`)
      reload()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not release the student')
    } finally { setBusy(null) }
  }

  const releaseBand = async (band) => {
    const members = waiting.filter((e) => e.band_label === band.band_label)
    if (!window.confirm(`Release all ${members.length} waiting student${members.length === 1 ? '' : 's'} (${band.band_label})? Each family will be emailed.`)) return
    setBusy(band.band_label)
    try {
      await api.post('/api/sis/enrollment-waitlist/release-band', {
        organization_id: orgId,
        band_min_age: band.band_min_age ?? null,
        band_max_age: band.band_max_age ?? null,
      })
      toast.success('All waiting students in the group were released')
      reload()
    } catch { toast.error('Could not release the group') } finally { setBusy(null) }
  }

  return (
    <div className="bg-white rounded-xl border border-amber-300 p-4">
      <h2 className="font-semibold text-neutral-900">Enrollment waitlist</h2>
      <p className="text-xs text-neutral-500 mt-0.5 mb-3">
        Students whose age group is waitlisted. Releasing a student lets them choose classes
        and emails their family{' — '}release only as many as you have room for.
      </p>
      {waiting.length === 0 && <p className="text-sm text-neutral-400">No one is waiting.</p>}
      {bands.map((band) => {
        const members = waiting.filter((e) => e.band_label === band.band_label)
        return (
          <div key={band.band_label} className="mb-3 last:mb-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {band.band_label} · {members.length} waiting
              </span>
              {members.length > 1 && (
                <button onClick={() => releaseBand(band)} disabled={busy === band.band_label}
                  className="text-xs text-optio-purple font-medium hover:underline disabled:opacity-50">
                  Release all {members.length}
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {members.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2">
                  <div className="min-w-0 text-sm">
                    <span className="font-medium text-neutral-900">#{e.position} {e.student_name}</span>
                    {e.age_snapshot != null && <span className="text-neutral-400"> · age {e.age_snapshot}</span>}
                    {e.guardian_name && <span className="text-neutral-400"> · {e.guardian_name}</span>}
                  </div>
                  <button onClick={() => releaseOne(e)} disabled={busy === e.id}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:opacity-90 disabled:opacity-50">
                    {busy === e.id ? 'Releasing…' : 'Release'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {released.length > 0 && (
        <details className="mt-3">
          <summary className="text-sm text-neutral-500 cursor-pointer select-none">
            Released ({released.length})
          </summary>
          <div className="mt-2 space-y-1">
            {released.map((e) => (
              <div key={e.id} className="text-xs text-neutral-500">
                <span className="text-green-600 font-semibold">released</span> {e.student_name}
                <span className="text-neutral-400"> · {e.band_label}</span>
              </div>
            ))}
          </div>
        </details>
      )}
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
