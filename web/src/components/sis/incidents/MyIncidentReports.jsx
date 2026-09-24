import React, { useEffect, useState } from 'react'
import api from '../../../services/api'
import { withOrg } from '../../../pages/sis/useSisOrg'
import StatusPill from '../ui/StatusPill'

/**
 * Incident reports you filed -- the reporter's copy.
 *
 * A report is a task on an office person's list (ticket a26d9daf), so it
 * never appears in the reporter's own My tasks. This is where they find it
 * again: what they wrote, who has it, and whether it has been handled.
 * Renders nothing until there is something to show.
 */
export default function MyIncidentReports({ orgId, reloadKey = 0 }) {
  const [reports, setReports] = useState([])
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    if (!orgId) return undefined
    let cancelled = false
    api.get(withOrg('/api/sis/incident-reports/mine', orgId))
      .then((r) => { if (!cancelled) setReports(r.data?.reports || []) })
      .catch(() => { if (!cancelled) setReports([]) })
    return () => { cancelled = true }
  }, [orgId, reloadKey])

  if (!reports.length) return null

  return (
    <section className="space-y-2" aria-labelledby="incident-reports-heading" id="incident-reports">
      <h2 id="incident-reports-heading" className="font-semibold text-neutral-900">Incident reports you filed</h2>
      <ul className="space-y-2">
        {reports.map((t) => (
          <li key={t.id} className="bg-white rounded-xl border border-gray-200 p-3">
            <button type="button" onClick={() => setOpenId(openId === t.id ? null : t.id)}
              aria-expanded={openId === t.id}
              className="w-full flex items-center gap-3 flex-wrap text-left">
              <span className="text-sm font-medium text-neutral-900 flex-1 min-w-0">{t.title}</span>
              <span className="text-xs text-neutral-500">
                {t.user_name ? `Sent to ${t.user_name}` : ''}
                {t.created_at ? ` on ${new Date(t.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
              </span>
              <StatusPill domain="task" status={t.status} fallback="todo" />
            </button>
            {openId === t.id && t.description && (
              <p className="mt-2 text-sm text-neutral-700 whitespace-pre-wrap">{t.description}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
