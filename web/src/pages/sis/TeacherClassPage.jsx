import React, { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ExclamationTriangleIcon, PrinterIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisTeacherClass } from '../../hooks/api/useSisTeacherClass'
import { useSisOrg, withOrg } from './useSisOrg'
import { getPreviewTeacher } from './teacherPreview'
import { isMasquerading } from '../../services/masqueradeService'
import StudentProgressTab from '../../components/sis/StudentProgressTab'
import ClassCurriculum from '../../components/discussion/ClassCurriculum'
import ClassMessagesTab from '../../components/sis/ClassMessagesTab'
import ClassCurriculumLibrary from '../../components/sis/ClassCurriculumLibrary'
import ClassQuestsManager from '../../components/sis/ClassQuestsManager'
import ClassActivityTab from '../../components/classes/ClassActivityTab'
import PersonPhoto from '../../components/sis/PersonPhoto'
import ClassRosterExportModal from '../../components/sis/ClassRosterExportModal'
import SubstituteSheet from '../../components/sis/SubstituteSheet'
import { statusTone } from '../../components/sis/ui/statusMaps'
import { fmtTime } from '../../utils/schedule'
import GlassTabBar from '../../components/ui/GlassTabBar'
import { RollStatus, SubstituteControl } from '../../components/sis/RollStatus'

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

// Local date, not UTC: toISOString() rolls over at 6pm Mountain, so an evening
// visit opened TOMORROW's roster -- the fix AttendancePanel got on 2026-09-02.
// It matters more now: a substitute's access is for one date (P7), and
// tomorrow's roster is one they cannot open.
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 'gradebook' stays accepted so old links and bookmarks land on the tab that
// replaced it rather than silently falling back to the roster.
//
// 'activity' is the learning app's This Week tab (components/classes/
// ClassActivityTab), mounted here as well. Arete's admin used it for Friday
// check-ins from the learning app's class page; when the school's staff were
// front-doored into this console (sis_enabled, 2026-09-10) the page she knew
// dropped out of her navigation and the tab went with it (2026-09-15: "now I
// don't see where I can locate the xp they earned that week"). Student Progress
// is not a substitute: it reads the quests assigned to the class, and a class
// used as a roster has none.
const VALID_TABS = ['roster', 'quests', 'curriculum', 'progress', 'activity', 'messages']

// The discussion board folded into Messages (its student chat, 2026-08-31);
// old ?tab=discussion links land there.
const TAB_ALIASES = { gradebook: 'progress', discussion: 'messages' }

// "Molly, Katrine and 8 others" -- first names, since the office is people
// the teacher knows; the count is the fallback when the server sent none.
const nameList = (names, n) => {
  const shown = names.slice(0, 3)
  const rest = n - shown.length
  if (!shown.length) return `${n} ${n === 1 ? 'person' : 'people'}`
  if (rest <= 0) {
    return shown.length === 1 ? shown[0]
      : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
  }
  return `${shown.join(', ')} and ${rest} other${rest === 1 ? '' : 's'}`
}

