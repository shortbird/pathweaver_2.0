import React from 'react'
import { Link } from 'react-router-dom'
import { useStudentWaiting } from '../../../hooks/api/useStudentWork'

/**
 * This student's work waiting for review, on their own page (2026-10-08):
 * the submissions inbox narrowed to them (?student_id=). Each row opens the
 * submission in the inbox on the Students page, where it is reviewed; the
 * review lives in one place. Shows nothing when nothing waits.
 */

const ago = (iso) => {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

export default function StudentWaiting({ orgId, studentId, first }) {
  const { data } = useStudentWaiting(orgId, studentId)
  const rows = data?.submissions || []
  if (!rows.length) return null
  const more = (data.total || 0) - rows.length

  return (
    <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50/40 p-4" aria-label="Waiting for review">
      <h2 className="text-sm font-semibold text-neutral-900 mb-2">
        Waiting for review <span className="font-normal text-neutral-500">({data.total})</span>
      </h2>
      <ul className="divide-y divide-amber-100">
        {rows.map((s) => (
          <li key={s.completion_id}>
            <Link to={`/students?tab=submissions&completion_id=${s.completion_id}`}
              className="flex items-center justify-between gap-3 py-2 hover:text-optio-purple">
              <span className="min-w-0">
                <span className="block text-sm text-neutral-900 truncate">{s.task?.title}</span>
                <span className="block text-xs text-neutral-500 truncate">{s.quest_title}</span>
              </span>
              <span className="text-xs text-neutral-500 shrink-0">{ago(s.completed_at)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <p className="text-xs text-neutral-500 mt-2">
          And {more} more from {first}, in the Submissions tab.
        </p>
      )}
    </section>
  )
}
