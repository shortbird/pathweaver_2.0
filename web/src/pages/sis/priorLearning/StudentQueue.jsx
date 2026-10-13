import React, { useMemo, useState } from 'react'

const FILTERS = [
  ['action', 'Needs action'],
  ['family', 'Waiting on family'],
  ['all', 'All students'],
]

const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null)

const Badge = ({ tone, children }) => (
  <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${tone}`}>{children}</span>
)

/**
 * The student list: one row per student, longest wait first (the backend's
 * order). "Needs action" is the default because that is the work; "All
 * students" is there for finding a finished file again.
 */
const StudentQueue = ({ students, totals, selectedId, onSelect }) => {
  const [filter, setFilter] = useState('action')
  const [search, setSearch] = useState('')
  const [school, setSchool] = useState('')

  const schools = useMemo(
    () => [...new Set(students.flatMap((s) => s.schools || []))].sort(),
    [students])

  const shown = students.filter((s) => {
    if (filter === 'action' && !s.needs_action) return false
    if (filter === 'family' && !s.needs_info) return false
    if (school && !(s.schools || []).includes(school)) return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which students">
        {FILTERS.map(([id, label]) => {
          const count = id === 'action' ? totals?.students_needing_action
            : id === 'family' ? students.filter((s) => s.needs_info).length : students.length
          return (
            <button key={id} type="button" onClick={() => setFilter(id)}
                    aria-pressed={filter === id}
                    className={`text-xs px-2.5 py-1 rounded-full border ${filter === id
                      ? 'bg-optio-purple text-white border-optio-purple'
                      : 'bg-white text-gray-700 border-gray-300'}`}>
              {label}{count ? ` · ${count}` : ''}
            </button>
          )
        })}
      </div>
      <div className="flex gap-2">
        <input aria-label="Search students" placeholder="Search students"
               value={search} onChange={(e) => setSearch(e.target.value)}
               className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
        {schools.length > 1 && (
          <select aria-label="School" value={school} onChange={(e) => setSchool(e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm max-w-[9rem]">
            <option value="">All schools</option>
            {schools.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {!shown.length && (
        <p className="text-sm text-gray-500 px-1">
          {filter === 'action' ? 'Nothing waiting. Every record has a decision.' : 'No students here.'}
        </p>
      )}

      <ul className="space-y-1.5">
        {shown.map((s) => {
          const waited = daysSince(s.oldest_waiting_at)
          const active = s.student_id === selectedId
          return (
            <li key={s.student_id}>
              <button type="button" onClick={() => onSelect(s.student_id)}
                      aria-current={active ? 'true' : undefined}
                      className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${active
                        ? 'border-optio-purple bg-purple-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-gray-900 truncate">{s.name}</span>
                  {waited !== null && s.waiting > 0 && (
                    <span className={`text-xs tabular-nums shrink-0 ${waited >= 7 ? 'text-red-700 font-medium' : 'text-gray-500'}`}>
                      {waited === 0 ? 'today' : `${waited}d`}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {[(s.schools || []).join(', '), s.grade_level ? `grade ${s.grade_level}` : null]
                    .filter(Boolean).join(' · ')}
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {s.waiting > 0 && <Badge tone="bg-blue-100 text-blue-800">{s.waiting} to review</Badge>}
                  {s.ai_ready > 0 && <Badge tone="bg-purple-100 text-optio-purple">AI ready</Badge>}
                  {s.not_transcribed > 0 && (
                    <Badge tone="bg-amber-100 text-amber-800">{s.not_transcribed} not on transcript</Badge>
                  )}
                  {s.needs_info > 0 && <Badge tone="bg-gray-100 text-gray-700">{s.needs_info} with family</Badge>}
                  {!s.needs_action && !s.needs_info && <Badge tone="bg-green-100 text-green-800">done</Badge>}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default StudentQueue
