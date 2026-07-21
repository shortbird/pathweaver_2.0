import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../ui/Button'
import { withOrg } from '../../pages/sis/useSisOrg'

const fmtWhen = (ts) => {
  try { return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return ts }
}

/**
 * Parent schedule submissions ("Submit for approval" in the Schedule Builder).
 * Approving keeps the schedule locked (staff-managed from here; billing happens
 * outside Optio). Sending it back unlocks the family's builder with a note.
 * Renders nothing when the org has no submissions.
 */
const ScheduleApprovalsCard = ({ orgId }) => {
  const [submissions, setSubmissions] = useState([])
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(() => {
    if (!orgId) { setSubmissions([]); return }
    api.get(withOrg('/api/sis/schedule-submissions', orgId))
      .then((r) => setSubmissions(r.data?.submissions || []))
      .catch(() => setSubmissions([]))
  }, [orgId])

  useEffect(() => { load() }, [load])

  const review = async (s, action) => {
    let note
    if (action === 'send_back') {
      note = window.prompt(`Why is ${s.student_name}'s schedule being sent back? (shared with the family)`)
      if (note === null) return // cancelled
    }
    setBusyId(s.id)
    try {
      await api.post(`/api/sis/schedule-submissions/${s.id}/review`,
        { action, note, organization_id: orgId })
      toast.success(action === 'approve'
        ? `${s.student_name}'s schedule is approved`
        : 'Sent back to the family')
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not update the submission')
    } finally {
      setBusyId(null)
    }
  }

  const pending = submissions.filter((s) => s.status === 'submitted')
  const reviewed = submissions.filter((s) => s.status !== 'submitted')
  if (!submissions.length) return null

  return (
    <div>
      {pending.length > 0 && (
        <div className="bg-white rounded-xl border border-optio-purple/40 p-4">
          <h2 className="font-semibold text-neutral-900">Schedule approvals</h2>
          <p className="text-xs text-neutral-500 mt-0.5 mb-3">
            Families who submitted their Schedule Builder week for approval and billing. Their
            schedule is locked until you approve it or send it back.
          </p>
          <div className="space-y-2">
            {pending.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-neutral-900">{s.student_name}</div>
                  <div className="text-xs text-neutral-400">
                    Submitted by {s.guardian_name || 'a guardian'} · {fmtWhen(s.submitted_at)}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" disabled={busyId === s.id} onClick={() => review(s, 'approve')}>
                    Approve
                  </Button>
                  <button onClick={() => review(s, 'send_back')} disabled={busyId === s.id}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                    Send back
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {reviewed.length > 0 && (
        <details className={pending.length > 0 ? 'mt-3' : ''}>
          <summary className="text-sm text-neutral-500 cursor-pointer select-none">
            Reviewed schedule submissions ({reviewed.length})
          </summary>
          <div className="mt-2 space-y-1">
            {reviewed.map((s) => (
              <div key={s.id} className="text-xs text-neutral-500 flex flex-wrap gap-x-1.5">
                <span className={s.status === 'approved' ? 'text-green-600 font-semibold' : 'text-amber-600 font-semibold'}>
                  {s.status === 'approved' ? 'approved' : 'sent back'}
                </span>
                <span>{s.student_name}</span>
                <span className="text-neutral-400">
                  · submitted {fmtWhen(s.submitted_at)}{s.reviewed_at ? ` · reviewed ${fmtWhen(s.reviewed_at)}` : ''}
                </span>
                {s.review_note && <span className="italic">“{s.review_note}”</span>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

export default ScheduleApprovalsCard
