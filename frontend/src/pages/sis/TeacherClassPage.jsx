import React, { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ExclamationTriangleIcon, PrinterIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisTeacherClass } from '../../hooks/api/useSisTeacherClass'
import { useSisOrg, withOrg } from './useSisOrg'
import StudentProgressTab from '../../components/sis/StudentProgressTab'
import ClassCurriculum from '../../components/discussion/ClassCurriculum'
import ClassMessagesTab from '../../components/sis/ClassMessagesTab'
import ClassCurriculumLibrary from '../../components/sis/ClassCurriculumLibrary'
import ClassQuestsManager from '../../components/sis/ClassQuestsManager'
import PersonPhoto from '../../components/sis/PersonPhoto'
import ClassRosterExportModal from '../../components/sis/ClassRosterExportModal'
import SubstituteSheet from '../../components/sis/SubstituteSheet'

/**
 * TeacherClassPage — one class for its teacher: the roster (photos, ages,
 * guardian contacts, allergy/medical alerts) and quick-entry attendance.
 * The roster comes from the access-logged /teacher/classes/:id/roster
 * endpoint; attendance reuses the existing class attendance API.
 *
 * Printing and CSV go through ClassRosterExportModal, the same component the
 * admin Classes page uses. This page used to print itself behind a subtractive
 * stylesheet (hide the sidebar, hide the controls, hope nothing else shows) —
 * which printed whatever tab happened to be open and no roster at all
 * (iCreate, 2026-08-19: "Print Roster button on this page prints the page, not
 * the actual roster"). The modal hides everything and then shows one table, so
 * what prints does not depend on what else is on screen.
 */

const ATT_STATUSES = ['present', 'absent', 'late', 'excused']
const ATT_COLORS = {
  present: 'bg-green-600 text-white',
  absent: 'bg-red-600 text-white',
  late: 'bg-amber-500 text-white',
  excused: 'bg-blue-600 text-white',
}

const today = () => new Date().toISOString().slice(0, 10)

// 'gradebook' stays accepted so old links and bookmarks land on the tab that
// replaced it rather than silently falling back to the roster.
const VALID_TABS = ['roster', 'quests', 'curriculum', 'progress', 'messages']

// "Next" is only useful with a room and a time on it — the point is a teacher
// pointing a student down the right hallway (iCreate, 2026-08-25).
const fmtTime = (hhmm) => {
  if (!hhmm) return ''
  const [h, m] = String(hhmm).split(':').map(Number)
  if (Number.isNaN(h)) return ''
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
}

// The discussion board folded into Messages (its student chat, 2026-08-31);
// old ?tab=discussion links land there.
const TAB_ALIASES = { gradebook: 'progress', discussion: 'messages' }

