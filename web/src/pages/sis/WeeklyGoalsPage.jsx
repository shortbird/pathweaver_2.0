import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import ModalOverlay from '../../components/ui/ModalOverlay'
import StatusPill from '../../components/sis/ui/StatusPill'
import { INLINE_INPUT_CLASS } from '../../components/ui/Input'
import { useSisOrg, withOrg } from './useSisOrg'
import { isGoalsEnabled } from './sisModules'

/**
 * Weekly Goals — a coach writes each student's goals on Monday and checks in
 * on Thursday (Apogee Cache Valley's Master Planner, 2026-10-01). One goal per
 * learning area (the org's goal subjects, the same list as the annual goals).
 * The check-in decides freedom on the server: every goal done and no valid
 * complaint. Nothing here computes it.
 */

const field = INLINE_INPUT_CLASS

const isoDate = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const parseIso = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const mondayOf = (date = new Date()) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return isoDate(d)
}

const addDays = (iso, days) => {
  const d = parseIso(iso)
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

const fmtDay = (iso) => parseIso(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** The pill a student's row shows for the week. */
export const weekStatus = (week) => {
  const anyGoal = (week?.goals || []).some((g) => (g.goal || '').trim())
  if (!anyGoal) return 'not_set'
  if (!week.checked_in_at) return 'goals_set'
  return week.freedom || 'checked_in'
}

const goalCounts = (week) => {
  const set = (week?.goals || []).filter((g) => (g.goal || '').trim())
  return { set: set.length, done: set.filter((g) => g.completed === true).length }
}

const blankGoals = (subjects, week) => subjects.map((subject) => {
  const g = (week?.goals || []).find((x) => x.subject === subject) || {}
  return { subject, goal: g.goal || '', completed: g.completed ?? null }
})

const WeekEditor = ({ student, subjects, weekStart, orgId, yearGoalsEditable, onClose, onSaved }) => {
  const [goals, setGoals] = useState(() => blankGoals(subjects, student.week))
  const [complaints, setComplaints] = useState(student.week?.complaints ?? 0)
  const [valid, setValid] = useState(student.week?.valid_complaints ?? 0)
  const [notes, setNotes] = useState(student.week?.notes || '')
  const [yearGoals, setYearGoals] = useState(() => ({ ...student.year_goals }))
  const [editingYear, setEditingYear] = useState(false)
  const [saving, setSaving] = useState(null)

  const lastWeekGoals = (student.last_week?.goals || []).filter((g) => (g.goal || '').trim())
  const empty = goals.every((g) => !g.goal.trim())

  const setGoal = (subject, patch) =>
    setGoals((gs) => gs.map((g) => (g.subject === subject ? { ...g, ...patch } : g)))

  const copyLastWeek = () => setGoals(blankGoals(subjects, {
    goals: lastWeekGoals.map((g) => ({ subject: g.subject, goal: g.goal, completed: null })),
  }))

  const save = async (checkIn) => {
    setSaving(checkIn ? 'checkin' : 'goals')
    try {
      if (editingYear) {
        await api.put(withOrg(`/api/sis/goals/students/${student.student_id}/year`, orgId), {
          subjects: subjects.map((subject) => ({ subject, year_goal: yearGoals[subject] || '' })),
        })
      }
      await api.put(withOrg(`/api/sis/weekly-goals/students/${student.student_id}/weeks/${weekStart}`, orgId), {
        goals,
        complaints: Number(complaints) || 0,
        valid_complaints: Number(valid) || 0,
        notes,
        check_in: checkIn,
      })
      toast.success(checkIn ? 'Check-in saved' : 'Goals saved')
      onSaved()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save')
    } finally {
      setSaving(null)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">{student.name}</h2>
            <div className="text-sm text-neutral-500">
              Week of {fmtDay(weekStart)} to {fmtDay(addDays(weekStart, 4))}
            </div>
          </div>
          <StatusPill domain="week" status={weekStatus(student.week)} />
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-3">
          {empty && lastWeekGoals.length > 0 && (
            <Button variant="secondary" size="sm" onClick={copyLastWeek}>{"Copy last week's goals"}</Button>
          )}
          {yearGoalsEditable && (
            <Button variant="secondary" size="sm" onClick={() => setEditingYear((v) => !v)}>
              {editingYear ? 'Done editing year goals' : 'Edit year goals'}
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {goals.map((g) => (
            <div key={g.subject} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-semibold text-neutral-900" htmlFor={`goal-${g.subject}`}>{g.subject}</label>
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={g.completed === true}
                    disabled={!g.goal.trim()}
                    onChange={(e) => setGoal(g.subject, { completed: e.target.checked })}
                    aria-label={`${g.subject} done`}
                  />
                  Done
                </label>
              </div>
              {editingYear ? (
                <input
                  className={`${field} w-full mt-1 text-xs`}
                  value={yearGoals[g.subject] || ''}
                  onChange={(e) => setYearGoals((y) => ({ ...y, [g.subject]: e.target.value }))}
                  placeholder="Year goal"
                  aria-label={`${g.subject} year goal`}
                />
              ) : (
                yearGoals[g.subject] && (
                  <div className="text-xs text-neutral-500 mt-0.5">This year: {yearGoals[g.subject]}</div>
                )
              )}
              <input
                id={`goal-${g.subject}`}
                className={`${field} w-full mt-2`}
                value={g.goal}
                onChange={(e) => setGoal(g.subject, { goal: e.target.value, ...(e.target.value.trim() ? {} : { completed: null }) })}
                placeholder="This week's goal"
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <label className="text-sm text-neutral-700">
            Complaints
            <input type="number" min="0" className={`${field} w-full mt-1`} value={complaints}
              onChange={(e) => setComplaints(e.target.value)} />
          </label>
          <label className="text-sm text-neutral-700">
            Valid complaints
            <input type="number" min="0" className={`${field} w-full mt-1`} value={valid}
              onChange={(e) => setValid(e.target.value)} />
          </label>
        </div>
        <label className="block text-sm text-neutral-700 mt-3">
          Notes
          <textarea className={`${field} w-full mt-1`} rows={3} value={notes}
            onChange={(e) => setNotes(e.target.value)} />
        </label>

        <p className="text-xs text-neutral-500 mt-3">
          Save the check-in on Thursday. A student earns freedom when every goal is done and there is no valid complaint.
        </p>

        <div className="mt-4 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="secondary" onClick={() => save(false)} loading={saving === 'goals'} disabled={Boolean(saving)}>
            Save goals
          </Button>
          <Button onClick={() => save(true)} loading={saving === 'checkin'} disabled={Boolean(saving) || empty}>
            Save check-in
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}

const WeeklyGoalsPage = () => {
  const { orgId, activeOrg } = useSisOrg()
  const [weekStart, setWeekStart] = useState(() => mondayOf())
  const [data, setData] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')

  const load = () => {
    if (!orgId) return
    api.get(withOrg(`/api/sis/weekly-goals?week_start=${weekStart}`, orgId))
      .then((r) => setData(r.data))
      .catch(() => { toast.error('Could not load weekly goals'); setData({ students: [], subjects: [] }) })
  }

  useEffect(load, [orgId, weekStart])

  // Clearing here rather than in the effect: the list shows Loading while the
  // next week arrives instead of last week's rows.
  const goToWeek = (iso) => { setData(null); setWeekStart(iso) }

  const students = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.students || []).filter((s) => !q || (s.name || '').toLowerCase().includes(q))
  }, [data, search])

  const summary = useMemo(() => {
    const all = data?.students || []
    const count = (status) => all.filter((s) => weekStatus(s.week) === status).length
    return { total: all.length, notSet: count('not_set'), earned: count('earned'), notEarned: count('not_earned') }
  }, [data])

  const selected = data?.students?.find((s) => s.student_id === selectedId)
  const thisWeek = mondayOf()

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Weekly Goals</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => goToWeek(addDays(weekStart, -7))} aria-label="Previous week">Previous</Button>
          <span className="text-sm font-medium text-neutral-700 min-w-[9rem] text-center">
            Week of {fmtDay(weekStart)}
          </span>
          <Button variant="secondary" size="sm" onClick={() => goToWeek(addDays(weekStart, 7))} aria-label="Next week">Next</Button>
          {weekStart !== thisWeek && (
            <Button variant="secondary" size="sm" onClick={() => goToWeek(thisWeek)}>This week</Button>
          )}
        </div>
      </div>

      {data && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-neutral-700">{summary.total} students</span>
          <span className="text-neutral-700">{summary.notSet} without goals</span>
          <span className="text-green-700">{summary.earned} earned freedom</span>
          <span className="text-amber-700">{summary.notEarned} no freedom</span>
          <input
            className={`${field} ml-auto w-full sm:w-56`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search students"
            aria-label="Search students"
          />
        </div>
      )}

      {data === null && <p className="text-neutral-500">Loading…</p>}
      {data && data.students.length === 0 && (
        <p className="text-neutral-500">No students yet. Students appear here once they join the school.</p>
      )}

      {students.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {students.map((s) => {
            const { set, done } = goalCounts(s.week)
            const checked = Boolean(s.week?.checked_in_at)
            return (
              <button
                key={s.student_id}
                onClick={() => setSelectedId(s.student_id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-neutral-900 truncate">{s.name}</span>
                  <span className="block text-xs text-neutral-500 truncate">
                    {set === 0 ? 'No goals set' : checked ? `${done} of ${set} goals done` : `${set} goals set`}
                    {s.week?.valid_complaints ? ` · ${s.week.valid_complaints} valid complaint${s.week.valid_complaints === 1 ? '' : 's'}` : ''}
                    {s.last_week?.freedom ? ` · Last week: ${s.last_week.freedom === 'earned' ? 'freedom' : 'no freedom'}` : ''}
                  </span>
                </span>
                <StatusPill domain="week" status={weekStatus(s.week)} />
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        <WeekEditor
          key={`${selected.student_id}-${weekStart}`}
          student={selected}
          subjects={data.subjects}
          weekStart={data.week_start}
          orgId={orgId}
          yearGoalsEditable={isGoalsEnabled(activeOrg)}
          onClose={() => setSelectedId(null)}
          onSaved={() => { setSelectedId(null); load() }}
        />
      )}
    </div>
  )
}

export default WeeklyGoalsPage
