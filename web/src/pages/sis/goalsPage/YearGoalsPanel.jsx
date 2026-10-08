import React, { useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import Button from '../../../components/ui/Button'
import ModalOverlay from '../../../components/ui/ModalOverlay'
import { INLINE_INPUT_CLASS } from '../../../components/ui/Input'
import { useSisOrg } from '../useSisOrg'
import { useSaveYearGoals, useYearGoals } from '../../../hooks/api/useWeeklyGoals'

/**
 * Year goals -- what each student is working toward this school year, one
 * goal per learning area (the school's goal subjects). The weekly goals a
 * coach sets each Monday serve these. A tab of the Goals page (2026-10-08).
 */

const field = INLINE_INPUT_CLASS

const YearGoalsEditor = ({ student, subjects, orgId, onClose }) => {
  const [goals, setGoals] = useState(() => ({ ...student.year_goals }))
  const save = useSaveYearGoals(orgId)

  const submit = async () => {
    try {
      await save.mutateAsync({
        studentId: student.student_id,
        subjects: subjects.map((subject) => ({ subject, year_goal: goals[subject] || '' })),
      })
      toast.success('Year goals saved')
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save the year goals')
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-xl font-bold text-neutral-900 mb-4">{student.name}: year goals</h2>
        <div className="space-y-3">
          {subjects.map((subject) => (
            <label key={subject} className="block text-sm text-neutral-700">
              {subject}
              <input className={`${field} w-full mt-1`} value={goals[subject] || ''}
                onChange={(e) => setGoals((g) => ({ ...g, [subject]: e.target.value }))} />
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending}>Save year goals</Button>
        </div>
      </div>
    </ModalOverlay>
  )
}

export default function YearGoalsPanel() {
  const { orgId } = useSisOrg()
  const { data, isLoading, isError } = useYearGoals(orgId)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)

  const students = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.students || []).filter((s) => !q || (s.name || '').toLowerCase().includes(q))
  }, [data, search])

  if (isLoading) return <p className="text-neutral-500">Loading…</p>
  if (isError) return <p className="text-red-600">Could not load the year goals.</p>
  if (!data.students.length) {
    return <p className="text-neutral-500">No students yet. Students appear here once they join the school.</p>
  }

  const editing = data.students.find((s) => s.student_id === editingId)
  return (
    <div>
      <input className={`${field} w-full sm:w-56 mb-4`} value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search students" aria-label="Search students" />
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        {students.map((s) => {
          const set = Object.entries(s.year_goals || {}).filter(([, g]) => (g || '').trim())
          return (
            <button key={s.student_id} type="button" onClick={() => setEditingId(s.student_id)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors">
              <span className="block text-sm font-medium text-neutral-900">{s.name}</span>
              <span className="block text-xs text-neutral-500 truncate">
                {set.length === 0
                  ? 'No year goals yet'
                  : set.map(([subject, goal]) => `${subject}: ${goal}`).join(' · ')}
              </span>
            </button>
          )
        })}
      </div>
      {editing && (
        <YearGoalsEditor student={editing} subjects={data.subjects} orgId={orgId}
          onClose={() => setEditingId(null)} />
      )}
    </div>
  )
}
