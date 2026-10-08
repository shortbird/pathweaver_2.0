import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { UserGroupIcon } from '@heroicons/react/24/outline'
import { useSisOrg } from '../useSisOrg'
import { useStudentWorkList } from '../../../hooks/api/useStudentWork'
import { Input } from '../../../components/ui/Input'
import EmptyState from '../../../components/ui/EmptyState'

/**
 * Students -- every current student in the school, for a teacher who works
 * with one child at a time (2026-10-07: "we need a more individual option
 * where school teachers can assign quests to individual students and work
 * with them that way"). The Students page's first tab (pages/sis/StudentsPage),
 * the individual_work module's own way in since 2026-10-08, so a school that
 * works one child at a time needs no classes. A name opens that student's
 * page (/student-work/:id): their quests task by task, quests given just to
 * them, tasks written for them, work waiting for review, goals, notes.
 *
 * Every staff member sees every student. At a microschool every teacher works
 * with every child, and that was the decision.
 */

const initials = (name) => (name || '?').split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

export const lastSeen = (iso) => {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'Active today'
  if (days === 1) return 'Active yesterday'
  if (days < 30) return `Active ${days} days ago`
  return `Last active ${new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

export default function StudentsPanel() {
  const { orgId } = useSisOrg()
  const { data: students = [], isLoading, isError } = useStudentWorkList(orgId)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? students.filter((s) => s.name.toLowerCase().includes(q)) : students
  }, [students, search])

  if (isLoading) return <p className="text-neutral-500">Loading…</p>
  if (isError) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4" role="alert">
        Could not load the students.
      </div>
    )
  }
  if (!students.length) {
    return <EmptyState icon={UserGroupIcon} title="No students yet"
      hint="Students appear here once they are added to your school." />
  }

  return (
    <div>
      <p className="text-sm text-neutral-500 mb-4">
        Work with one student at a time: give them a quest of their own, set when it is due,
        add tasks just for them, and keep private notes.
      </p>
      <div className="max-w-md mb-4">
        <Input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a student…" aria-label="Find a student" />
      </div>
      {!rows.length && <EmptyState plain title="Nobody by that name" />}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((s) => (
          <li key={s.id}>
            <Link to={`/student-work/${s.id}`}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 hover:border-optio-purple hover:shadow-sm transition">
              {s.avatar_url ? (
                <img src={s.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
              ) : (
                <span aria-hidden="true"
                  className="w-10 h-10 rounded-full bg-optio-purple/10 text-optio-purple text-sm font-semibold flex items-center justify-center shrink-0">
                  {initials(s.name)}
                </span>
              )}
              <span className="min-w-0">
                <span className="block font-medium text-neutral-900 truncate">{s.name}</span>
                <span className="block text-xs text-neutral-500">
                  {[
                    s.individual_quests
                      ? `${s.individual_quests} ${s.individual_quests === 1 ? 'quest' : 'quests'} just for them`
                      : null,
                    lastSeen(s.last_active),
                  ].filter(Boolean).join(' · ') || 'Not active yet'}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
