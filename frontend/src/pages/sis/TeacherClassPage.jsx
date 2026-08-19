import React, { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ExclamationTriangleIcon, PrinterIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import StudentProgressTab from '../../components/sis/StudentProgressTab'
import ClassCurriculum from '../../components/discussion/ClassCurriculum'
import ClassMessagesTab from '../../components/sis/ClassMessagesTab'
import ClassCurriculumLibrary from '../../components/sis/ClassCurriculumLibrary'
import ClassQuestsManager from '../../components/sis/ClassQuestsManager'
import PersonPhoto from '../../components/sis/PersonPhoto'
import ClassRosterExportModal from '../../components/sis/ClassRosterExportModal'

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
const TAB_ALIASES = { gradebook: 'progress' }

const TeacherClassPage = () => {
  const { classId } = useParams()
  const { orgId } = useSisOrg()
  const [searchParams] = useSearchParams()
  const [cls, setCls] = useState(null)
  const [budget, setBudget] = useState(null)
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(today())
  const [marks, setMarks] = useState({})
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)  // Print / export roster modal
  // Which student's health alert is expanded. Hover-only tooltips were
  // unreadable on touch and unreliable on desktop, so the badge is a button.
  const [alertFor, setAlertFor] = useState(null)
  // Curriculum tab: the class materials list is owned here so "Your curriculum"
  // can know what's already shared and refresh the materials column after a share.
  const [classMaterials, setClassMaterials] = useState([])
  const [materialsRefresh, setMaterialsRefresh] = useState(0)
  // Deep links (e.g. the home "Message" shortcut) can preselect a tab via ?tab=.
  const requestedTab = TAB_ALIASES[searchParams.get('tab')] || searchParams.get('tab')
  const initialTab = VALID_TABS.includes(requestedTab) ? requestedTab : 'roster'
  const [tab, setTab] = useState(initialTab)

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withOrg(`/api/sis/teacher/classes/${classId}/roster`, orgId))
      .then((r) => {
        setCls(r.data?.class)
        setBudget(r.data?.supply_budget || null)
        setStudents(r.data?.students || [])
      })
      .catch((e) => toast.error(e?.response?.data?.error || 'Failed to load the roster'))
      .finally(() => setLoading(false))
  }, [orgId, classId])

  useEffect(() => { load() }, [load])

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
        <button onClick={() => setExporting(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50">
          <PrinterIcon className="w-4 h-4" /> Print / export roster
        </button>
      </div>

      {exporting && (
        <ClassRosterExportModal classId={classId} className={cls?.name} orgId={orgId}
          onClose={() => setExporting(false)} />
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 sis-no-print">
        {[['roster', 'Roster & Attendance'], ['quests', 'Quests'], ['curriculum', 'Curriculum'], ['progress', 'Student Progress'], ['messages', 'Messages']].map(([key, label]) => (
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
          <ClassCurriculumLibrary
            classId={classId}
            sharedUrls={new Set(classMaterials.map((m) => m.url))}
            onSharedToClass={() => setMaterialsRefresh((n) => n + 1)}
          />
          <ClassCurriculum
            classId={classId}
            refreshSignal={materialsRefresh}
            onMaterialsLoaded={setClassMaterials}
          />
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
          <p className="text-xs text-neutral-400 mt-1">
            {budget.students} student{budget.students === 1 ? '' : 's'}
            {budget.supply_fee_per_student > 0 && ` · $${budget.supply_fee_per_student} supply fee each`}
            {budget.allowance_per_student > 0 && ` · $${budget.allowance_per_student} each from tuition`}
            {budget.frozen
              ? ` · fixed at the roster on ${budget.as_of}`
              : ' · updates as students enroll until the first day of school'}
          </p>
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
