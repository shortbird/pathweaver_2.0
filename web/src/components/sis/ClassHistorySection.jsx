import React from 'react'
import { useStudentClassHistory } from '../../hooks/api/useSisStudentDetail'

/**
 * Class history on the SIS student record (Schedule tab): every class this
 * student was added to, dropped from, re-added to or waitlisted for, newest
 * first, with who did it when that was recorded.
 *
 * iCreate, ticket fee0d486: "Could we get a place where we can see the history
 * of when classes were added and/or dropped by any particular student?"
 *
 * Drops before 2026-09-29 were never timed, so most of them come back with
 * date_known false. Those say "Date not recorded" instead of showing the
 * placeholder date the server sorts them by.
 */

const EVENTS = {
  added: { label: 'Added', tone: 'bg-green-50 border border-green-200 text-green-700' },
  readded: { label: 'Re-added', tone: 'bg-green-50 border border-green-200 text-green-700' },
  dropped: { label: 'Dropped', tone: 'bg-red-50 border border-red-200 text-red-700' },
  completed: { label: 'Completed', tone: 'bg-neutral-50 border border-gray-200 text-neutral-600' },
  waitlisted: { label: 'Waitlisted', tone: 'bg-amber-50 border border-amber-200 text-amber-700' },
}

const formatWhen = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

const ClassHistorySection = ({ studentId, orgId }) => {
  const { data: history = [], isLoading, isError } = useStudentClassHistory(studentId, orgId)

  return (
    <section aria-labelledby="class-history-heading">
      <h4 id="class-history-heading"
        className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">
        Class history
      </h4>
      {isLoading ? <p className="text-sm text-neutral-500">Loading…</p>
        : isError ? <p className="text-sm text-red-700">Could not load the class history.</p>
        : history.length === 0 ? <p className="text-sm text-neutral-400">No class changes recorded yet.</p>
        : (
          <ul className="space-y-2">
            {history.map((h) => {
              const ev = EVENTS[h.event] || { label: h.event, tone: EVENTS.completed.tone }
              return (
                <li key={`${h.event}-${h.id}`}
                  className="rounded-lg border border-gray-200 px-3 py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-neutral-900 truncate">{h.class_name}</div>
                    <div className="text-sm text-neutral-500">
                      {h.date_known === false ? 'Date not recorded' : formatWhen(h.occurred_at)}
                      {h.actor_name ? ` · by ${h.actor_name}` : ''}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ev.tone}`}>
                    {ev.label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
    </section>
  )
}

export default ClassHistorySection
