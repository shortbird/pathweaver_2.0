import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import Button from '../components/ui/Button'
import StatusPill from '../components/sis/ui/StatusPill'
import { INLINE_INPUT_CLASS } from '../components/ui/Input'
import { weekStatus } from './sis/WeeklyGoalsPage'

/**
 * Weekly goals, as a student or their parent sees them: this week's goals,
 * what got done, and whether freedom was earned. A student types their own
 * goals for this week until the Thursday check-in locks them (ticket
 * 910668d8); the coach keeps the ticks, complaints and notes in the SIS
 * console (pages/sis/WeeklyGoalsPage). A parent reads each child's weeks.
 */

export const LOCK_LINE = 'Goals lock after Thursday check-in.'

/** This week's goal inputs for the student themselves. Sends only the
 * subjects the student changed, so a coach's edit to another subject made
 * while this page was open is not overwritten. */
const MyGoalsEditor = ({ student, week, onSaved }) => {
  const loaded = Object.fromEntries((student.subjects || []).map((subject) => {
    const g = (week?.goals || []).find((x) => x.subject === subject)
    return [subject, g?.goal || '']
  }))
  const [goals, setGoals] = useState(loaded)
  const [saving, setSaving] = useState(false)
  const changed = Object.keys(goals).filter((k) => goals[k] !== loaded[k])

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/api/sis/weekly-goals/mine/goals', {
        week_start: student.current_week_start,
        goals: changed.map((subject) => ({ subject, goal: goals[subject] })),
      })
      toast.success('Goals saved')
      onSaved()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save your goals')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-sm font-semibold text-neutral-900">This week</div>
        <StatusPill domain="week" status={weekStatus(week)} />
      </div>
      <p className="text-xs text-neutral-500 mb-3">Type your goals for this week. {LOCK_LINE}</p>
      <div className="space-y-2">
        {(student.subjects || []).map((subject) => (
          <label key={subject} className="block text-sm">
            <span className="font-medium text-neutral-800">{subject}</span>
            {student.year_goals?.[subject] && (
              <span className="block text-xs text-neutral-500">This year: {student.year_goals[subject]}</span>
            )}
            <input
              className={`${INLINE_INPUT_CLASS} w-full mt-1`}
              value={goals[subject]}
              maxLength={500}
              onChange={(e) => setGoals((g) => ({ ...g, [subject]: e.target.value }))}
              placeholder="This week's goal"
              aria-label={`${subject} goal`}
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={save} loading={saving} disabled={saving || changed.length === 0}>
          Save goals
        </Button>
      </div>
    </div>
  )
}

const parseIso = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const fmtDay = (iso) => parseIso(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const Week = ({ week, current, locked }) => {
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
      {locked && <p className="text-xs text-neutral-500 mt-2">{LOCK_LINE}</p>}
    </div>
  )
}

const FamilyWeeklyGoalsPage = () => {
  const [students, setStudents] = useState(null)

  const load = () => {
    api.get('/api/sis/weekly-goals/mine')
      .then((r) => setStudents(r.data?.students || []))
      .catch(() => setStudents([]))
  }

  useEffect(load, [])

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
          {(() => {
            const current = s.weeks.find((w) => w.week_start === s.current_week_start)
            const editing = Boolean(s.can_edit_goals)
            const shown = editing ? s.weeks.filter((w) => w !== current) : s.weeks
            return (
              <div className="space-y-3">
                {editing && (
                  <MyGoalsEditor
                    key={`${current?.updated_at || 'new'}`}
                    student={s}
                    week={current}
                    onSaved={load}
                  />
                )}
                {!editing && s.weeks.length === 0 && (
                  <p className="text-sm text-neutral-500">No weekly goals yet.</p>
                )}
                {shown.map((w) => {
                  const isCurrent = w.week_start === s.current_week_start
                  return (
                    <Week key={w.id} week={w} current={isCurrent}
                      locked={Boolean(s.is_self && isCurrent && s.goals_locked)} />
                  )
                })}
              </div>
            )
          })()}
        </section>
      ))}
    </div>
  )
}

export default FamilyWeeklyGoalsPage
