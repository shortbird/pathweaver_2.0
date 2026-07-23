import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import AgeExceptionRequestsCard from '../../components/sis/AgeExceptionRequestsCard'
import ScheduleApprovalsCard from '../../components/sis/ScheduleApprovalsCard'

/**
 * SIS Registration page — the enrollment operations queue: the day-to-day work
 * of processing families as they register. Schedule approvals, age-exception
 * requests, the enrollment waitlist (release/decline students), and the
 * prepaid/hold family list (who's prepaid / on hold, and who has registered).
 *
 * The registration CONFIG (the parent funnel — link, fees, paperwork, questions —
 * plus the first day of school and the waitlisted age groups) lives on the SIS
 * Settings page under "Registration & enrollment". This page is only the queues.
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
          <ScheduleApprovalsCard key={`subs-${orgId}`} orgId={orgId} />
          <AgeExceptionRequestsCard key={`aex-${orgId}`} orgId={orgId} />
          <EnrollmentWaitlistCard key={`ewl-${orgId}`} orgId={orgId} org={orgData.organization} />
          <FamilyDirectivesCard key={`dir-${orgId}`} orgId={orgId} />
        </div>
      )}
    </div>
  )
}

// The enrollment age-group waitlist workspace. Always visible so staff have a
// home for it: every active waitlist age group shows (even with nobody waiting),
// students queue in priority order, and staff release or decline them here.
// Releasing unlocks class selection and emails the family; "Not accepted"
// refunds that child's registration fee.
const EnrollmentWaitlistCard = ({ orgId, org }) => {
  const [entries, setEntries] = useState([])
  const [busy, setBusy] = useState(null) // entry id (or band label) mid-action
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    setLoading(true)
    api.get(withOrg('/api/sis/enrollment-waitlist', orgId))
      .then((r) => setEntries(r.data?.entries || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => { reload() }, [reload])

  const waiting = entries.filter((e) => e.status === 'waiting')
  const released = entries.filter((e) => e.status === 'released')
  const rejected = entries.filter((e) => e.status === 'rejected')

  // Match the backend's band_label so gate bands and entry bands line up.
  const gateLabel = (g) => (
    g.min_age != null && g.max_age != null ? `ages ${g.min_age}–${g.max_age}`
      : g.min_age != null ? `ages ${g.min_age}+`
        : g.max_age != null ? `up to age ${g.max_age}` : 'all ages')

  const gateBands = ((org?.feature_flags?.sis_settings?.enrollment_age_gates) || [])
    .filter((g) => g && g.mode === 'waitlist')

  // Seed with the configured waitlist age groups (so an active-but-empty group
  // still shows), then fold in waiting students — including any band that still
  // has students after its gate was reopened/removed.
  const bandMap = new Map()
  for (const g of gateBands) {
    const label = gateLabel(g)
    bandMap.set(label, { band_label: label, band_min_age: g.min_age ?? null, band_max_age: g.max_age ?? null, members: [], active: true })
  }
  for (const e of waiting) {
    if (!bandMap.has(e.band_label)) {
      bandMap.set(e.band_label, { band_label: e.band_label, band_min_age: e.band_min_age ?? null, band_max_age: e.band_max_age ?? null, members: [], active: false })
    }
    bandMap.get(e.band_label).members.push(e)
  }
  const bands = [...bandMap.values()].sort((a, b) => (a.band_min_age ?? 999) - (b.band_min_age ?? 999))
  for (const b of bands) b.members.sort((x, y) => (x.position ?? 0) - (y.position ?? 0))

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

  const rejectOne = async (e) => {
    if (!window.confirm(`Mark ${e.student_name} as NOT accepted? Their share of the family's registration fee will be refunded and their family emailed. This can't be undone.`)) return
    setBusy(e.id)
    try {
      const { data } = await api.post(`/api/sis/enrollment-waitlist/${e.id}/reject`, { organization_id: orgId })
      if (data.refund_error) {
        toast.error(`${e.student_name} marked not accepted, but the refund failed — refund the family manually.`)
      } else {
        toast.success(`${e.student_name} marked not accepted${data.refund_cents > 0 ? ` — $${(data.refund_cents / 100).toFixed(2)} refunded` : ''}${data.emailed ? ', family emailed' : ''}.`)
      }
      reload()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update the student')
    } finally { setBusy(null) }
  }

  const releaseBand = async (band) => {
    const n = band.members.length
    if (!window.confirm(`Release all ${n} waiting student${n === 1 ? '' : 's'} (${band.band_label})? Each family will be emailed.`)) return
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

  const Chip = ({ tone, children }) => (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{children}</span>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-neutral-900">Enrollment waitlist</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="bg-amber-100 text-amber-800">{waiting.length} waiting</Chip>
          {released.length > 0 && <Chip tone="bg-green-100 text-green-700">{released.length} released</Chip>}
          {rejected.length > 0 && <Chip tone="bg-gray-100 text-gray-600">{rejected.length} not accepted</Chip>}
        </div>
      </div>
      <p className="text-sm text-neutral-500 mt-1 mb-4">
        Students whose age group you've waitlisted queue here until you release them. Releasing lets
        a student choose classes and emails their family — release only as many as you have room for.
        "Not accepted" refunds that child's registration fee. Children with an accepted older sibling
        are tagged <span className="font-semibold text-optio-purple">sibling priority</span> and move
        up the line. Add or reopen waitlisted age groups in Settings → Registration &amp; enrollment.
      </p>

      {loading ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : bands.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center">
          <p className="text-sm font-medium text-neutral-600">No age groups are waitlisted.</p>
          <p className="text-sm text-neutral-400 mt-1">
            Add a waitlisted age group in Settings → Registration &amp; enrollment and students in that
            age will queue here as families register.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {bands.map((band) => (
            <div key={band.band_label} className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between gap-2 bg-gray-50 px-3 py-2 border-b border-gray-200">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {band.band_label} · {band.members.length} waiting
                  {!band.active && <span className="ml-2 normal-case font-normal text-[11px] text-neutral-400">(group reopened)</span>}
                </span>
                {band.members.length > 1 && (
                  <button onClick={() => releaseBand(band)} disabled={busy === band.band_label}
                    className="text-xs text-optio-purple font-medium hover:underline disabled:opacity-50">
                    Release all {band.members.length}
                  </button>
                )}
              </div>
              {band.members.length === 0 ? (
                <p className="text-sm text-neutral-400 px-3 py-3">No students waiting in this group yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {band.members.map((e) => (
                    <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0 text-sm">
                        <span className="font-medium text-neutral-900">#{e.position} {e.student_name}</span>
                        {e.priority && (
                          <span title="An older sibling has been accepted — this child has sibling priority"
                            className="ml-1.5 inline-block rounded-full bg-optio-purple/10 px-2 py-0.5 text-[11px] font-semibold text-optio-purple align-middle">
                            sibling priority
                          </span>
                        )}
                        {e.age_snapshot != null && <span className="text-neutral-400"> · age {e.age_snapshot}</span>}
                        {e.guardian_name && <span className="text-neutral-400"> · {e.guardian_name}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => rejectOne(e)} disabled={busy === e.id}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-neutral-600 hover:bg-gray-50 disabled:opacity-50">
                          Not accepted
                        </button>
                        <button onClick={() => releaseOne(e)} disabled={busy === e.id}
                          className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:opacity-90 disabled:opacity-50">
                          {busy === e.id ? 'Releasing…' : 'Release'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {released.length > 0 && (
        <details className="mt-4">
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
      {rejected.length > 0 && (
        <details className="mt-3">
          <summary className="text-sm text-neutral-500 cursor-pointer select-none">
            Not accepted ({rejected.length})
          </summary>
          <div className="mt-2 space-y-1">
            {rejected.map((e) => (
              <div key={e.id} className="text-xs text-neutral-500">
                <span className="text-neutral-500 font-semibold">not accepted</span> {e.student_name}
                <span className="text-neutral-400"> · {e.band_label}</span>
                {e.refund_cents > 0 && <span className="text-neutral-400"> · ${(e.refund_cents / 100).toFixed(2)} refunded</span>}
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
