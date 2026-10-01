import React, { useEffect, useState } from 'react'
import api from '../services/api'
import StatusPill from '../components/sis/ui/StatusPill'
import { weekStatus } from './sis/WeeklyGoalsPage'

/**
 * Weekly goals, as a student or their parent sees them: this week's goals,
 * what got done, and whether freedom was earned. Read-only -- the coach writes
 * them in the SIS console (pages/sis/WeeklyGoalsPage). A student sees their
 * own; a parent sees each child's.
 */

const parseIso = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const fmtDay = (iso) => parseIso(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const Week = ({ week, current }) => {
  const goals = (week.goals || []).filter((g) => (g.goal || '').trim())
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-sm font-semibold text-neutral-900">
          {current ? 'This week' : `Week of ${fmtDay(week.week_start)}`}
        </div>
        <StatusPill domain="week" status={weekStatus(week)} />
      </div>
      {goals.length === 0 ? (
        <p className="text-sm text-neutral-500">No goals set yet.</p>
      ) : (
        <ul className="space-y-1">
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
      {week.notes && <p className="text-sm text-neutral-500 mt-2 whitespace-pre-wrap">{week.notes}</p>}
    </div>
  )
}

const FamilyWeeklyGoalsPage = () => {
  const [students, setStudents] = useState(null)

  useEffect(() => {
    api.get('/api/sis/weekly-goals/mine')
      .then((r) => setStudents(r.data?.students || []))
      .catch(() => setStudents([]))
  }, [])

  if (students === null) return <p className="text-neutral-500 p-4">Loading…</p>
  if (students.length === 0) {
    return <p className="text-neutral-500 p-4">No weekly goals yet. Your coach sets them each Monday.</p>
  }

  return (
    <div className="space-y-8">
      {students.map((s) => (
        <section key={s.student_id}>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            {students.length > 1 && <h2 className="text-lg font-bold text-neutral-900">{s.name}</h2>}
            {s.freedom && (
              <span className="text-sm text-neutral-700">
                Freedom now: <StatusPill domain="week" status={s.freedom} />
              </span>
            )}
          </div>
          {s.weeks.length === 0 ? (
            <p className="text-sm text-neutral-500">No weekly goals yet.</p>
          ) : (
            <div className="space-y-3">
              {s.weeks.map((w) => (
                <Week key={w.id} week={w} current={w.week_start === s.current_week_start} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

export default FamilyWeeklyGoalsPage
