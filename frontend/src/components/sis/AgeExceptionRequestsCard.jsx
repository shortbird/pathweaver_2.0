import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../ui/Button'
import { withOrg } from '../../pages/sis/useSisOrg'

const fmtWhen = (ts) => {
  try { return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return ts }
}
// The class age band snapshotted on the request (empty when the class had no limits).
const ageBand = (r) => (r.class_min_age != null && r.class_max_age != null
  ? `ages ${r.class_min_age}–${r.class_max_age}`
  : r.class_min_age != null ? `ages ${r.class_min_age}+`
    : r.class_max_age != null ? `up to age ${r.class_max_age}` : null)

/**
 * Age exception requests from the parent Schedule Builder ("ask the school for
 * an age exception"). Approving enrolls the student immediately — approving IS
 * the age override. Renders nothing when the org has no requests.
 */
const AgeExceptionRequestsCard = ({ orgId }) => {
  const [requests, setRequests] = useState([])

  const load = useCallback(() => {
    if (!orgId) { setRequests([]); return }
    api.get(withOrg('/api/sis/age-exception-requests', orgId))
      .then((r) => setRequests(r.data?.requests || []))
      .catch(() => setRequests([]))
  }, [orgId])

  useEffect(() => { load() }, [load])

  const resolve = async (r, action, dropConflicting = false) => {
    try {
      await api.post(`/api/sis/age-exception-requests/${r.id}/resolve`,
        { action, organization_id: orgId, drop_conflicting: dropConflicting })
      toast.success(action === 'approve'
        ? `Approved — ${r.student_name} is enrolled in ${r.class_name}`
        : 'Request declined')
      load()
    } catch (e) {
      // 409: enrolling would double-book the student — confirm dropping the
      // conflicting class(es), then re-approve.
      const conflicts = e?.response?.status === 409 ? e.response.data?.conflicts : null
      if (conflicts?.length) {
        const names = conflicts.map((c) => c.class_name).join(', ')
        if (window.confirm(
          `${r.student_name} is already enrolled in ${names} at the same time. ` +
          `Drop ${names} and enroll in ${r.class_name}?`)) {
          await resolve(r, action, true)
        }
        return
      }
      toast.error(e?.response?.data?.error || 'Could not update the request')
    }
  }

  const pending = requests.filter((r) => r.status === 'pending')
  const resolved = requests.filter((r) => r.status !== 'pending')
  if (!requests.length) return null

  return (
    <div>
      {pending.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-300 p-4">
          <h2 className="font-semibold text-neutral-900">Age exception requests</h2>
          <p className="text-xs text-neutral-500 mt-0.5 mb-3">
            Families asking to enroll a student in a class outside its age range. Approving enrolls the student right away.
          </p>
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-neutral-900">
                    {r.student_name}{r.student_age != null ? ` (age ${r.student_age})` : ''}
                    <span className="text-neutral-400 font-normal"> → </span>
                    {r.class_name}{ageBand(r) ? <span className="text-neutral-400 font-normal"> ({ageBand(r)})</span> : null}
                  </div>
                  <div className="text-xs text-neutral-400">
                    Requested by {r.guardian_name} · {fmtWhen(r.created_at)}
                  </div>
                  {r.message && <div className="text-xs text-neutral-600 mt-1 italic">“{r.message}”</div>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" onClick={() => resolve(r, 'approve')}>Approve &amp; enroll</Button>
                  <button onClick={() => resolve(r, 'decline')}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-red-300 text-red-600 hover:bg-red-50">
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {resolved.length > 0 && (
        <details className={pending.length > 0 ? 'mt-3' : ''}>
          <summary className="text-sm text-neutral-500 cursor-pointer select-none">
            Resolved age exception requests ({resolved.length})
          </summary>
          <div className="mt-2 space-y-1">
            {resolved.map((r) => (
              <div key={r.id} className="text-xs text-neutral-500 flex flex-wrap gap-x-1.5">
                <span className={r.status === 'approved' ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
                  {r.status}
                </span>
                <span>{r.student_name} → {r.class_name}</span>
                <span className="text-neutral-400">· requested {fmtWhen(r.created_at)}{r.resolved_at ? ` · resolved ${fmtWhen(r.resolved_at)}` : ''}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

export default AgeExceptionRequestsCard
