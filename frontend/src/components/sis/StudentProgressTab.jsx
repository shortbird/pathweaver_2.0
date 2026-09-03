import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { PrinterIcon, InboxIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import ModalOverlay from '../ui/ModalOverlay'

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
  const [openStudent, setOpenStudent] = useState(null)

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
        <div className="flex items-center gap-2 shrink-0">
          {/* Submissions is its own item in the sidebar, which is a long way
              from the page you are on when you wonder what somebody handed in
              (Gryffin, 2026-08-27: "a submissions tab should be under student
              progress. It is hard to figure out where to find that"). Linked,
              not duplicated, and pre-filtered to this class. */}
          <Link
            to={`/submissions?class_id=${classId}&from=progress`}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50"
          >
            <InboxIcon className="w-4 h-4" /> Review submissions
          </Link>
          <button
            onClick={() => printProgress(className, quests, students)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50"
          >
            <PrinterIcon className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-4 py-2.5 font-semibold text-neutral-700 sticky left-0 bg-white">Student</th>
              {quests.map((q) => (
                <th key={q.quest_id} className="px-3 py-2.5 font-medium text-neutral-600 min-w-[7rem]">
                  <span className="block truncate max-w-[10rem] mx-auto" title={q.title}>{q.title}</span>
                  {q.due_date && (
                    <span className="block text-[11px] font-normal text-neutral-400">
                      due {new Date(q.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </th>
              ))}
              <th className="px-3 py-2.5 font-medium text-neutral-600">Tasks done</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.student_id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2.5 font-medium sticky left-0 bg-white">
                  {/* Clicking a name opens what is and isn't done, task by task.
                      The grid answers "how many"; a teacher about to speak to a
                      family needs "which ones" (Gryffin, 2026-08-27). */}
                  <button
                    type="button"
                    onClick={() => setOpenStudent(s)}
                    className="text-neutral-900 hover:text-optio-purple hover:underline text-left"
                  >
                    {s.name}
                  </button>
                </td>
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

      {openStudent && (
        <StudentWorkPanel
          classId={classId}
          student={openStudent}
          onClose={() => setOpenStudent(null)}
        />
      )}
    </div>
  )
}

/**
 * One student's quests, task by task, with a nudge about what is left.
 *
 * The reminder reaches the student AND their guardians, which is what was asked
 * for: "send a reminder of what work they haven't completed and that should be
 * sent to the parent and student."
 */
const StudentWorkPanel = ({ classId, student, onClose }) => {
  const [work, setWork] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reminding, setReminding] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get(`/api/sis/classes/${classId}/students/${student.student_id}/progress`)
      .then((r) => setWork(r.data?.quests || []))
      .catch((e) => toast.error(e?.response?.data?.error || 'Could not load this student'))
      .finally(() => setLoading(false))
  }, [classId, student.student_id])

  const remind = async () => {
    setReminding(true)
    try {
      const { data } = await api.post(
        `/api/sis/classes/${classId}/students/${student.student_id}/remind`, {})
      toast.success(`Reminder sent to ${data.notified} ${data.notified === 1 ? 'person' : 'people'}`)
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not send the reminder')
    } finally {
      setReminding(false)
    }
  }

  const outstanding = (work || []).filter(
    (q) => !q.completed && (!q.started || q.tasks.some((t) => !t.done)))

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between p-4 border-b border-gray-200 shrink-0">
          <div>
            <h3 className="font-semibold text-neutral-900">{student.name}</h3>
            <p className="text-sm text-neutral-500">
              {student.tasks_done}/{student.tasks_total || 0} tasks done
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-neutral-700">✕</button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          {loading && <p className="text-sm text-neutral-500">Loading…</p>}
          {!loading && (work || []).map((q) => (
            <div key={q.quest_id}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium text-sm text-neutral-800">{q.title}</p>
                {q.due_date && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">
                    due {new Date(q.due_date).toLocaleDateString()}
                  </span>
                )}
              </div>
              {!q.started && <p className="text-sm text-neutral-400 mt-0.5">Not started</p>}
              {q.started && q.tasks.length === 0 && (
                <p className="text-sm text-neutral-400 mt-0.5">No tasks on this quest</p>
              )}
              <ul className="mt-1 space-y-0.5">
                {q.tasks.map((t) => (
                  <li key={t.id} className="text-sm flex items-start gap-2">
                    <span className={t.done ? 'text-green-600' : 'text-neutral-300'}>
                      {t.done ? '✓' : '○'}
                    </span>
                    {/* A finished task links straight to its submission review
                        (Gryffin, 2026-08-28: "click on the task to see their
                        submission"). */}
                    {t.done && t.completion_id ? (
                      <Link
                        to={`/submissions?class_id=${classId}&completion_id=${t.completion_id}&from=progress`}
                        className="text-neutral-500 line-through hover:text-optio-purple hover:no-underline"
                        title="See the submission"
                      >
                        {t.title}
                      </Link>
                    ) : (
                      <span className={t.done ? 'text-neutral-500 line-through' : 'text-neutral-700'}>
                        {t.title}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-200 flex items-center justify-between gap-3 shrink-0">
          <span className="text-sm text-neutral-500">
            {outstanding.length
              ? `${outstanding.length} ${outstanding.length === 1 ? 'quest' : 'quests'} outstanding`
              : 'Nothing outstanding'}
          </span>
          <button
            onClick={remind}
            disabled={reminding || !outstanding.length}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm disabled:opacity-40"
          >
            {reminding ? 'Sending…' : 'Send reminder'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

export default StudentProgressTab
