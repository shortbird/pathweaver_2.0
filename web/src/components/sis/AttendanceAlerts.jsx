import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import StudentDayModal from './StudentDayModal'

/**
 * The student-accountability board: students marked absent with no guardian
 * report ("not accounted for"), each resolvable with what actually happened.
 *
 * Shared by the coordinator dashboard and the attendance page. It started on
 * the dashboard alone, but the "Student not accounted for" notification
 * deep-links to /attendance (iCreate, 2026-08-26) and attendance is where the
 * front office works the problem — so the board lives in both places and this
 * is the single implementation of it.
 *
 * Backed by GET /api/sis/attendance/alerts and
 * POST /api/sis/attendance/alerts/:id/resolve (both ADMIN_ROLES — admins,
 * campus coordinators and superadmins; teachers are 403'd).
 */

export const RESOLUTION_LABELS = {
  elsewhere_on_campus: 'Elsewhere on campus',
  late: 'Arrived late',
  absent_no_notice: 'Absent without notice',
  mismarked: 'Marked absent by mistake',
  other: 'Other',
}

export const AlertRow = ({ alert, resolutions, orgId, onResolved, onViewDay }) => {
  const [resolution, setResolution] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const resolve = async () => {
    if (!resolution) { toast.error('Pick what happened first'); return }
    setBusy(true)
    try {
      await api.post(`/api/sis/attendance/alerts/${alert.id}/resolve`, {
        organization_id: orgId, resolution, note: note.trim() || undefined,
      })
      toast.success('Resolved')
      onResolved()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not resolve the alert')
    } finally {
      setBusy(false)
    }
  }

  // 'late' and 'mismarked' also correct the roll (sis_attendance_service.
  // resolve_alert), so say so before the coordinator picks — otherwise the
  // daily report keeps calling a present student absent and nobody expects
  // resolving an alert to have touched attendance.
  const corrects = { late: 'and marks them late on the roll', mismarked: 'and marks them present on the roll' }[resolution]

  return (
    <li data-alert-row className="rounded-lg border border-red-200 bg-red-50 p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => onViewDay(alert)}
          className="font-semibold text-red-800 hover:underline"
          title="See this student's schedule and whether they were present in other classes that day"
        >
          {alert.student_name}
        </button>
        <span className="text-xs font-semibold uppercase tracking-wide text-red-600">
          Not accounted for
        </span>
        {alert.class_name && (
          <span className="text-xs text-red-700">{alert.class_name}</span>
        )}
        <span className="text-xs text-red-500 ml-auto">{alert.date}</span>
      </div>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <label className="text-xs text-red-700 flex items-center gap-1">
          Outcome
          <select aria-label="Outcome" value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            className="rounded-lg border border-red-300 bg-white px-2 py-1.5 text-sm">
            <option value="">What happened?</option>
            {(resolutions || []).map((r) => (
              <option key={r} value={r}>{RESOLUTION_LABELS[r] || r}</option>
            ))}
          </select>
        </label>
        <input value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="flex-1 min-w-[140px] rounded-lg border border-red-300 bg-white px-2 py-1.5 text-sm" />
        <button onClick={resolve} disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">
          Resolve
        </button>
      </div>
      {corrects && (
        <p className="mt-1.5 text-[11px] text-red-600">Resolves the alert {corrects}.</p>
      )}
    </li>
  )
}

/**
 * The whole card. Renders nothing when there is nothing to act on, so it can
 * sit unconditionally at the top of a page.
 */
const AttendanceAlerts = ({ alerts, resolutions, orgId, onResolved, onOpenRoster, className = '' }) => {
  // The student whose day is open, if any. Clicking a name asks "were they in
  // their other classes?" before deciding what happened.
  const [viewing, setViewing] = useState(null)
  const open = alerts || []
  if (!open.length) return null
  return (
    <div className={`bg-white rounded-xl border border-red-200 p-4 ${className}`}>
      <h2 className="font-semibold text-neutral-900 mb-3">
        Students not accounted for ({open.length})
      </h2>
      <p className="text-xs text-neutral-500 mb-3">
        Marked absent with no guardian report. Click a name to see their schedule
        and whether they were present in their other classes that day.
      </p>
      <ul className="space-y-2">
        {open.map((a) => (
          <AlertRow key={a.id} alert={a} resolutions={resolutions}
            orgId={orgId} onResolved={onResolved} onViewDay={setViewing} />
        ))}
      </ul>
      {viewing && (
        <StudentDayModal
          studentId={viewing.student_user_id}
          studentName={viewing.student_name}
          date={viewing.date}
          orgId={orgId}
          onClose={() => setViewing(null)}
          onOpenRoster={onOpenRoster}
        />
      )}
    </div>
  )
}

export default AttendanceAlerts
