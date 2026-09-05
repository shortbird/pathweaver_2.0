import React, { useState, useEffect, useMemo } from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ArrowTopRightOnSquareIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import classService from '../../services/classService'

/**
 * ClassActivityTab - what the whole roster finished in one week, on one screen.
 *
 * Built for Friday check-ins: an advisor could otherwise only see a student's
 * completed projects by opening that student's account, one of 31 at a time.
 * The week runs Saturday to Friday so the check-in day closes the week rather
 * than splitting it.
 *
 * Shows work from any quest, not only quests assigned to the class — most
 * classes here are a roster, not a syllabus, and the class-scoped number on the
 * Students tab reads zero for all of them.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Local-midnight date from a YYYY-MM-DD string, free of UTC parsing drift. */
const parseDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const toIso = (date) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The Saturday-to-Friday week containing `date`. Saturday is day 6. */
export const weekContaining = (date) => {
  const start = new Date(date.getTime() - ((date.getDay() - 6 + 7) % 7) * DAY_MS)
  start.setHours(0, 0, 0, 0)
  return {
    startDate: toIso(start),
    endDate: toIso(new Date(start.getTime() + 6 * DAY_MS)),
  }
}

const shiftWeek = (range, weeks) => {
  const start = parseDay(range.startDate)
  return weekContaining(new Date(start.getTime() + weeks * 7 * DAY_MS))
}

