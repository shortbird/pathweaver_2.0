import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PrinterIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'

/**
 * StudentProgressTab — how each student in a class is doing on the quests
 * assigned to it.
 *
 * Everything here is read from what students have actually done (their quest
 * enrollments and completed tasks). Nothing is typed in by the teacher; this
 * replaced the hand-entered gradebook, whose numbers only ever reflected
 * whoever remembered to fill it in.
 *
 * One row per student, one column per assigned quest. A cell says where that
 * student is on that quest: not started, part-way (3/5), or done.
 */

const cellStyle = (c) => {
  if (!c.started) return 'bg-gray-50 text-neutral-400'
  if (c.completed) return 'bg-green-50 text-green-700 font-semibold'
  return 'bg-amber-50 text-amber-800'
}

const cellLabel = (c) => {
  if (!c.started) return 'Not started'
  if (c.completed) return 'Done'
  if (!c.total) return 'Started'
  return `${c.done}/${c.total}`
}

const printProgress = (className, quests, students) => {
  const head = quests.map((q) => `<th>${q.title}</th>`).join('')
  const rows = students.map((s) => `
    <tr>
      <td class="name">${s.name}</td>
      ${s.cells.map((c) => `<td>${cellLabel(c)}</td>`).join('')}
      <td>${s.tasks_done}/${s.tasks_total || 0}</td>
    </tr>`).join('')
  const html = `<!doctype html><html><head><title>${className} — student progress</title>
    <style>
      body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding: 24px; }
      h1 { font-size: 18px; margin-bottom: 4px; }
      p { color: #6b7280; font-size: 12px; margin-top: 0; }
      table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 16px; }
      th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: center; }
      th { background: #f9fafb; text-align: center; }
      td.name, th:first-child { text-align: left; }
    </style></head><body>
    <h1>${className || 'Class'} — student progress</h1>
    <p>Generated ${new Date().toLocaleDateString()}</p>
    <table><thead><tr><th>Student</th>${head}<th>Tasks done</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.print()
}

const StudentProgressTab = ({ classId, className }) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!classId) return
    setLoading(true)
    api.get(`/api/sis/classes/${classId}/progress`)
      .then((r) => setData(r.data))
      .catch((e) => toast.error(e?.response?.data?.error || 'Failed to load student progress'))
      .finally(() => setLoading(false))
  }, [classId])

  useEffect(() => { load() }, [load])

  const quests = data?.quests || []
  const students = data?.students || []

  const summary = useMemo(() => {
    if (!students.length) return null
    const notStarted = students.filter((s) => s.quests_started === 0).length
    const allDone = students.filter((s) => quests.length && s.quests_completed === quests.length).length
    return { notStarted, allDone }
  }, [students, quests.length])

  if (loading) return <p className="text-neutral-500">Loading…</p>

  if (!quests.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <p className="text-sm text-neutral-600 font-medium">No quests assigned to this class yet.</p>
        <p className="text-sm text-neutral-500 mt-1">
          Assign one on the Quests tab and progress will appear here automatically as students work.
        </p>
      </div>
    )
  }

  if (!students.length) {
    return <p className="text-neutral-500">No students enrolled in this class yet.</p>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <p className="text-sm text-neutral-500">
          Updates on its own as students complete tasks — there is nothing to fill in.
          {summary?.notStarted ? ` ${summary.notStarted} ${summary.notStarted === 1 ? 'student hasn’t' : 'students haven’t'} started anything yet.` : ''}
        </p>
        <button
          onClick={() => printProgress(className, quests, students)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50 shrink-0"
        >
          <PrinterIcon className="w-4 h-4" /> Print
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-4 py-2.5 font-semibold text-neutral-700 sticky left-0 bg-white">Student</th>
              {quests.map((q) => (
                <th key={q.quest_id} className="px-3 py-2.5 font-medium text-neutral-600 min-w-[7rem]">
                  <span className="block truncate max-w-[10rem] mx-auto" title={q.title}>{q.title}</span>
                  {q.due_date && <span className="block text-[11px] font-normal text-neutral-400">due {q.due_date}</span>}
                </th>
              ))}
              <th className="px-3 py-2.5 font-medium text-neutral-600">Tasks done</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.student_id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2.5 font-medium text-neutral-900 sticky left-0 bg-white">{s.name}</td>
                {s.cells.map((c) => (
                  <td key={c.quest_id} className="px-3 py-2.5 text-center">
                    <span className={`inline-block px-2 py-1 rounded-md text-xs ${cellStyle(c)}`}>
                      {cellLabel(c)}
                    </span>
                  </td>
                ))}
                <td className="px-3 py-2.5 text-center text-neutral-600">
                  {s.tasks_done}<span className="text-neutral-400">/{s.tasks_total || 0}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default StudentProgressTab
