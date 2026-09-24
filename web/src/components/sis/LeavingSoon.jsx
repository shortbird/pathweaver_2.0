import React from 'react'

/**
 * "Leaving soon" -- the children going home early in the next hour.
 *
 * Ticket 31e93fbb (Katrine Myers, iCreate campus coordinator, 2026-09-24):
 * "If there's a way even Kate could get some kind of alert or something about
 * each student leaving at that hour? Something to alert someone instead of us
 * having to hunt for it." Not a push notification: a card at the top of the
 * coordinator and admin dashboards, like "Teachers to check" beside it.
 *
 * The list comes from GET /api/sis/coordinator/dashboard (`leaving_soon`) and
 * the admin dashboard (`today.leaving_soon`): children whose last class ends
 * before the day's last class, from 15 minutes ago to an hour from now, in the
 * school's clock (sis_coordinator_service.leaving_soon). The same Going home
 * list the day and block rosters show, cut to now.
 *
 * Renders nothing when nobody is leaving soon, so it can sit unconditionally
 * at the top of a dashboard. Names are plain text, as on the rest of the
 * dashboard's student rows.
 */
const LeavingSoon = ({ students, className = '' }) => {
  if (!(students || []).length) return null
  return (
    <div className={`bg-white rounded-xl border border-amber-200 p-4 ${className}`} data-leaving-soon>
      <h2 className="font-semibold text-neutral-900 mb-1">
        Leaving soon ({students.length})
      </h2>
      <p className="text-xs text-neutral-500 mb-2">
        Going home before the end of the day, in the next hour.
      </p>
      <ul className="divide-y divide-gray-100">
        {students.map((s) => (
          <li key={`${s.name}-${s.leaves_at}`} className="py-1.5 flex items-center gap-3">
            <span className="text-sm font-medium text-amber-700 w-20 shrink-0">{s.leaves_at}</span>
            <span className="text-sm font-semibold text-neutral-900 min-w-0 truncate">{s.name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default LeavingSoon
