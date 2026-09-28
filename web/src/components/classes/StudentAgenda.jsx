import React, { useState, useEffect } from 'react'
import { CalendarDaysIcon } from '@heroicons/react/24/outline'
import { useNavigate } from 'react-router-dom'
import classService from '../../services/classService'

/**
 * StudentAgenda - what the student has due across their classes: quests with a
 * due date, and the individual tasks a teacher dated (GET /api/student/agenda,
 * items of kind 'quest' and 'task').
 *
 * iCreate, ticket 26c91e25 (Karina): "Is there a way to have a running due
 * date list of homework? And past assignments could move to the bottom, in
 * case kids didn't complete them?" So the order is the owner's: what is coming
 * up first (This week, Next week, Later), and Past due at the BOTTOM. An item
 * stays until its work is turned in; the server drops it then.
 *
 * Renders nothing when there is nothing dated, so it stays invisible for
 * schools that do not use due dates.
 */

const DAY = 86400000

export const AGENDA_GROUPS = ['This week', 'Next week', 'Later', 'Past due']

/** Items into the four groups, in display order. Exported for tests. */
export function groupAgenda(items, now = Date.now()) {
  const groups = Object.fromEntries(AGENDA_GROUPS.map((g) => [g, []]))
  for (const it of items || []) {
    if (!it.due_date) continue
    const due = new Date(it.due_date).getTime()
    if (Number.isNaN(due)) continue
    const diff = due - now
    if (diff < 0) groups['Past due'].push(it)
    else if (diff <= 7 * DAY) groups['This week'].push(it)
    else if (diff <= 14 * DAY) groups['Next week'].push(it)
    else groups.Later.push(it)
  }
  const byDue = (a, b) => new Date(a.due_date) - new Date(b.due_date)
  AGENDA_GROUPS.forEach((g) => groups[g].sort(byDue))
  return AGENDA_GROUPS.map((label) => ({ label, items: groups[label] })).filter((g) => g.items.length)
}

/** "Chapters 1-5 · Out of the Dust" for a task, the quest's title for a quest. */
export function agendaItemTitle(it) {
  if (it.kind === 'task') {
    return [it.task_title || it.title, it.quest_title].filter(Boolean).join(' · ')
  }
  return it.quest_title || it.title
}

const itemKey = (it) => (it.kind === 'task'
  ? `task-${it.class_id}-${it.task_id}`
  : `quest-${it.class_id}-${it.quest_id}`)

export default function StudentAgenda({ basePath = null, studentId = null }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await classService.getStudentAgenda({ studentId })
        if (active && res.success) setItems(res.agenda || [])
      } catch {
        // Silent: agenda is supplementary, never block the page.
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [studentId])

  if (loading || items.length === 0) return null
  const groups = groupAgenda(items)
  if (groups.length === 0) return null

  const openQuest = (it) => {
    if (basePath && it.class_id) {
      try { sessionStorage.setItem('classReturnPath', `${basePath}/${it.class_id}`) } catch { /* private mode */ }
    }
    navigate(`/quests/${it.quest_id}`)
  }

  return (
    <div className="mb-8 bg-white rounded-xl border border-gray-200 p-5" data-testid="student-agenda">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <CalendarDaysIcon className="w-5 h-5 text-optio-purple" />
        Upcoming
      </h2>
      <div className="space-y-4">
        {groups.map(({ label, items: list }) => (
          <div key={label} data-testid={`agenda-group-${label}`}>
            <h3
              className={`text-xs font-semibold uppercase tracking-wide mb-2 ${
                label === 'Past due' ? 'text-red-600' : 'text-gray-500'
              }`}
            >
              {label}
            </h3>
            <div className="space-y-1.5">
              {list.map((it) => (
                <button
                  key={itemKey(it)}
                  onClick={() => openQuest(it)}
                  className="flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors min-h-[44px]"
                >
                  <span className={`text-sm w-16 flex-shrink-0 ${label === 'Past due' ? 'text-red-600' : 'text-gray-500'}`}>
                    {new Date(it.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="font-medium text-gray-900 truncate flex-1">{agendaItemTitle(it)}</span>
                  <span className="text-xs text-gray-400 truncate flex-shrink-0 max-w-[40%]">{it.class_name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
