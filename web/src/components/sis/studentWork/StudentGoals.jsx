import React from 'react'
import { Link } from 'react-router-dom'
import StatusPill from '../ui/StatusPill'
import { useStudentGoals } from '../../../hooks/api/useStudentWork'
import { weekStatus } from '../../../pages/sis/WeeklyGoalsPage'

/**
 * One student's goals on their own page (2026-10-08, decision 3 in
 * docs/sis/SIS_SIMPLIFICATION.md): this week's goals and where the week
 * stands, and their year goals. Read here, written on the Goals page, where
 * the coach sets the week on Monday and checks in on Thursday.
 */

export default function StudentGoals({ orgId, studentId }) {
  const { data, isLoading } = useStudentGoals(orgId, studentId)
  const week = (data?.weeks || []).find((w) => w.week_start === data?.current_week_start)
  const goals = (week?.goals || []).filter((g) => (g.goal || '').trim())
  const yearGoals = Object.entries(data?.year_goals || {}).filter(([, g]) => (g || '').trim())

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4" aria-label="Goals">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="font-semibold text-neutral-900">Goals</h2>
        <Link to="/goals" className="text-xs font-semibold text-optio-purple hover:underline">
          Set goals
        </Link>
      </div>
      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
      {!isLoading && (
        <>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">This week</span>
            <StatusPill domain="week" status={weekStatus(week)} />
          </div>
          {goals.length === 0 ? (
            <p className="text-sm text-neutral-400 mb-3">No goals set this week.</p>
          ) : (
            <ul className="space-y-1 mb-3">
              {goals.map((g) => (
                <li key={g.subject} className="flex items-start gap-2 text-sm">
                  <span aria-hidden className={`mt-0.5 w-4 shrink-0 ${g.completed ? 'text-green-600' : 'text-neutral-300'}`}>
                    {g.completed ? '✓' : '○'}
                  </span>
                  <span>
                    <span className="font-medium text-neutral-800">{g.subject}:</span>{' '}
                    <span className="text-neutral-700">{g.goal}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {yearGoals.length > 0 && (
            <>
              <span className="block text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1">This year</span>
              <ul className="space-y-1">
                {yearGoals.map(([subject, goal]) => (
                  <li key={subject} className="text-sm">
                    <span className="font-medium text-neutral-800">{subject}:</span>{' '}
                    <span className="text-neutral-700">{goal}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}
