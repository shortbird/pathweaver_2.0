import React from 'react'
import DashboardCard from './DashboardCard'
import { useRecordDoors } from './RecordDoors'
import SignInTroubleList from '../common/SignInTroubleList'
import { timeAgo } from '../../utils/timeFormat'

/**
 * Who is using Optio at this school -- the school's own slice of the
 * superadmin home's "Activity by organization" (2026-10-12).
 *
 * The census row already said "Active (last 7 days)". It could not say
 * whether that was more or fewer than last week, which classes had gone
 * silent, or which students to call. This card answers those, from
 * sis_org_activity (services/activity_metrics_service.school_activity):
 *
 * - students and families active this week against last week;
 * - the classes with the smallest share of active students, first;
 * - the students gone quiet: an unfinished quest and no sign-in for 14 days,
 *   each a door into the student's record.
 *
 * SignInTroubleCard is the second export: the school's people whose sign-ins
 * keep failing, each a door into the record that can fix it (a student's
 * record has Reset password; a parent's is their family).
 */

function Change({ now, prev }) {
  const a = Number(now) || 0
  const b = Number(prev) || 0
  if (a === b) return <span className="text-xs text-neutral-400">same as last week</span>
  const up = a > b
  return (
    <span className={`text-xs font-medium ${up ? 'text-green-700' : 'text-red-700'}`}>
      {up ? '▲' : '▼'} {Math.abs(a - b)} from last week
    </span>
  )
}

function Figure({ label, now, prev, of }) {
  return (
    <div>
      <div className="text-2xl font-bold text-neutral-900 tabular-nums">
        {Number(now || 0).toLocaleString('en')}
        {of != null && <span className="text-sm font-normal text-neutral-400"> of {Number(of).toLocaleString('en')}</span>}
      </div>
      <div className="text-xs text-neutral-500">{label}</div>
      <Change now={now} prev={prev} />
    </div>
  )
}

const MAX_CLASSES = 5
const MAX_QUIET = 8

export default function SchoolActivityCard({ activity, className = '' }) {
  const { openStudent } = useRecordDoors()
  if (!activity) return null
  const classes = (activity.classes || []).filter(c => c.students > 0).slice(0, MAX_CLASSES)
  const quiet = activity.quiet || []

  return (
    <DashboardCard title="This week at your school" className={className}>
      <div className="grid grid-cols-3 gap-3">
        <Figure label="Students active" now={activity.active_students}
          prev={activity.active_students_prev} of={activity.students} />
        <Figure label="Parents active" now={activity.active_parents}
          prev={activity.active_parents_prev} of={activity.parents} />
        <Figure label="Tasks done" now={activity.tasks} prev={activity.tasks_prev} />
      </div>

      {classes.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1">
            Quietest classes
          </h3>
          <ul className="divide-y divide-gray-100">
            {classes.map(c => (
              <li key={c.class_id} className="py-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-neutral-800">{c.name}</span>
                <span className="shrink-0 tabular-nums text-neutral-500">
                  {c.active} of {c.students} active · {c.tasks} tasks
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1">
          Gone quiet {activity.quiet_total ? `(${activity.quiet_total})` : ''}
        </h3>
        {quiet.length === 0 ? (
          <p className="text-sm text-neutral-500">Every student with open work signed in in the last two weeks.</p>
        ) : (
          <>
            <p className="text-xs text-neutral-500 mb-1">Unfinished work and no sign-in for two weeks or more.</p>
            <ul className="divide-y divide-gray-100">
              {quiet.slice(0, MAX_QUIET).map(s => (
                <li key={s.user_id} className="py-1.5 flex items-center justify-between gap-3 text-sm">
                  <button type="button" onClick={() => openStudent(s.user_id)}
                    className="truncate text-left font-medium text-optio-purple hover:underline">
                    {s.name}
                  </button>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {s.last_active ? `last seen ${timeAgo(s.last_active)}` : 'never signed in'}
                    {' · '}{s.open_quests} open {s.open_quests === 1 ? 'quest' : 'quests'}
                  </span>
                </li>
              ))}
            </ul>
            {(activity.quiet_total || 0) > MAX_QUIET && (
              <p className="text-xs text-neutral-500 mt-1">And {activity.quiet_total - MAX_QUIET} more.</p>
            )}
          </>
        )}
      </div>
    </DashboardCard>
  )
}

export function SignInTroubleCard({ people, className = '' }) {
  const { openStudent, openFamily } = useRecordDoors()
  if (!Array.isArray(people) || people.length === 0) return null
  return (
    <DashboardCard title="Can't sign in" className={className}>
      <p className="text-xs text-neutral-500 mb-2">
        Failed to sign in two or more times this week and have not signed in since.
        Reach out, or reset their password from their record.
      </p>
      <SignInTroubleList
        people={people}
        renderAction={p => {
          if (p.role === 'student' && p.user_id) {
            return (
              <button type="button" onClick={() => openStudent(p.user_id)}
                className="text-xs font-semibold text-optio-purple hover:underline">
                Open
              </button>
            )
          }
          if (p.household_id) {
            return (
              <button type="button" onClick={() => openFamily(p.household_id)}
                className="text-xs font-semibold text-optio-purple hover:underline">
                Family
              </button>
            )
          }
          return null
        }}
      />
    </DashboardCard>
  )
}
