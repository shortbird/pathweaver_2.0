import React, { useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  useSisInterestList, useInviteInterestListEntry, useSetInterestListStatus,
} from '../../hooks/api/useSisInterestList'
import { useConfirm } from '../../contexts/ConfirmContext'
import StatusPill from './ui/StatusPill'
import { statusLabel } from './ui/statusMaps'
import { toCsv, downloadCsv, dateStamp } from '../../utils/csv'

/**
 * The interest list: families who joined the waitlist from the registration
 * link BEFORE registering or paying (backend/services/sis_interest_list_service.py).
 *
 * Not the age-group "Enrollment waitlist" card beside it: those are registered
 * students. These families have no account yet -- just a parent, an email, and
 * each child's first name and birthday. Staff invite a family when there is
 * room (the registration link goes by email and the row reads Invited); the
 * row reads Registered by itself once the family registers with that email.
 *
 * Listed in the order families joined. Every status shows by default (the
 * least-restrictive filter is the rule for SIS lists); the chips narrow it.
 */
const FILTERS = ['all', 'waiting', 'invited', 'registered', 'removed']

const formatDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const childLine = (c) => `${c.first_name} (born ${c.dob}${c.age != null ? `, ${c.age} now` : ''})`

const InterestListCard = ({ orgId, enabled }) => {
  const confirm = useConfirm()
  const { data, isLoading: loading } = useSisInterestList(orgId)
  const entries = useMemo(() => data || [], [data])
  const inviteEntry = useInviteInterestListEntry(orgId)
  const setEntryStatus = useSetInterestListStatus(orgId)
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState(null)

  const counts = useMemo(() => entries.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1
    return acc
  }, {}), [entries])
  const shown = filter === 'all' ? entries : entries.filter((e) => e.status === filter)
  // Place in line counts only the families still in line.
  const place = useMemo(() => {
    const m = {}
    let n = 0
    for (const e of entries) if (e.status === 'waiting' || e.status === 'invited') m[e.id] = ++n
    return m
  }, [entries])

  const parentName = (e) => `${e.parent_first_name || ''} ${e.parent_last_name || ''}`.trim()

  const copyEmails = async () => {
    const emails = [...new Set(shown.filter((e) => e.status !== 'removed').map((e) => e.email).filter(Boolean))]
    if (!emails.length) return toast.error('No emails to copy')
    try {
      await navigator.clipboard.writeText(emails.join(', '))
      toast.success(`Copied ${emails.length} email${emails.length === 1 ? '' : 's'}`)
    } catch { toast.error('Could not copy. Download the CSV instead.') }
  }

  const downloadList = () => {
    const header = ['Place', 'Joined', 'Status', 'Parent', 'Email', 'Phone', 'Children', 'Interested in', 'Waitlist', 'Notes']
    const rows = shown.map((e) => [
      place[e.id] || '', formatDate(e.created_at), statusLabel('interest_list', e.status),
      parentName(e), e.email, e.phone || '',
      (e.children || []).map(childLine).join('; '),
      e.interest || '', e.list_label || '', e.notes || '',
    ])
    downloadCsv(toCsv(header, rows), `interest-list-${dateStamp()}.csv`)
  }

  const invite = async (e) => {
    const again = e.status === 'invited'
    if (!(await confirm(`${again ? 'Send the registration link again to' : 'Invite'} ${parentName(e)} (${e.email})? They get an email with your registration link.`))) return
    setBusy(e.id)
    try {
      const result = await inviteEntry.mutateAsync(e.id)
      if (result?.emailed) toast.success(`${parentName(e)} was emailed the registration link`)
      else toast.error(`Marked invited, but the email could not be sent. Send ${e.email} the registration link yourself.`)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not invite the family')
    } finally { setBusy(null) }
  }

  const setStatus = async (e, status) => {
    if (status === 'removed' && !(await confirm(`Remove ${parentName(e)} from the interest list? You can put them back later.`))) return
    setBusy(e.id)
    try {
      await setEntryStatus.mutateAsync({ entryId: e.id, status })
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update the family')
    } finally { setBusy(null) }
  }

  const button = 'px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-neutral-600 hover:bg-gray-50 disabled:opacity-50'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-neutral-900">Interest list</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={copyEmails} disabled={!shown.length} className={button}>Copy emails</button>
          <button onClick={downloadList} disabled={!shown.length} className={button}>Download CSV</button>
        </div>
      </div>
      <p className="text-sm text-neutral-500 mt-1 mb-4">
        Families who joined the waitlist from your registration link before registering. They have no
        account and have paid nothing. Invite a family when you have room: they get an email with your
        registration link. When they register with the same email, they show as Registered here.
        {enabled
          ? ' Change what families see in Registration form, on the Account step.'
          : ' Waitlist sign-up is off: turn it on in Registration form, on the Account step.'}
      </p>

      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => {
          const n = f === 'all' ? entries.length : (counts[f] || 0)
          const label = f === 'all' ? 'All' : statusLabel('interest_list', f)
          return (
            <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}
              className={`rounded-full px-3 py-1 text-xs font-semibold border ${filter === f
                ? 'bg-optio-purple text-white border-optio-purple'
                : 'border-gray-300 text-neutral-600 hover:bg-gray-50'}`}>
              {label} ({n})
            </button>
          )
        })}
      </div>

      {loading ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center">
          <p className="text-sm font-medium text-neutral-600">
            {entries.length ? 'No families with this status.' : 'No families on the list yet.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {shown.map((e) => (
            <li key={e.id} className="px-4 py-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-neutral-900">
                    {place[e.id] ? `#${place[e.id]} ` : ''}{parentName(e)}
                  </span>
                  <StatusPill domain="interest_list" status={e.status} />
                  <span className="text-xs text-neutral-400">joined {formatDate(e.created_at)}</span>
                </div>
                <div className="text-neutral-500">
                  {e.email}{e.phone ? ` · ${e.phone}` : ''}
                </div>
                <div className="text-neutral-700 mt-1">
                  {(e.children || []).map(childLine).join(', ')}
                </div>
                {(e.interest || e.list_label) && (
                  <div className="text-neutral-500">
                    {[e.interest, e.list_label].filter(Boolean).join(' · ')}
                  </div>
                )}
                {e.notes && <div className="text-neutral-500 whitespace-pre-wrap mt-1">{e.notes}</div>}
              </div>
              <div className="flex items-center gap-2">
                {e.status === 'removed' ? (
                  <button onClick={() => setStatus(e, 'waiting')} disabled={busy === e.id} className={button}>
                    Put back
                  </button>
                ) : e.status !== 'registered' && (
                  <>
                    <button onClick={() => setStatus(e, 'removed')} disabled={busy === e.id} className={button}>
                      Remove
                    </button>
                    <button onClick={() => invite(e)} disabled={busy === e.id}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-gradient-primary text-white hover:opacity-90 disabled:opacity-50">
                      {e.status === 'invited' ? 'Invite again' : 'Invite to register'}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default InterestListCard