const TeacherClassPage = () => {
  const { classId } = useParams()
  const { orgId, activeOrg, isAdmin } = useSisOrg()
  const [searchParams] = useSearchParams()
  // QF-03: the class, its budget and its roster arrive together and are only
  // ever set together, so they are one query. Keyed on classId too, so moving
  // between classes no longer shows the previous roster until the next response.
  const { data: classData, isLoading: loading, refetch: load } = useSisTeacherClass(orgId, classId)
  const cls = classData?.cls ?? null
  const budget = classData?.budget ?? null
  const students = classData?.students || []
  // Covering the class today (P7): the grant is the roster, today's roll and
  // the substitute sheet. The other tabs answer "Class not found" to a
  // substitute, so they are not offered, and the date stays on today.
  const substitute = classData?.myRole === 'substitute'
  const [date, setDate] = useState(today())
  const [marks, setMarks] = useState({})
  // student_id -> the guardian's report for this class on this date, if any.
  const [planned, setPlanned] = useState({})
  // Who took this date's roll, and any substitute (P7): the class session.
  const [session, setSession] = useState(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)  // Print / export roster modal
  // One page to hand somebody covering the class — students, room, and what
  // they are working on (7effb6a2). Not an account: a sub is often not in the
  // system, and one who will be around a while goes on as an assistant teacher.
  const [subSheet, setSubSheet] = useState(false)
  const [calling, setCalling] = useState(false)
  // The call this page last sent, until it is cancelled or the page is left.
  const [call, setCall] = useState(null)
  // An admin looking at the console as a teacher is not in the room. The
  // server refuses the call under a masquerade anyway; here the button goes,
  // as every other write does in preview (iCreate, 2026-09-15, 851764d3: "I
  // accidentally hit call for help when previewing as Nicole Connole").
  const previewing = Boolean(getPreviewTeacher()) || isMasquerading()

  // Deliberately no confirm dialog: somebody who needs a person in the room
  // should not have to answer a question first. The toast names WHO was
  // reached -- a count alone left the caller with "NO idea where that call
  // even went" (851764d3) -- and an accidental tap can be cancelled.
  const callForHelp = async () => {
    setCalling(true)
    try {
      const { data } = await api.post(`/api/sis/classes/${classId}/call-for-help`, {})
      const names = Array.isArray(data?.names) ? data.names : []
      const n = data?.notified || names.length
      if (n && data?.call_id) setCall({ id: data.call_id })
      toast.success(n
        ? `Called ${nameList(names, n)} in the front office`
        : 'Nobody in the front office to call — tell the office directly')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not send that')
    } finally { setCalling(false) }
  }

  // "It'd be nice to retract a call for help if you accidentally push it!"
  // (iCreate, 2026-09-15, b25bfa75). The same people are told it is off.
  const cancelCall = async () => {
    if (!call?.id) return
    setCalling(true)
    try {
      await api.post(`/api/sis/classes/${classId}/call-for-help/${call.id}/cancel`, {})
      setCall(null)
      toast.success('Cancelled. The front office has been told.')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not cancel that')
    } finally { setCalling(false) }
  }
  // Which student's health alert is expanded. Hover-only tooltips were
  // unreadable on touch and unreliable on desktop, so the badge is a button.
  const [alertFor, setAlertFor] = useState(null)
  // Deep links (e.g. the home "Message" shortcut) can preselect a tab via ?tab=.
  const requestedTab = TAB_ALIASES[searchParams.get('tab')] || searchParams.get('tab')
  const initialTab = VALID_TABS.includes(requestedTab) ? requestedTab : 'roster'
  const [chosenTab, setTab] = useState(initialTab)
  const tab = substitute ? 'roster' : chosenTab



  useEffect(() => {
    if (!orgId || !date) return
    api.get(withOrg(`/api/sis/classes/${classId}/attendance?date=${date}`, orgId))
      .then((r) => {
        const existing = {}
        const reported = {}
        for (const row of r.data?.roster || []) {
          if (row.status) existing[row.student_user_id] = row.status
          if (row.planned_absence) reported[row.student_user_id] = row.planned_absence
        }
        setMarks(existing)
        setPlanned(reported)
        setSession(r.data?.session || null)
      })
      .catch(() => { setMarks({}); setPlanned({}); setSession(null) })
  }, [orgId, classId, date])

  // Everyone is present by default — the teacher only taps the exceptions
  // (absent/late/excused). A student a guardian reported out defaults to
  // excused instead: iCreate, 831acc63, "is that then reflected in every class
  // for the day so the teachers don't have to figure it out?" This page did not
  // read the report at all, so untouched roll saved the child present. Any
  // status already recorded loads into `marks` and wins over either default.
  const markOf = (id) => marks[id] || (planned[id] ? 'excused' : 'present')

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
      const { data } = await api.post(`/api/sis/classes/${classId}/attendance`, {
        organization_id: orgId, date, entries,
      })
      if (data?.session) setSession(data.session)
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/classes?tab=mine" className="text-sm text-optio-purple hover:underline">← My classes</Link>
          <h1 className="text-2xl font-bold text-neutral-900">{cls?.name || 'Class'}</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* A hand raised from the room. iCreate, 2026-08-25 (9d0618f8): "it
              would be super helpful to have a Campus Coordinator 'call
              button'... when a teacher needed help in the class." It rings the
              front office's bell and pushes to their phone — the surface they
              already watch — rather than adding one they would have to learn. */}
          {!previewing && (call ? (
            <button onClick={cancelCall} disabled={calling}
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-neutral-700 hover:bg-gray-50 disabled:opacity-50">
              {calling ? 'Cancelling…' : 'Cancel call for help'}
            </button>
          ) : (
            <button onClick={callForHelp} disabled={calling}
              className="px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50">
              {calling ? 'Calling…' : 'Call for help'}
            </button>
          ))}
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

      {/* Order is iCreate's (2026-08-24): the three every teacher needs first,
          then the ones only some classes use. */}
      <GlassTabBar
        align="start" size="md" className="mb-6" aria-label="Class sections"
        tabs={(substitute
          ? [['roster', 'Roster & Attendance']]
          : [['roster', 'Roster & Attendance'], ['messages', 'Messages'], ['curriculum', 'Curriculum'], ['quests', 'Quests'], ['progress', 'Student Progress'], ['activity', 'This Week']])
          .map(([id, label]) => ({ id, label }))}
        active={tab} onSelect={setTab}
      />

      {tab === 'quests' && (
        // Release dates are gated by the org's scheduled_publish flag, read
        // from the org in view rather than the caller's own -- a superadmin
        // looking at a school's class has no org of their own.
        <ClassQuestsManager classId={classId} orgId={orgId}
          scheduledEnabled={Boolean(activeOrg?.feature_flags?.scheduled_publish)}
          canSaveToCurriculum={Boolean(isAdmin)} />
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

      {tab === 'activity' && (
        // Everything the roster finished in a Saturday-to-Friday week, from
        // any quest. Same component and endpoint as the learning app's tab.
        <ClassActivityTab orgId={orgId} classId={classId} className={cls?.name} />
      )}

      {tab === 'messages' && (
        <ClassMessagesTab classId={classId} orgId={orgId} className={cls?.name} />
      )}

      {/* Materials budget — a ceiling, never a target. The wording matters:
          "up to" is what the school asked for, so teachers don't read it as
          money they're expected to spend. */}
      {budget && budget.total > 0 && tab === 'roster' && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 mb-6">
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
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap items-center gap-3">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              disabled={substitute} title={substitute ? 'You are covering this class today' : undefined}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
              aria-label="Attendance date" />
            <button onClick={markAllPresent} className="text-sm text-optio-purple hover:underline">Reset</button>
            <RollStatus session={session} className="text-sm" />
            {/* The office marks a substitute here too, not only from the
                dashboard -- the class page is where they notice the gap. */}
            {isAdmin && !previewing && (
              <span className="ml-auto">
                <SubstituteControl classId={classId} date={date} orgId={orgId}
                  session={session} onSaved={(s) => s && setSession(s)} />
              </span>
            )}
          </div>

          {!students.length && <p className="text-neutral-500">No students enrolled yet.</p>}

          {students.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                Everyone is present by default, and students a parent reported out start as excused. Tap only the rest.
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
                        {planned[s.student_id] && (
                          <span className="block text-xs text-amber-700"
                            title={planned[s.student_id].reason || 'Reported by a guardian'}>
                            Parent reported out{planned[s.student_id].scope === 'day' ? ' (all day)' : ''}
                          </span>
                        )}
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
                              markOf(s.student_id) === st ? statusTone('attendance', st, 'solid') : 'bg-gray-100 text-neutral-500 hover:bg-gray-200'}`}>
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
                  className="px-4 py-2 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
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