const TeacherClassPage = () => {
  const { classId } = useParams()
  const { orgId } = useSisOrg()
  const [searchParams] = useSearchParams()
  // QF-03: the class, its budget and its roster arrive together and are only
  // ever set together, so they are one query. Keyed on classId too, so moving
  // between classes no longer shows the previous roster until the next response.
  const { data: classData, isLoading: loading, refetch: load } = useSisTeacherClass(orgId, classId)
  const cls = classData?.cls ?? null
  const budget = classData?.budget ?? null
  const students = classData?.students || []
  const [date, setDate] = useState(today())
  const [marks, setMarks] = useState({})
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)  // Print / export roster modal
  // One page to hand somebody covering the class — students, room, and what
  // they are working on (7effb6a2). Not an account: a sub is often not in the
  // system, and one who will be around a while goes on as an assistant teacher.
  const [subSheet, setSubSheet] = useState(false)
  const [calling, setCalling] = useState(false)

  // Deliberately no confirm dialog: somebody who needs a person in the room
  // should not have to answer a question first. The toast names how many were
  // reached, so an accidental tap is visible and can be waved off in person.
  const callForHelp = async () => {
    setCalling(true)
    try {
      const { data } = await api.post(`/api/sis/classes/${classId}/call-for-help`, {})
      const n = data?.notified || 0
      toast.success(n
        ? `Called ${n} ${n === 1 ? 'person' : 'people'} in the front office`
        : 'Nobody in the front office to call — tell the office directly')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not send that')
    } finally { setCalling(false) }
  }
  // Which student's health alert is expanded. Hover-only tooltips were
  // unreadable on touch and unreliable on desktop, so the badge is a button.
  const [alertFor, setAlertFor] = useState(null)
  // Deep links (e.g. the home "Message" shortcut) can preselect a tab via ?tab=.
  const requestedTab = TAB_ALIASES[searchParams.get('tab')] || searchParams.get('tab')
  const initialTab = VALID_TABS.includes(requestedTab) ? requestedTab : 'roster'
  const [tab, setTab] = useState(initialTab)



  useEffect(() => {
    if (!orgId || !date) return
    api.get(withOrg(`/api/sis/classes/${classId}/attendance?date=${date}`, orgId))
      .then((r) => {
        const existing = {}
        for (const row of r.data?.roster || []) {
          if (row.status) existing[row.student_user_id] = row.status
        }
        setMarks(existing)
      })
      .catch(() => setMarks({}))
  }, [orgId, classId, date])

  // Everyone is present by default — the teacher only taps the exceptions
  // (absent/late/excused). Any status an admin already set (e.g. an excusal)
  // loads into `marks` and wins over the default.
  const markOf = (id) => marks[id] || 'present'

  const saveAttendance = async () => {
    // Record the WHOLE roster so "attendance was taken" is explicit — untouched
    // students save as present.
    const entries = students.map((s) => ({ student_user_id: s.student_id, status: markOf(s.student_id) }))
    if (!entries.length) {
      toast.error('No students to record')
      return
    }
    setSaving(true)
    try {
      await api.post(`/api/sis/classes/${classId}/attendance`, {
        organization_id: orgId, date, entries,
      })
      toast.success('Attendance saved')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save attendance')
    } finally {
      setSaving(false)
    }
  }

  // Reset any exceptions back to all-present.
  const markAllPresent = () => setMarks({})

  if (loading) return <p className="text-neutral-500">Loading…</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-6 sis-no-print">
        <div>
          <Link to="/my-classes" className="text-sm text-optio-purple hover:underline">← My Classes</Link>
          <h1 className="text-2xl font-bold text-neutral-900">{cls?.name || 'Class'}</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* A hand raised from the room. iCreate, 2026-08-25 (9d0618f8): "it
              would be super helpful to have a Campus Coordinator 'call
              button'... when a teacher needed help in the class." It rings the
              front office's bell and pushes to their phone — the surface they
              already watch — rather than adding one they would have to learn. */}
          <button onClick={callForHelp} disabled={calling}
            className="px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50">
            {calling ? 'Calling…' : 'Call for help'}
          </button>
          <button onClick={() => setSubSheet(true)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50">
            Substitute sheet
          </button>
          <button onClick={() => setExporting(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50">
            <PrinterIcon className="w-4 h-4" /> Print / export roster
          </button>
        </div>
      </div>

      {exporting && (
        <ClassRosterExportModal classId={classId} className={cls?.name} orgId={orgId}
          onClose={() => setExporting(false)} />
      )}

      {subSheet && (
        <SubstituteSheet classId={classId} cls={cls} students={students} orgId={orgId}
          onClose={() => setSubSheet(false)} />
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 sis-no-print">
        {/* Order is iCreate's (2026-08-24): the three every teacher needs first,
            then the two only some classes use. */}
        {[['roster', 'Roster & Attendance'], ['messages', 'Messages'], ['curriculum', 'Curriculum'], ['quests', 'Quests'], ['progress', 'Student Progress']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-optio-purple text-optio-purple'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'quests' && (
        <ClassQuestsManager classId={classId} />
      )}

      {tab === 'curriculum' && (
        // Two columns on wide screens (stack on narrow): staff-only curriculum on
        // one side, the materials shared with students on the other — different
        // audiences, side by side so the split reads at a glance.
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <ClassCurriculumLibrary classId={classId} />
          <ClassCurriculum classId={classId} />
        </div>
      )}

      {tab === 'progress' && (
        <StudentProgressTab classId={classId} className={cls?.name} />
      )}

      {tab === 'messages' && (
        <ClassMessagesTab classId={classId} orgId={orgId} className={cls?.name} />
      )}

      {/* Materials budget — a ceiling, never a target. The wording matters:
          "up to" is what the school asked for, so teachers don't read it as
          money they're expected to spend. */}
      {budget && budget.total > 0 && tab === 'roster' && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 mb-6 sis-no-print">
          <p className="text-sm text-neutral-600">
            Supply budget: spend <span className="font-semibold text-neutral-900">up to ${budget.total.toLocaleString()}</span> on
            materials for this class this year.
          </p>
          {/* What is left, and what it went on. The ceiling on its own could
              not answer "can I buy this?" — every supply request and
              reimbursement filed against this class now counts against it
              (805cb3a3, 2026-09-01). Committed, not spent: a request filed on
              Tuesday is money already intended. */}
          {budget.committed > 0 && (
            <p className="text-sm mt-1">
              <span className={budget.remaining < 0 ? 'font-semibold text-red-600' : 'font-semibold text-neutral-900'}>
                ${budget.remaining.toLocaleString()}
              </span>
              <span className="text-neutral-600">
                {budget.remaining < 0 ? ' over' : ' left'} — ${budget.committed.toLocaleString()} requested
                {budget.spent < budget.committed && `, $${budget.spent.toLocaleString()} of it settled`}
              </span>
            </p>
          )}
          <p className="text-xs text-neutral-400 mt-1">
            {budget.students} student{budget.students === 1 ? '' : 's'}
            {budget.supply_fee_per_student > 0 && ` · $${budget.supply_fee_per_student} supply fee each`}
            {budget.allowance_per_student > 0 && ` · $${budget.allowance_per_student} each from tuition`}
            {budget.frozen
              ? ` · fixed at the roster on ${budget.as_of}`
              : ' · updates as students enroll until the first day of school'}
          </p>
          {(budget.transactions || []).length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-neutral-500 hover:text-optio-purple">
                {budget.transactions.length} request{budget.transactions.length === 1 ? '' : 's'} against this budget
              </summary>
              <ul className="mt-1.5 space-y-1">
                {budget.transactions.map((t) => (
                  <li key={t.id} className="text-xs flex items-baseline gap-2">
                    <span className="text-neutral-700">{t.title}</span>
                    <span className="text-neutral-500">
                      {t.amount != null ? `$${t.amount.toLocaleString()}` : 'no amount'}
                    </span>
                    <span className="text-neutral-400">
                      {t.status === 'resolved' ? 'settled' : 'pending'}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {tab === 'roster' && (() => {
        const count = (st) => students.filter((s) => markOf(s.student_id) === st).length
        const present = count('present'); const absent = count('absent')
        const late = count('late'); const excused = count('excused')
        // Card background by status — mirrors the admin /attendance page.
        const CARD = {
          present: 'border-gray-200 bg-white hover:border-neutral-300',
          absent: 'border-red-300 bg-red-50',
          late: 'border-amber-300 bg-amber-50',
          excused: 'border-blue-300 bg-blue-50',
        }
        return (<>
          {/* Controls — same shell as the admin attendance page */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap items-center gap-3 sis-no-print">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
              aria-label="Attendance date" />
            <button onClick={markAllPresent} className="text-sm text-optio-purple hover:underline">Reset to all present</button>
          </div>

          {!students.length && <p className="text-neutral-500 sis-no-print">No students enrolled yet.</p>}

          {students.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden sis-no-print">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
                <div className="text-sm text-neutral-600">
                  <span className="font-semibold text-neutral-900">{cls?.name}</span>
                  {' · '}{present} present
                  {absent ? <> · <span className="text-red-600 font-medium">{absent} absent</span></> : null}
                  {late ? ` · ${late} late` : ''}
                  {excused ? ` · ${excused} excused` : ''}
                </div>
              </div>

              <p className="px-4 pt-3 text-xs text-neutral-400">
                Everyone is present by default — tap only the students who are absent, late, or excused.
              </p>

              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {students.map((s) => (
                  <div key={s.student_id} className={`rounded-lg border px-3 py-3 transition-colors ${CARD[markOf(s.student_id)]}`}>
                    <div className="flex items-center justify-between gap-2">
                      {/* Photo first — the teacher's ask was to recognise the
                          class, and a name alone doesn't do that. Tap to enlarge. */}
                      <PersonPhoto src={s.avatar_url} name={s.name} size="w-10 h-10" textSize="text-xs" />
                      <span className="min-w-0 mr-auto">
                        <span className="block text-sm font-medium text-neutral-800 truncate">
                          {s.name}
                          {s.age != null && <span className="ml-1.5 text-xs font-normal text-neutral-400">age {s.age}</span>}
                        </span>
                        {s.next_class && (
                          <span className="block text-xs text-neutral-500 truncate">
                            Next: {s.next_class.name}
                            {s.next_class.location ? ` · ${s.next_class.location}` : ''}
                            {s.next_class.start_time ? ` · ${fmtTime(s.next_class.start_time)}` : ''}
                          </span>
                        )}
                        {s.has_alert && (
                          <HealthAlert student={s}
                            open={alertFor === s.student_id}
                            onToggle={() => setAlertFor(alertFor === s.student_id ? null : s.student_id)} />
                        )}
                      </span>
                      <div className="flex gap-1 shrink-0">
                        {ATT_STATUSES.map((st) => (
                          <button key={st}
                            onClick={() => setMarks((prev) => ({ ...prev, [s.student_id]: st }))}
                            className={`px-2 py-1 rounded-md text-[11px] font-semibold capitalize transition-colors ${
                              markOf(s.student_id) === st ? ATT_COLORS[st] : 'bg-gray-100 text-neutral-500 hover:bg-gray-200'}`}>
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
                <span className="text-xs text-neutral-400">Untouched students are saved as present. You can edit and re-save anytime.</span>
                <button onClick={saveAttendance} disabled={saving}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save attendance'}
                </button>
              </div>
            </div>
          )}
        </>)
      })()}
    </div>
  )
}

/**
 * A student's health alert on the roster: a badge that opens the detail on
 * click. It used to be a `title` tooltip, which never appears on a tablet — the
 * device teachers actually take attendance on — and is easy to miss with a
 * mouse. The detail is rendered inline (spans, not divs: the badge lives inside
 * a span) so it also survives the print stylesheet.
 */
const HealthAlert = ({ student, open, onToggle }) => (
  <>
    <button type="button" onClick={onToggle} aria-expanded={open}
      className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-semibold text-red-700 hover:text-red-800 hover:underline">
      <ExclamationTriangleIcon className="w-3.5 h-3.5" /> Alert
      <span className="text-red-400">{open ? '▾' : '▸'}</span>
    </button>
    {open && (
      <span className="block mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] leading-snug text-red-900">
        {student.allergies && <span className="block"><strong>Allergies:</strong> {student.allergies}</span>}
        {student.medications && <span className="block"><strong>Medical:</strong> {student.medications}</span>}
      </span>
    )}
  </>
)

export default TeacherClassPage
