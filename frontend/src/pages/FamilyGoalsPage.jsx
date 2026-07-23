import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import Button from '../components/ui/Button'

/**
 * Goal Setting — the post-registration step for goals-mode schools (e.g. Gryffin
 * Learning Center). Parents set a long-term direction and per-subject year goals
 * for each child, save drafts as they go, then submit for a review meeting with
 * school staff. Staff mark them reviewed on the SIS Goals page.
 */

const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const emptyForm = (subjects) => ({
  direction: '',
  direction_notes: '',
  subjects: subjects.map((s) => ({ subject: s, year_goal: '', long_term: '' })),
})

// Merge a saved goal row into the form shape, keeping the org's subject list
// as the source of truth (config changes add/remove cards without losing text).
const formFromGoal = (goal, subjects) => {
  if (!goal) return emptyForm(subjects)
  const saved = Array.isArray(goal.subjects) ? goal.subjects : []
  return {
    direction: goal.direction || '',
    direction_notes: goal.direction_notes || '',
    subjects: subjects.map((name) => {
      const match = saved.find((s) => s.subject === name)
      return { subject: name, year_goal: match?.year_goal || '', long_term: match?.long_term || '' }
    }),
  }
}

const firstName = (name) => (name || '').split(' ')[0] || 'your student'

const StatusBanner = ({ goal }) => {
  if (!goal || goal.status === 'draft') {
    return (
      <div className="rounded-lg bg-gray-100 text-neutral-600 text-sm px-4 py-3 mb-4">
        Draft — save as you go, then submit when you're ready to review together.
      </div>
    )
  }
  if (goal.status === 'submitted') {
    return (
      <div className="rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm px-4 py-3 mb-4">
        Submitted — you'll review these at your meeting with the school.
      </div>
    )
  }
  return (
    <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 mb-4">
      <div className="font-semibold">Reviewed by the school</div>
      {goal.review_notes && <div className="mt-1 whitespace-pre-wrap">{goal.review_notes}</div>}
    </div>
  )
}

const FamilyGoalsPage = () => {
  const [students, setStudents] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [forms, setForms] = useState({}) // studentId -> form
  const [saving, setSaving] = useState(false)

  const load = () => api.get('/api/sis/goals/mine')
    .then((r) => {
      const list = r.data?.students || []
      setStudents(list)
      setActiveId((prev) => prev && list.some((s) => s.id === prev) ? prev : list[0]?.id || null)
      setForms((prev) => {
        const next = { ...prev }
        list.forEach((s) => {
          if (!next[s.id]) next[s.id] = formFromGoal(s.goal, s.config?.subjects || [])
        })
        return next
      })
    })
    .catch(() => { toast.error('Could not load goal setting'); setStudents([]) })

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const active = students?.find((s) => s.id === activeId)
  const form = active ? forms[active.id] : null

  const setForm = (updater) => {
    if (!active) return
    setForms((prev) => ({ ...prev, [active.id]: updater(prev[active.id]) }))
  }
  const setSubject = (index, key, value) => setForm((f) => ({
    ...f,
    subjects: f.subjects.map((s, i) => (i === index ? { ...s, [key]: value } : s)),
  }))

  const save = async (submit) => {
    if (!active || !form) return
    if (submit) {
      const orgName = active.config?.organization_name || 'the school'
      if (!window.confirm(`You'll review these together at your meeting with ${orgName} staff. Submit now?`)) return
    }
    setSaving(true)
    try {
      await api.put(`/api/sis/goals/students/${active.id}`, { ...form, submit })
      toast.success(submit ? 'Goals submitted for review' : 'Draft saved')
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save goals')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="rounded-xl bg-gradient-to-r from-optio-purple to-optio-pink text-white px-6 py-5 mb-6">
        <h1 className="text-2xl font-bold">Goal Setting</h1>
        <p className="text-sm opacity-90 mt-1">
          Set a direction and this year's goals for each of your children, then review them together with school staff.
        </p>
      </div>

      {students === null && <p className="text-neutral-500">Loading…</p>}
      {students?.length === 0 && (
        <p className="text-neutral-500">
          Goal setting isn't set up for your family yet. If your school uses goal setting, reach out to them to get connected.
        </p>
      )}

      {students?.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {students.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
                s.id === activeId
                  ? 'border-optio-purple bg-optio-purple/10 text-optio-purple'
                  : 'border-gray-200 bg-white text-neutral-600 hover:border-optio-purple/50'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {active && form && (
        <div>
          <StatusBanner goal={active.goal} />

          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h2 className="text-base font-semibold text-neutral-900 mb-1">Direction</h2>
            <p className="text-sm text-neutral-500 mb-3">The big picture — where is {firstName(active.name)} heading after this?</p>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              What direction is {firstName(active.name)} heading? (college, trade school, career...)
            </label>
            <input
              className={field}
              value={form.direction}
              onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}
              placeholder="e.g. Trade school for welding"
            />
            <label className="block text-sm font-medium text-neutral-700 mt-3 mb-1">Notes (optional)</label>
            <textarea
              className={field}
              rows={3}
              value={form.direction_notes}
              onChange={(e) => setForm((f) => ({ ...f, direction_notes: e.target.value }))}
              placeholder="Anything else about this direction"
            />
          </div>

          {form.subjects.map((s, i) => (
            <div key={s.subject} className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <h2 className="text-base font-semibold text-neutral-900 mb-3">{s.subject}</h2>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                What does {firstName(active.name)} want to achieve this year?
              </label>
              <textarea
                className={field}
                rows={2}
                value={s.year_goal}
                onChange={(e) => setSubject(i, 'year_goal', e.target.value)}
              />
              <label className="block text-sm font-medium text-neutral-700 mt-3 mb-1">
                Long-term direction in this subject
              </label>
              <textarea
                className={field}
                rows={2}
                value={s.long_term}
                onChange={(e) => setSubject(i, 'long_term', e.target.value)}
              />
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-end gap-3 pb-8">
            <span className="text-xs text-neutral-400 mr-auto">
              School year {active.config?.school_year}
            </span>
            <Button variant="secondary" onClick={() => save(false)} disabled={saving}>
              Save draft
            </Button>
            <Button onClick={() => save(true)} disabled={saving}>
              Submit for review
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default FamilyGoalsPage