const formatRange = ({ startDate, endDate }) => {
  const opts = { month: 'short', day: 'numeric' }
  const start = parseDay(startDate)
  const end = parseDay(endDate)
  const year = end.getFullYear() !== new Date().getFullYear() ? `, ${end.getFullYear()}` : ''
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}${year}`
}

const studentName = (student = {}) =>
  `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
  student.display_name ||
  student.email ||
  'Unknown student'

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`

export default function ClassActivityTab({ orgId, classId, className }) {
  const [range, setRange] = useState(() => weekContaining(new Date()))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(() => new Set())

  const thisWeek = useMemo(() => weekContaining(new Date()), [])
  const isCurrentWeek = range.startDate === thisWeek.startDate

  useEffect(() => {
    let cancelled = false

    const fetchActivity = async () => {
      try {
        setLoading(true)
        const response = await classService.getClassActivity(orgId, classId, range)
        if (cancelled) return
        if (response.success) {
          setData(response)
        } else {
          toast.error(response.error || 'Failed to load activity')
        }
      } catch (error) {
        if (cancelled) return
        console.error('Failed to fetch class activity:', error)
        toast.error(error.response?.data?.error || 'Failed to load activity')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchActivity()
    return () => {
      cancelled = true
    }
  }, [orgId, classId, range.startDate, range.endDate])

  const toggleStudent = (studentId) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(studentId) ? next.delete(studentId) : next.add(studentId)
      return next
    })
  }

  const students = data?.students || []
  const summary = data?.summary
  const active = students.filter((s) => s.tasks_completed > 0)
  const idle = students.filter((s) => !s.tasks_completed)

  const allExpanded = active.length > 0 && active.every((s) => expanded.has(s.student_id))

  const handleExpandAll = () => {
    setExpanded(allExpanded ? new Set() : new Set(active.map((s) => s.student_id)))
  }

  const handleExportCsv = () => {
    const rows = [['Student', 'Project', 'Task', 'XP', 'Completed']]
    students.forEach((student) => {
      const name = studentName(student.student)
      if (!student.quests.length) {
        rows.push([name, 'No activity this week', '', 0, ''])
        return
      }
      student.quests.forEach((quest) => {
        quest.tasks.forEach((task) => {
          rows.push([
            name,
            quest.title,
            task.title,
            task.xp,
            task.completed_at ? new Date(task.completed_at).toLocaleDateString('en-US') : '',
          ])
        })
      })
    })

    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
    const url = window.URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${(className || 'class').replace(/\s+/g, '_')}_${range.startDate}_to_${range.endDate}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* Week picker */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRange((prev) => shiftWeek(prev, -1))}
            className="p-1.5 rounded-md text-gray-500 hover:bg-white hover:text-optio-purple transition-colors"
            title="Previous week"
            aria-label="Previous week"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <div className="text-center min-w-[11rem]">
            <div className="font-semibold text-gray-900">{formatRange(range)}</div>
            <div className="text-xs text-gray-500">
              {isCurrentWeek ? 'This week (Sat–Fri)' : 'Sat–Fri'}
            </div>
          </div>
          <button
            onClick={() => setRange((prev) => shiftWeek(prev, 1))}
            disabled={isCurrentWeek}
            className="p-1.5 rounded-md text-gray-500 hover:bg-white hover:text-optio-purple transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            title="Next week"
            aria-label="Next week"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
          {!isCurrentWeek && (
            <button
              onClick={() => setRange(thisWeek)}
              className="ml-1 px-3 py-1.5 text-sm text-optio-purple hover:bg-optio-purple/10 rounded-md"
            >
              This week
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {active.length > 0 && (
            <button
              onClick={handleExpandAll}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-optio-purple rounded-md"
            >
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </button>
          )}
          <button
            onClick={handleExportCsv}
            disabled={loading || students.length === 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
          <span className="ml-3 text-gray-500">Loading activity...</span>
        </div>
      ) : (
        <>
          {/* Summary */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-2xl font-bold text-gray-900">
                  {summary.active_students}
                  <span className="text-base font-normal text-gray-400">
                    {' '}/ {summary.total_students}
                  </span>
                </div>
                <div className="text-sm text-gray-600">Students active</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-2xl font-bold text-optio-purple">
                  {summary.total_xp?.toLocaleString()}
                </div>
                <div className="text-sm text-gray-600">XP earned</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-2xl font-bold text-optio-pink">{summary.total_tasks}</div>
                <div className="text-sm text-gray-600">Tasks completed</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-2xl font-bold text-gray-900">{summary.total_quests}</div>
                <div className="text-sm text-gray-600">Projects worked on</div>
              </div>
            </div>
          )}

          {students.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg text-gray-500">
              No students enrolled in this class yet
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
              {active.map((student) => {
                const isOpen = expanded.has(student.student_id)
                return (
                  <div key={student.student_id}>
                    <button
                      onClick={() => toggleStudent(student.student_id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                      aria-expanded={isOpen}
                    >
                      <ChevronDownIcon
                        className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${
                          isOpen ? '' : '-rotate-90'
                        }`}
                      />
                      <div className="h-9 w-9 flex-shrink-0 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center text-white font-medium">
                        {studentName(student.student).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">
                          {studentName(student.student)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {student.quests.length}{' '}
                          {student.quests.length === 1 ? 'project' : 'projects'} ·{' '}
                          {student.tasks_completed}{' '}
                          {student.tasks_completed === 1 ? 'task' : 'tasks'}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-semibold text-optio-purple">
                          {student.xp.toLocaleString()} XP
                        </div>
                        <div className="text-xs text-gray-500">this week</div>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 pl-16 space-y-3">
                        {student.quests.map((quest) => (
                          <div
                            key={quest.quest_id || quest.title}
                            className="border-l-2 border-optio-purple/20 pl-4"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              {quest.quest_id ? (
                                <a
                                  href={`/quests/${quest.quest_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-gray-900 hover:text-optio-purple hover:underline inline-flex items-center gap-1"
                                >
                                  {quest.title}
                                  <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 text-gray-400" />
                                </a>
                              ) : (
                                <span className="font-medium text-gray-900">{quest.title}</span>
                              )}
                              <span className="text-xs font-medium text-optio-purple">
                                {quest.xp.toLocaleString()} XP
                              </span>
                            </div>
                            <ul className="mt-1 space-y-1">
                              {quest.tasks.map((task, index) => (
                                <li
                                  key={`${quest.quest_id}-${index}`}
                                  className="flex items-baseline justify-between gap-3 text-sm"
                                >
                                  <span className="text-gray-600">{task.title}</span>
                                  <span className="text-xs text-gray-400 whitespace-nowrap">
                                    {task.completed_at
                                      ? new Date(task.completed_at).toLocaleDateString('en-US', {
                                          weekday: 'short',
                                        })
                                      : ''}{' '}
                                    · {task.xp} XP
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Who has nothing to show — the other half of a check-in list. */}
              {idle.length > 0 && (
                <div className="px-4 py-3 bg-gray-50/50">
                  <div className="text-sm font-medium text-gray-500 mb-2">
                    No activity this week ({idle.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {idle.map((student) => (
                      <span
                        key={student.student_id}
                        className="inline-flex px-2.5 py-1 rounded-full bg-white border border-gray-200 text-sm text-gray-600"
                      >
                        {studentName(student.student)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
