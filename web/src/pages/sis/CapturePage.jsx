import React, { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { INPUT_CLASS } from '../../components/ui/Input'
import CaptureSheet, { wrapFiles } from '../../components/sis/studentWork/CaptureSheet'
import { useRefreshStudentWork, useStudentWork, useStudentWorkList } from '../../hooks/api/useStudentWork'
import { useSisOrg } from './useSisOrg'

/**
 * Capture work -- a teacher walks the room with a phone: tap a student, tap a
 * task, the camera opens, save (ticket 77637c3a, Apogee Cache Valley: "our
 * chromebooks do not have the ability to take pictures and one kiosk for 30
 * kids is going to be challenging").
 *
 * The same API as the Students page (routes/sis/student_work.py), so the same
 * gate: any staff member, any current student of the school. Built for a phone
 * first; it works the same on a laptop, where the camera button opens the file
 * picker.
 */

// The sidebar's camera (SisSidebar ICONS.camera).
const CameraIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2)
  .map((w) => w[0].toUpperCase()).join('')

const Avatar = ({ student, size = 'h-12 w-12' }) => (
  student.avatar_url
    ? <img src={student.avatar_url} alt="" className={`${size} rounded-full object-cover bg-gray-100`} />
    : <span aria-hidden="true"
        className={`${size} rounded-full bg-optio-purple/10 text-optio-purple font-semibold flex items-center justify-center`}>
        {initials(student.name)}
      </span>
)

const Roster = ({ orgId, onPick }) => {
  const { data: students = [], isLoading, isError } = useStudentWorkList(orgId)
  const [search, setSearch] = useState('')
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter((s) => !q || (s.name || '').toLowerCase().includes(q))
  }, [students, search])

  if (isLoading) return <p className="text-neutral-500">Loading…</p>
  if (isError) return <p className="text-red-700 text-sm" role="alert">Could not load your students.</p>
  if (!students.length) return <p className="text-neutral-500">No students yet.</p>
  return (
    <>
      <input className={INPUT_CLASS} value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search students" aria-label="Search students" />
      <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {shown.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s)}
              className="w-full min-h-[96px] flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white p-3 text-center hover:border-optio-purple transition-colors">
              <Avatar student={s} />
              <span className="text-sm font-medium text-neutral-900 break-words">{s.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {!shown.length && <p className="mt-3 text-sm text-neutral-500">Nobody matches &quot;{search.trim()}&quot;.</p>}
    </>
  )
}

const ProgressBar = ({ done, total }) => (
  <div className="h-1.5 w-full rounded-full bg-gray-100" aria-hidden="true">
    <div className="h-1.5 rounded-full bg-optio-purple" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
  </div>
)

const StudentTasks = ({ orgId, student, onBack }) => {
  const { data, isLoading, isError } = useStudentWork(orgId, student.id)
  const refresh = useRefreshStudentWork(orgId, student.id)
  const [sheet, setSheet] = useState(null)       // {task, files}
  const [showDone, setShowDone] = useState(false)
  const cameraRef = useRef(null)
  const pendingTask = useRef(null)

  // Tapping a task IS the gesture that opens the camera: the browser only
  // lets a click open it, so the input is clicked in the same handler.
  const shoot = (task) => {
    pendingTask.current = task
    cameraRef.current?.click()
  }

  const onShot = (e) => {
    const files = wrapFiles(e.target.files)
    e.target.value = ''
    if (files.length && pendingTask.current) setSheet({ task: pendingTask.current, files })
  }

  const quests = (data?.quests || []).filter((q) => !q.completed_at && !q.set_aside)

  return (
    <div>
      <button type="button" onClick={onBack} className="text-sm font-medium text-optio-purple hover:underline mb-3">
        &larr; All students
      </button>
      <div className="flex items-center gap-3 mb-4">
        <Avatar student={student} />
        <h2 className="text-xl font-semibold text-neutral-900">{student.name}</h2>
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={onShot} aria-label="Take a photo" data-testid="camera-input" />

      {isLoading && <p className="text-neutral-500">Loading…</p>}
      {isError && <p className="text-red-700 text-sm" role="alert">Could not load this student.</p>}
      {data && !quests.length && (
        <p className="text-neutral-500">{student.name.split(' ')[0]} has no quests in progress.</p>
      )}

      <div className="space-y-3">
        {quests.map((q) => {
          const open = q.tasks.filter((t) => !t.done)
          const tasks = showDone ? q.tasks : open
          return (
            <section key={q.quest_id} className="rounded-xl border border-gray-200 bg-white p-4" aria-label={q.title}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-semibold text-neutral-900">{q.title}</h3>
                <span className="text-xs text-neutral-500 whitespace-nowrap">
                  {`${q.tasks_done} of ${q.tasks_total} done`}
                </span>
              </div>
              <div className="mt-2"><ProgressBar done={q.tasks_done} total={q.tasks_total} /></div>
              <ul className="mt-3 divide-y divide-gray-100">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <button type="button" onClick={() => shoot(t)}
                      className="flex-1 min-h-[52px] flex items-center gap-3 py-2 text-left">
                      <span aria-hidden="true"
                        className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center ${
                          t.done ? 'bg-green-50 text-green-600' : 'bg-optio-purple/10 text-optio-purple'}`}>
                        {t.done ? '✓' : <CameraIcon />}
                      </span>
                      <span className={`text-sm ${t.done ? 'text-neutral-500' : 'text-neutral-900'}`}>
                        <span className="sr-only">{t.done ? 'Done: ' : 'Take a photo for '}</span>
                        {t.title}
                      </span>
                    </button>
                    <button type="button" onClick={() => setSheet({ task: t, files: [] })}
                      className="shrink-0 px-2 py-2 text-xs font-medium text-neutral-500 hover:text-optio-purple">
                      Note or upload
                    </button>
                  </li>
                ))}
                {!tasks.length && <li className="py-2 text-sm text-neutral-500">Every task is done.</li>}
              </ul>
            </section>
          )
        })}
      </div>

      {quests.some((q) => q.tasks_done) && (
        <button type="button" onClick={() => setShowDone(!showDone)}
          className="mt-3 text-sm text-neutral-500 hover:text-optio-purple">
          {showDone ? 'Hide done tasks' : 'Show done tasks'}
        </button>
      )}

      {sheet && (
        <CaptureSheet orgId={orgId} student={student} task={sheet.task} initialFiles={sheet.files}
          onCancel={() => setSheet(null)}
          onSaved={async () => { setSheet(null); await refresh() }} />
      )}
    </div>
  )
}

export default function CapturePage() {
  const { orgId } = useSisOrg()
  const [params, setParams] = useSearchParams()
  const [student, setStudent] = useState(null)

  // ?student=<id> survives a reload mid-class; the name comes from the list.
  const { data: students = [] } = useStudentWorkList(orgId)
  const current = student || students.find((s) => s.id === params.get('student')) || null

  const pick = (s) => {
    setStudent(s)
    const next = new URLSearchParams(params)
    if (s) next.set('student', s.id)
    else next.delete('student')
    setParams(next, { replace: true })
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-neutral-900">Capture work</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Tap a student, then a task, and take a photo of their work. It goes on their task, and you can mark it done.
        </p>
      </div>
      {current
        ? <StudentTasks key={current.id} orgId={orgId} student={current} onBack={() => pick(null)} />
        : <Roster orgId={orgId} onPick={pick} />}
    </div>
  )
}
