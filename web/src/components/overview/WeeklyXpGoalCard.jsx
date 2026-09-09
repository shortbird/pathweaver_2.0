import React, { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import Button from '../ui/Button'
import logger from '../../utils/logger'

/**
 * Weekly XP Goal — the target a student is working toward this week, and how
 * far along they are.
 *
 * Self-fetching on purpose. The card appears on four surfaces the student's own
 * overview, the parent dashboard, the observer view, and the advisor check-in
 * and each of those pages loads a different bundle from a different endpoint.
 * Threading the goal through all four payloads would mean four places to keep
 * in sync; one component that asks for `/api/xp-goals/student/:id` is one.
 *
 * The server decides three things, and this component only renders them:
 *   - whether the school has the feature on (`enabled`); off renders nothing
 *   - what the target is
 *   - whether *this* viewer may change it (`can_edit`) an observer sees the
 *     progress but gets no editor
 *
 * Hiding the editor is chrome. The backend is the gate.
 */

const PRESETS = [250, 500, 750, 1000]

const barColor = (percent, met) => {
  if (met) return 'bg-green-500'
  if (percent >= 50) return 'bg-gradient-to-r from-optio-purple to-optio-pink'
  return 'bg-optio-purple'
}

// "Aug 11 - Aug 17". Dates arrive as plain YYYY-MM-DD, so they are parsed as
// local noon rather than passed to Date directly a bare ISO date string is
// parsed as UTC midnight, which renders as the previous day west of Greenwich.
const formatRange = (startIso, endIso) => {
  const asLocal = (iso) => {
    if (!iso) return null
    const [y, m, d] = String(iso).split('-').map(Number)
    if (!y || !m || !d) return null
    return new Date(y, m - 1, d, 12)
  }
  const opts = { month: 'short', day: 'numeric' }
  const start = asLocal(startIso)
  const end = asLocal(endIso)
  if (!start || !end) return ''
  return `${start.toLocaleDateString(undefined, opts)} - ${end.toLocaleDateString(undefined, opts)}`
}

// Whose goal it is, said the way the reader would say it. `viewerIsStudent`
// flips between second person ("You set this") and third ("Set by their teacher").
const setterLabel = (goal, viewerIsStudent) => {
  if (!goal?.set_by_role) return ''
  if (goal.set_by_self) return viewerIsStudent ? 'You set this goal' : 'They set this goal'
  const who = { parent: 'a parent', advisor: 'a teacher', org_admin: 'the school', superadmin: 'Optio' }
  return `Set by ${who[goal.set_by_role] || 'the school'}`
}

const WeeklyXpGoalCard = ({ studentId, viewerIsStudent = false, studentFirstName, className = '' }) => {
  const [goal, setGoal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!studentId) return
    try {
      const res = await api.get(`/api/xp-goals/student/${studentId}`)
      setGoal(res.data?.goal || null)
    } catch (err) {
      // A goal card is decoration on someone else's page. A 403 (no
      // relationship) or a transient failure hides it rather than breaking the
      // page it sits on.
      logger.debug('Weekly XP goal unavailable', err)
      setGoal(null)
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => { load() }, [load])

  const openEditor = () => {
    setDraft(goal?.target_xp ? String(goal.target_xp) : '')
    setNote(goal?.note || '')
    setEditing(true)
  }

  const save = async (value) => {
    const target = Number(value)
    if (!Number.isInteger(target) || target < 1 || target > 10000) {
      toast.error('Pick a whole number of XP between 1 and 10,000')
      return
    }
    setSaving(true)
    try {
      const res = await api.put(`/api/xp-goals/student/${studentId}`, {
        target_xp: target,
        note: note.trim() || null,
      })
      setGoal(res.data?.goal || null)
      setEditing(false)
      toast.success('Weekly goal saved')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the goal')
    } finally {
      setSaving(false)
    }
  }

  const clear = async () => {
    setSaving(true)
    try {
      const res = await api.delete(`/api/xp-goals/student/${studentId}`)
      setGoal(res.data?.goal || null)
      setEditing(false)
      toast.success('Weekly goal removed')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove the goal')
    } finally {
      setSaving(false)
    }
  }

  // Nothing to show while loading, for schools without the feature, or for a
  // viewer the server declined.
  if (loading || !goal?.enabled) return null

  const { target_xp: target, xp_earned: earned, percent, met, remaining_xp: remaining } = goal
  const name = studentFirstName || 'This student'

  return (
    // Same chrome as the dashboard's Learning Rhythm / Upcoming Tasks cards, so
    // it sits in that grid as a peer rather than a transplant.
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Weekly XP Goal</h2>
          <p className="text-xs text-gray-500 mt-0.5">{formatRange(goal.week_start, goal.week_end)}</p>
        </div>
        {goal.can_edit && !editing && (
          <Button variant="ghost" size="xs" onClick={openEditor}>
            {target ? 'Change' : 'Set a goal'}
          </Button>
        )}
      </div>

      {target ? (
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-gray-900">
              {earned.toLocaleString()}
              <span className="text-base font-medium text-gray-400"> / {target.toLocaleString()} XP</span>
            </span>
            <span className={`text-sm font-semibold ${met ? 'text-green-600' : 'text-optio-purple'}`}>
              {percent}%
            </span>
          </div>

          <div
            className="mt-2 h-2.5 w-full rounded-full bg-gray-100 overflow-hidden"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Weekly XP goal progress"
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor(percent, met)}`}
              style={{ width: `${percent}%` }}
            />
          </div>

          <p className="mt-2 text-sm text-gray-600">
            {met
              ? (viewerIsStudent
                  ? 'Goal met. Everything from here is extra.'
                  : `${name} met this week's goal.`)
              : `${remaining.toLocaleString()} XP to go this week.`}
          </p>

          {goal.note && <p className="mt-2 text-sm text-gray-500 italic">"{goal.note}"</p>}
          <p className="mt-1 text-xs text-gray-400">{setterLabel(goal, viewerIsStudent)}</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-500">
          {goal.can_edit
            ? (viewerIsStudent
                ? `No goal yet. You have earned ${earned.toLocaleString()} XP this week.`
                : `No goal set yet. ${name} has earned ${earned.toLocaleString()} XP this week.`)
            : `${earned.toLocaleString()} XP earned this week. No goal set.`}
        </p>
      )}

      {editing && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <label htmlFor="weekly-xp-target" className="block text-sm font-medium text-gray-700">
            XP to earn each week
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDraft(String(preset))}
                className={`rounded-full px-3 py-1.5 text-sm border transition ${
                  String(preset) === draft
                    ? 'border-optio-purple bg-optio-purple/5 text-optio-purple font-semibold'
                    : 'border-gray-300 text-gray-600 hover:border-optio-purple'
                }`}
              >
                {preset.toLocaleString()}
              </button>
            ))}
          </div>
          <input
            id="weekly-xp-target"
            type="number"
            min={1}
            max={10000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Or type a number"
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={280}
            placeholder={viewerIsStudent ? 'Add a note (optional)' : 'A note for the student (optional)'}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
          />
          <p className="mt-2 text-xs text-gray-400">
            This goal keeps applying every week until someone changes it.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => save(draft)} loading={saving} disabled={saving}>
              Save goal
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            {target && (
              <Button variant="ghost" size="sm" onClick={clear} disabled={saving}>
                Remove goal
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default WeeklyXpGoalCard
