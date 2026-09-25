import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { PrinterIcon, InboxIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import ModalOverlay from '../ui/ModalOverlay'
import { useConfirm } from '../../contexts/ConfirmContext'
import { printHtml } from '../../utils/printView'

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
 * student is on that quest: not started, part-way (3/5), or done -- or "not
 * assigned", when the teacher kept that quest to other students. The
 * per-student panel is where a teacher takes a quest off one student's list, or
 * gives one to them (Gryffin, 2026-09-10: "go into a specific student's
 * assignments and remove them").
 *
 * The student picker narrows the grid to one row. It exists for check-ins: a
 * teacher wants to turn the screen toward a student and show them what the
 * teacher sees, without showing them everyone else (Dallin, 2026-09-15: "a way
 * to filter by student would be very helpful on that page"). Same request: the
 * "Tasks done" column stays put while the quest columns scroll under it, and
 * the grid opens scrolled to its newest quests, which sit at the far right.
 *
 * Since 2026-09-23 (iCreate tickets d4e562c9, 8b928af0, 7cf5d330) a cell leads
 * with XP against the quest's target, reaching that target counts as Done on
 * this tab, an ended quest shows a check and the date, and each student row
 * says when they last turned something in.
 */

const isAssigned = (c) => c.assigned !== false

// XP first, tasks second (iCreate, ticket d4e562c9, 2026-09-23: Colby Barker
// read "2/8" while he had earned the 50 XP the quest asks for -- "So it would
// be 50XP/50XP"). A payload from before the XP fields falls back to tasks.
const hasXp = (o) => typeof o?.xp_earned === 'number'
const xpLabel = (earned, required) => (required ? `${earned} / ${required} XP` : `${earned} XP`)
const tasksLabel = (done, total) => `${done || 0}/${total || 0} tasks`
const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

// Where a student is on one quest. The backend sends `state`; the fallback
// reads the older fields, so a stale tab keeps working through a deploy.
//   Assigned -> Opened -> In progress -> Done, or Set aside
// "Assigned" and "Opened" are separate because assigning a quest creates the
// enrollment at once -- an enrollment alone says nothing about whether the
// student has looked (iCreate, ticket 7cf5d330, 2026-09-23).
const stateOf = (c) => {
  if (c.state) return c.state
  if (!isAssigned(c)) return 'not_assigned'
  if (!c.started) return 'assigned'
  if (c.completed) return 'done'
  return c.done ? 'in_progress' : 'assigned'
}

const cellStyle = (c) => ({
  not_assigned: 'text-neutral-300 border border-dashed border-gray-200',
  assigned: 'bg-gray-50 text-neutral-400',
  opened: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-amber-50 text-amber-800',
  done: 'bg-green-50 text-green-700',
  set_aside: 'bg-gray-100 text-neutral-600',
}[stateOf(c)] || 'bg-gray-50 text-neutral-400')

/** [main line, secondary line or null] for a grid cell. */
const cellLines = (c) => {
  const state = stateOf(c)
  const xp = hasXp(c) ? xpLabel(c.xp_earned, c.xp_required) : null
  const tasks = c.total ? tasksLabel(c.done, c.total) : null
  switch (state) {
    case 'not_assigned': return ['Not assigned', null]
    case 'assigned': return ['Assigned', null]
    case 'opened': return ['Opened', c.first_opened_at ? shortDate(c.first_opened_at) : null]
    case 'set_aside': return ['Set aside', [xp, tasks].filter(Boolean).join(' · ') || null]
    case 'done':
      // Ended by the student or a parent: a check and the date (iCreate,
      // ticket 8b928af0, 2026-09-23: "When a parent completes a Quest and
      // ends it, it would be nice to know/see that on this page. Like a check
      // mark."). Done without ending -- target reached, quest still open --
      // says Done in words instead.
      if (c.completed_at) {
        return [`✓ ${xp || 'Done'}`, [`Ended ${shortDate(c.completed_at)}`, tasks].filter(Boolean).join(' · ')]
      }
      return [xp || 'Done', ['Done', tasks].filter(Boolean).join(' · ')]
    default:
      if (xp) return [xp, tasks]
      return [c.total ? `${c.done}/${c.total}` : 'Started', null]
  }
}

const cellText = (c) => cellLines(c).filter(Boolean).join(' — ')

const totalLines = (s) => (hasXp(s)
  ? [xpLabel(s.xp_earned, s.xp_required), tasksLabel(s.tasks_done, s.tasks_total)]
  : [`${s.tasks_done}/${s.tasks_total || 0}`, null])

// How recently a student did anything, in words a teacher reads at a glance
// (ticket 7cf5d330: "& engagement metric").
const sinceLabel = (iso) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  return `on ${shortDate(iso)}`
}

const engagementText = (s) => {
  if (!('last_activity_at' in s)) return null
  const parts = [s.last_activity_at ? `Last work ${sinceLabel(s.last_activity_at)}` : 'No work turned in yet']
  if (s.xp_last_7_days) parts.push(`+${s.xp_last_7_days} XP this week`)
  return parts.join(' · ')
}

/**
 * The grid's columns. A quest a student made for the class (`made_by`) is kept
 * to that student, so one column each would be a column of "Not assigned" per
 * student. They fold into one "Own quest" column, where each row shows the
 * quest that student made (Gryffin, 2026-09-25).
 */
export const gridColumns = (quests) => {
  const own = new Map(quests.filter((q) => q.made_by).map((q) => [q.quest_id, q]))
  const columns = quests.filter((q) => !q.made_by).map((q) => ({
    key: q.quest_id,
    title: q.title,
    due_date: q.due_date,
    cellsFor: (s) => s.cells.filter((c) => c.quest_id === q.quest_id),
  }))
  if (own.size) {
    columns.push({
      key: 'own-quests',
      title: 'Own quest',
      own: true,
      cellsFor: (s) => s.cells.filter((c) => own.get(c.quest_id)?.made_by === s.student_id)
        .map((c) => ({ ...c, title: own.get(c.quest_id).title })),
    })
  }
  return columns
}

const printProgress = (className, quests, students) => {
  const columns = gridColumns(quests)
  const head = columns.map((col) => `<th>${col.title}</th>`).join('')
  const rows = students.map((s) => `
    <tr>
      <td class="name">${s.name}</td>
      ${columns.map((col) => `<td>${col.cellsFor(s)
        .map((c) => (col.own ? `${c.title}: ${cellText(c)}` : cellText(c))).join('<br>') || '—'}</td>`).join('')}
      <td>${totalLines(s).filter(Boolean).join(' — ')}</td>
    </tr>`).join('')
  printHtml(`${className} — student progress`, `
    <h1>${className || 'Class'} — student progress</h1>
    <p>Generated ${new Date().toLocaleDateString()}</p>
    <table><thead><tr><th>Student</th>${head}<th>XP</th></tr></thead>
    <tbody>${rows}</tbody></table>`)
}

const StudentProgressTab = ({ classId, className }) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [openStudent, setOpenStudent] = useState(null)
  const [studentFilter, setStudentFilter] = useState('')
  const scrollerRef = useRef(null)

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
  const columns = useMemo(() => gridColumns(quests), [quests])

  // A picked student who has since left the roster falls back to everyone
  // rather than an empty grid.
  const visible = useMemo(() => {
    const one = studentFilter && students.find((s) => s.student_id === studentFilter)
    return one ? [one] : students
  }, [students, studentFilter])

  const summary = useMemo(() => {
    if (!visible.length) return null
    // Measured against what each student was actually given: a student with
    // nothing assigned has not "started nothing", and one who finished their
    // two of three quests is done.
    const given = (s) => s.cells.filter(isAssigned).length
    const notStarted = visible.filter((s) => given(s) > 0 && s.quests_started === 0).length
    const allDone = visible.filter((s) => given(s) > 0 && s.quests_completed === given(s)).length
    return { notStarted, allDone }
  }, [visible])

  // Quests are in assignment order, so the newest -- the ones a teacher is
  // actually checking on -- are the rightmost columns, off-screen in any class
  // with more than a handful. Open on them. Keyed on the column set rather than
  // on every reload so that removing a quest for one student does not throw the
  // teacher back to the end of a grid they had scrolled elsewhere.
  const columnKey = quests.map((q) => q.quest_id).join(',')
  useEffect(() => {
    const el = scrollerRef.current
    if (loading || !el) return
    el.scrollLeft = el.scrollWidth
  }, [loading, columnKey])

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
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            value={studentFilter}
            onChange={(e) => setStudentFilter(e.target.value)}
            aria-label="Show one student"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-neutral-700 bg-white focus:outline-none focus:ring-2 focus:ring-optio-purple"
          >
            <option value="">All students</option>
            {students.map((s) => (
              <option key={s.student_id} value={s.student_id}>{s.name}</option>
            ))}
          </select>
          {/* Submissions is its own item in the sidebar, which is a long way
              from the page you are on when you wonder what somebody handed in
              (Gryffin, 2026-08-27: "a submissions tab should be under student
              progress. It is hard to figure out where to find that"). Linked,
              not duplicated, and pre-filtered to this class. */}
          <Link
            to={`/classes?tab=submissions&class_id=${classId}&from=progress`}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50"
          >
            <InboxIcon className="w-4 h-4" /> Review submissions
          </Link>
          <button
            onClick={() => printProgress(className, quests, visible)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50"
          >
            <PrinterIcon className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      <div ref={scrollerRef} className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-4 py-2.5 font-semibold text-neutral-700 sticky left-0 bg-white">Student</th>
              {columns.map((q) => (
                <th key={q.key} className="px-3 py-2.5 font-medium text-neutral-600 min-w-[7rem]">
                  <span className="block truncate max-w-[10rem] mx-auto" title={q.title}>{q.title}</span>
                  {q.due_date && (
                    <span className="block text-[11px] font-normal text-neutral-400">
                      due {new Date(q.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </th>
              ))}
              <th className="px-3 py-2.5 font-medium text-neutral-600 sticky right-0 bg-white shadow-[inset_1px_0_0_#e5e7eb] whitespace-nowrap">XP</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
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
                  {engagementText(s) && (
                    <span className="block text-[11px] font-normal text-neutral-400 whitespace-nowrap">
                      {engagementText(s)}
                    </span>
                  )}
                </td>
                {columns.map((col) => {
                  const cells = col.cellsFor(s)
                  return (
                    <td key={col.key} className="px-3 py-2.5 text-center">
                      {cells.length === 0 && col.own && (
                        <span className="text-xs text-neutral-300">None yet</span>
                      )}
                      {cells.map((c) => {
                        const [main, sub] = cellLines(c)
                        return (
                          <span key={c.quest_id} className="block">
                            {col.own && (
                              <span className="block text-[11px] text-neutral-600 truncate max-w-[10rem] mx-auto" title={c.title}>{c.title}</span>
                            )}
                            <span className={`inline-block px-2 py-1 rounded-md text-xs ${cellStyle(c)}`}>
                              <span className={`block whitespace-nowrap ${stateOf(c) === 'done' ? 'font-semibold' : ''}`}>{main}</span>
                              {sub && <span className="block text-[10px] opacity-75 whitespace-nowrap">{sub}</span>}
                            </span>
                          </span>
                        )
                      })}
                    </td>
                  )
                })}
                <td className="px-3 py-2.5 text-center text-neutral-600 sticky right-0 bg-white shadow-[inset_1px_0_0_#e5e7eb] whitespace-nowrap">
                  <span className="block">{totalLines(s)[0]}</span>
                  {totalLines(s)[1] && (
                    <span className="block text-[11px] text-neutral-400">{totalLines(s)[1]}</span>
                  )}
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
          onChanged={load}
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
export const StudentWorkPanel = ({ classId, student, onClose, onChanged }) => {
  const confirm = useConfirm()
  const [work, setWork] = useState(null)
  const [guardians, setGuardians] = useState([])
  const [loading, setLoading] = useState(true)
  const [reminding, setReminding] = useState(false)
  const [changing, setChanging] = useState(null) // quest_id mid add/remove
  // One task's description open at a time — the panel is a scan of what a
  // student still owes, and every description expanded would bury it.
  const [openTaskId, setOpenTaskId] = useState(null)
  const firstName = (student.name || '').split(' ')[0] || 'this student'

  const loadWork = useCallback(() => {
    setLoading(true)
    return api.get(`/api/sis/classes/${classId}/students/${student.student_id}/progress`)
      .then((r) => { setWork(r.data?.quests || []); setGuardians(r.data?.guardians || []) })
      .catch((e) => toast.error(e?.response?.data?.error || 'Could not load this student'))
      .finally(() => setLoading(false))
  }, [classId, student.student_id])

  useEffect(() => { loadWork() }, [loadWork])

  // Take a quest off this one student's plate, or give them one the class has
  // that they did not. Both go through the class quest's audience on the
  // backend, which also moves their enrollment -- and keeps any work they did.
  const removeFor = async (q) => {
    if (!(await confirm(
      `Take “${q.title}” off ${firstName}’s list?\n\n`
      + 'It stays assigned to the rest of the class. '
      + (q.started ? `${firstName} has started it, so their work stays in their account.`
        : 'Nothing they have done is deleted.')))) return
    setChanging(q.quest_id)
    try {
      const { data } = await api.delete(
        `/api/sis/classes/${classId}/quests/${q.quest_id}/students/${student.student_id}`)
      toast.success(data?.summary || `Removed for ${firstName}`)
      await loadWork()
      onChanged?.()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not remove the quest for this student')
    } finally {
      setChanging(null)
    }
  }

  const assignTo = async (q) => {
    setChanging(q.quest_id)
    try {
      const { data } = await api.post(
        `/api/sis/classes/${classId}/quests/${q.quest_id}/students/${student.student_id}`, {})
      toast.success(data?.summary || `Assigned to ${firstName}`)
      await loadWork()
      onChanged?.()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not assign the quest to this student')
    } finally {
      setChanging(null)
    }
  }

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
    (q) => isAssigned(q) && !q.completed && (!q.started || q.tasks.some((t) => !t.done)))

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between p-4 border-b border-gray-200 shrink-0">
          <div>
            <h3 className="font-semibold text-neutral-900">{student.name}</h3>
            <p className="text-sm text-neutral-500">
              {hasXp(student) ? (
                <>
                  {xpLabel(student.xp_earned, student.xp_required)}
                  <span className="text-neutral-400"> · {tasksLabel(student.tasks_done, student.tasks_total)} done</span>
                </>
              ) : `${student.tasks_done}/${student.tasks_total || 0} tasks done`}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-neutral-700">✕</button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          {loading && <p className="text-sm text-neutral-500">Loading…</p>}
          {!loading && (work || []).map((q) => (
            <div key={q.quest_id} className={isAssigned(q) ? '' : 'opacity-70'}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium text-sm text-neutral-800">
                  {q.title}
                  {/* The same ended / set-aside marks the grid cell shows
                      (ticket 8b928af0), beside the quest they are about. */}
                  {isAssigned(q) && q.completed_at && (
                    <span className="ml-2 text-[11px] font-medium text-green-700 whitespace-nowrap">
                      ✓ Ended {shortDate(q.completed_at)}
                    </span>
                  )}
                  {isAssigned(q) && !q.completed_at && q.set_aside && (
                    <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-neutral-600 whitespace-nowrap">
                      Set aside
                    </span>
                  )}
                  {isAssigned(q) && q.started && hasXp(q) && (
                    <span className="block text-xs font-normal text-neutral-500">
                      {xpLabel(q.xp_earned, q.xp_required)}{q.completed ? ' · Done' : ''}
                    </span>
                  )}
                </p>
                <span className="flex items-center gap-2 shrink-0">
                  {isAssigned(q) && q.due_date && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                      due {new Date(q.due_date).toLocaleDateString()}
                    </span>
                  )}
                  {isAssigned(q) ? (
                    <button type="button" onClick={() => removeFor(q)} disabled={changing === q.quest_id}
                      className="text-[11px] text-neutral-400 hover:text-red-600 hover:underline disabled:opacity-40"
                      title={`Take this quest off ${firstName}'s list; the rest of the class keeps it`}>
                      {changing === q.quest_id ? 'Removing…' : `Remove for ${firstName}`}
                    </button>
                  ) : (
                    <button type="button" onClick={() => assignTo(q)} disabled={changing === q.quest_id}
                      className="text-[11px] font-medium text-optio-purple hover:underline disabled:opacity-40">
                      {changing === q.quest_id ? 'Assigning…' : `Assign to ${firstName}`}
                    </button>
                  )}
                </span>
              </div>
              {!isAssigned(q) && (
                <p className="text-sm text-neutral-400 mt-0.5">Not assigned to {firstName}</p>
              )}
              {isAssigned(q) && !q.started && <p className="text-sm text-neutral-400 mt-0.5">Not started</p>}
              {isAssigned(q) && q.started && q.tasks.length === 0 && (
                <p className="text-sm text-neutral-400 mt-0.5">No tasks on this quest</p>
              )}
              <ul className="mt-1 space-y-0.5">
                {(isAssigned(q) ? q.tasks : []).map((t) => (
                  <li key={t.id} className="text-sm">
                    <div className="flex items-start gap-2">
                    <span className={t.done ? 'text-green-600' : 'text-neutral-300'}>
                      {t.done ? '✓' : '○'}
                    </span>
                    {/* A finished task links straight to its submission review
                        (Gryffin, 2026-08-28: "click on the task to see their
                        submission"). */}
                    {t.done && t.completion_id ? (
                      <Link
                        to={`/classes?tab=submissions&class_id=${classId}&completion_id=${t.completion_id}&from=progress`}
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
                    {/* What the task actually asks for, one click away. A
                        finished task's title already goes to the submission, so
                        the description gets its own control rather than
                        competing for the same tap (Nicole Connole, 2026-09-04:
                        "I would like to be able to click on the tasks and be
                        able to see the description of the task"). */}
                    {t.description && (
                      <button type="button"
                        onClick={() => setOpenTaskId(openTaskId === t.id ? null : t.id)}
                        aria-expanded={openTaskId === t.id}
                        aria-label={`What ${t.title} asks for`}
                        className="ml-auto shrink-0 text-xs text-neutral-400 hover:text-optio-purple">
                        {openTaskId === t.id ? 'Hide' : 'Details'}
                      </button>
                    )}
                    </div>
                    {openTaskId === t.id && t.description && (
                      <p className="ml-6 mt-0.5 mb-1 text-xs text-neutral-600 whitespace-pre-wrap">
                        {t.description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-200 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <span className="text-sm text-neutral-500">
            {outstanding.length
              ? `${outstanding.length} ${outstanding.length === 1 ? 'quest' : 'quests'} outstanding`
              : 'Nothing outstanding'}
          </span>
          <div className="flex items-center gap-3 flex-wrap">
            {/* A teacher who wants to ask the family whether they need help,
                in their own words, goes to their own Messages with that
                parent -- the reminder is a fixed list of what is open, this
                is a conversation (Nicole Connole, 2026-09-17). One link per
                guardian; parent only, not the student. ?to= opens or starts
                the thread (SchoolInboxPage). */}
            {guardians.map((g) => (
              <Link key={g.id} to={`/inbox?tab=mine&to=${g.id}`}
                className="text-sm font-medium text-optio-purple hover:underline">
                Message {g.name}
              </Link>
            ))}
            <button
              onClick={remind}
              disabled={reminding || !outstanding.length}
              title={`Sends ${firstName} and their parents a notification listing the quests and tasks still open. It is the same fixed list each time; to write your own words, use Message.`}
              className="px-3 py-1.5 rounded-lg bg-gradient-primary text-white text-sm disabled:opacity-40"
            >
              {reminding ? 'Sending…' : 'Send reminder'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}

export default StudentProgressTab
