import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { Squares2X2Icon, TableCellsIcon, ArrowPathIcon, ArrowDownTrayIcon, EyeIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { ModalOverlay } from '../../components/ui'
import { useOrganization } from '../../contexts/OrganizationContext'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import CreateClassModal from '../../components/sis/CreateClassModal'
import CourseEnrollmentManager from '../../components/admin/CourseEnrollmentManager'
import SearchSelect from '../../components/ui/SearchSelect'
import ParentClassPreview from '../../components/schedule/ClassDetailsModal'
import ScheduleAiEditor from '../../components/sis/ScheduleAiEditor'
import ScheduleSyncModal from '../../components/sis/ScheduleSyncModal'
import ClassesTable from '../../components/sis/ClassesTable'
import ClassesExportModal from '../../components/sis/ClassesExportModal'
import ClassRosterExportModal from '../../components/sis/ClassRosterExportModal'
import CoursePreviewModal from '../../components/course/CoursePreviewModal'
import { fmt12ap } from '../../components/sis/classFields'
import { useConfirm } from '../../contexts/ConfirmContext'
import { useAuth } from '../../contexts/AuthContext'
import { canSeeFinance, isSisAdmin } from './sisRole'

// What Optio charges a school per student to enroll in an Optio course. Optio
// invoices the school directly for each enrollment — there is no in-app billing.
const OPTIO_COURSE_FEE = '$50'

const hhmm = (t) => (t ? String(t).slice(0, 5) : '')

// "HH:MM" + minutes -> "HH:MM:00" for the meetings API.
const endTime = (start, minutes) => {
  if (!start || !minutes) return null
  const [h, m] = hhmm(start).split(':').map(Number)
  const total = h * 60 + m + Number(minutes)
  const eh = Math.floor((total % (24 * 60)) / 60)
  const em = total % 60
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`
}

// College/dual-credit course codes like "HIST 1301" — excluded from the catalog.
const COURSE_CODE_RE = /^[A-Za-z]{2,8}\s\d{3,4}\b/
// Optio courses a partner can enroll families into: published, public, project-based
// enrichment (not the org's own, not credit-bearing, not a college course code).
const isSelectableCourse = (course, orgId) =>
  course.status === 'published' &&
  course.visibility === 'public' &&
  course.organization_id !== orgId &&
  !course.credit_subject &&
  !COURSE_CODE_RE.test((course.title || '').trim())

// One teacher double-booking as a sentence, for the warning banner and the
// post-save toast. Rows come from GET /api/sis/teacher-conflicts.
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const conflictText = (c) => {
  const when = c.start_time && c.end_time
    ? `both meet ${c.day_of_week != null ? `${DOW_FULL[c.day_of_week]}s ` : ''}${fmt12ap(c.start_time)}–${fmt12ap(c.end_time)}`
    : 'meet at the same time'
  return `${c.teacher_name} is double-booked: ${c.class_a} and ${c.class_b} ${when}.`
}

const Chip = ({ children, className = '' }) => (
  <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 shadow-sm ${className}`}>{children}</span>
)

// Quest descriptions are stored as HTML; render them as plain text here.
const stripHtml = (html) => {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent || ''
}

const ClassesPage = () => {
  const confirm = useConfirm()
  const { user } = useAuth()
  const isAdmin = isSisAdmin(user)
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const { organization } = useOrganization()
  const orgName = organization?.name || orgs.find((o) => o.id === orgId)?.name || 'Org'
  const [classes, setClasses] = useState([])
  const [courses, setCourses] = useState([])
  const [staff, setStaff] = useState([])
  const [courseSettings, setCourseSettings] = useState({}) // course_id -> {teacher}
  const [courseTuition, setCourseTuition] = useState(null)  // org-wide tuition (cents) for all Optio courses
  const [loading, setLoading] = useState(true)
  const [teacherConflicts, setTeacherConflicts] = useState([]) // advisory double-booking rows
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)     // class being edited
  const [editTab, setEditTab] = useState('details') // which tab the class modal opens on
  const [settingsCourse, setSettingsCourse] = useState(null) // course open in the detail modal (settings/enroll/enrollments tabs)
  const [viewingCourse, setViewingCourse] = useState(null)   // course open in the student view (review / demo to students)
  const [searchParams, setSearchParams] = useSearchParams()
  // Two top-level tabs: the org's own classes, and the Optio course catalog they
  // can enroll students into. Uses the ?tab= URL pattern (like the People page)
  // so a tab is linkable; the default (org classes) omits the param.
  const tab = searchParams.get('tab') === 'courses' ? 'courses' : 'classes'
  const setTab = (key) => {
    const next = new URLSearchParams(searchParams)
    if (key === 'courses') next.set('tab', 'courses')
    else next.delete('tab')
    setSearchParams(next, { replace: true })
  }
  const [search, setSearch] = useState('')
  const [timeBlocks, setTimeBlocks] = useState([]) // school-day periods (Settings)
  const [rooms, setRooms] = useState([]) // classrooms & activity spaces (Settings)
  const [showSync, setShowSync] = useState(false)  // sync-from-sheet modal
  const [showArchived, setShowArchived] = useState(false) // include archived classes
  // "Open all N closed" used to be the only mention of those N classes anywhere
  // on the page, so it asked staff to bulk-publish a set they could not see.
  const [closedOnly, setClosedOnly] = useState(false)
  // cards | table — table is the spreadsheet view of the org's classes.
  const [view, setViewState] = useState(() => {
    try { return localStorage.getItem('sis_classes_view') || 'table' } catch { return 'table' }
  })
  const setView = (v) => {
    setViewState(v)
    try { localStorage.setItem('sis_classes_view', v) } catch { /* ignore */ }
  }

  // silent=true refreshes data without the full-page loading state, so an
  // inline edit doesn't unmount the table and jump the scroll back to the top.
  const load = useCallback((silent = false) => {
    if (!orgId) { setLoading(false); return }
    if (!silent) setLoading(true)
    Promise.all([
      api.get(withOrg(`/api/sis/classes${showArchived ? '?include_archived=true' : ''}`, orgId)),
      api.get('/api/courses?filter=all').catch(() => ({ data: {} })),
      // Both are ADMIN_ROLES-gated, and this page is open to teachers too. The
      // .catch kept the page working but every teacher who opened /classes
      // still fired two guaranteed 403s (Sentry OPTIO-WEB-4/5). Neither answer
      // is used outside the admin-only editor, so teachers simply don't ask.
      isAdmin
        ? api.get(withOrg('/api/sis/staff', orgId)).catch(() => ({ data: {} }))
        : Promise.resolve({ data: {} }),
      isAdmin
        ? api.get(withOrg('/api/sis/course-settings', orgId)).catch(() => ({ data: {} }))
        : Promise.resolve({ data: {} }),
      // Rooms + school-day blocks. Deliberately NOT /api/admin/organizations/:id:
      // that endpoint is org_admin-gated, so a campus coordinator got a 403 here
      // and the editor silently degraded to a free-text classroom box and raw
      // time inputs — a bug only they could see, since a masquerading superadmin
      // is authorized as themselves.
      api.get(withOrg('/api/sis/schedule-settings', orgId)).catch(() => ({ data: {} })),
      api.get(withOrg('/api/sis/teacher-conflicts', orgId)).catch(() => ({ data: {} })),
    ])
      .then(([cls, crs, stf, ct, sched, tc]) => {
        setClasses(cls.data?.classes || [])
        setTeacherConflicts(tc.data?.conflicts || [])
        const all = crs.data?.courses || []
        setCourses(all.filter((c) => isSelectableCourse(c, orgId)))
        setStaff(stf.data?.staff || [])
        const map = {}
        for (const row of ct.data?.course_settings || []) map[row.course_id] = row
        setCourseSettings(map)
        setCourseTuition(ct.data?.optio_course_tuition_cents ?? null)
        setTimeBlocks(sched.data?.time_blocks || [])
        setRooms(sched.data?.rooms || [])
      })
      .catch(() => toast.error('Failed to load catalog'))
      .finally(() => setLoading(false))
  }, [orgId, showArchived, isAdmin])

  useEffect(() => { load() }, [load])

  // ── Class write paths ───────────────────────────────────────────────────────
  const syncMeetings = async (classId, dow, startTime, durationMin, existing = []) => {
    for (const m of existing) {
      await api.delete(`/api/sis/classes/${classId}/meetings/${m.id}?organization_id=${orgId}`)
    }
    const end = endTime(startTime, durationMin)
    if (!dow?.length || !startTime || !end) return
    for (const day of dow) {
      await api.post(`/api/sis/classes/${classId}/meetings`, {
        day_of_week: day, start_time: startTime, end_time: end, organization_id: orgId,
      })
    }
  }

  // The cross-check iCreate asked for: after any save that can touch a teacher
  // or a schedule, warn right away if that class's teacher is now booked into
  // two classes that meet at the same time. Advisory only — the save already
  // went through, and a failed check must never break it.
  const warnIfTeacherDoubleBooked = async (classId) => {
    try {
      const r = await api.get(withOrg('/api/sis/teacher-conflicts', orgId))
      const conflicts = r.data?.conflicts || []
      setTeacherConflicts(conflicts)
      const hit = conflicts.find((x) => x.class_a_id === classId || x.class_b_id === classId)
      if (hit) toast(conflictText(hit), { icon: '⚠️', duration: 10000 })
    } catch { /* advisory only */ }
  }

  const classBody = (payload) => ({
    name: payload.name,
    description: payload.description,
    location: payload.location ?? null,
    primary_instructor_id: payload.primary_instructor_id ?? null,
    capacity: payload.capacity ?? null,
    price_cents: payload.price_cents ?? null,
    supply_fee: payload.supply_fee ?? null,
    supply_budget_per_student: payload.supply_budget_per_student ?? null,
    min_age: payload.min_age ?? null,
    max_age: payload.max_age ?? null,
    // Assistants are sent only when the editor that produced this payload
    // actually edits them. They were omitted entirely until 2026-08-06, so the
    // picker in the class editor looked like it worked and then dropped the
    // assistant on save — which is why iCreate reported not being able to find
    // the feature at all. Spread rather than `?? null`: an editor that doesn't
    // offer the field must leave a class's assistants alone, not wipe them.
    ...(payload.assistant_instructor_ids !== undefined
      ? { assistant_instructor_ids: payload.assistant_instructor_ids } : {}),
    ...(payload.show_assistants !== undefined ? { show_assistants: payload.show_assistants } : {}),
    ...(payload.is_visible_to_parents !== undefined ? { is_visible_to_parents: payload.is_visible_to_parents } : {}),
    ...(payload.internal_notes !== undefined ? { internal_notes: payload.internal_notes } : {}),
    ...(payload.registration_status ? { registration_status: payload.registration_status } : {}),
    ...(payload.requires_full_day !== undefined ? { requires_full_day: payload.requires_full_day } : {}),
    organization_id: orgId,
  })

  const uploadImage = async (classId, imageFile) => {
    const form = new FormData()
    form.append('file', imageFile)
    await api.post(`/api/sis/classes/${classId}/image?organization_id=${orgId}`, form)
  }

  const handleCreate = async (payload, imageFile) => {
    try {
      const r = await api.post('/api/sis/classes', classBody(payload))
      const id = r.data?.class?.id
      if (id) {
        await syncMeetings(id, payload.days_of_week, payload.start_time, payload.duration_minutes)
        if (imageFile) await uploadImage(id, imageFile)
      }
      toast.success('Class created')
      setCreating(false)
      load()
      if (id) warnIfTeacherDoubleBooked(id)
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not create class')
    }
  }

  // Shared save path for the card editor and the table's inline rows.
  const saveClass = async (cls, payload, imageFile = null) => {
    try {
      await api.patch(`/api/sis/classes/${cls.id}`, classBody(payload))
      await syncMeetings(cls.id, payload.days_of_week, payload.start_time, payload.duration_minutes, cls.meetings || [])
      if (imageFile) await uploadImage(cls.id, imageFile)
      toast.success('Class updated')
      load(true)  // silent — keep the table mounted so scroll position is preserved
      warnIfTeacherDoubleBooked(cls.id)
      return true
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not update class')
      return false
    }
  }

  const handleUpdate = async (payload, imageFile) => {
    const cls = classes.find((c) => c.id === editing.id) || editing
    const ok = await saveClass(cls, payload, imageFile)
    if (ok) setEditing(null)
  }

  // Copy a class into a new "(copy)" draft — same details, meetings, and pricing,
  // registration left closed so it isn't published before staff review it.
  const duplicateClass = async (c) => {
    try {
      const body = {
        name: `${c.name} (copy)`,
        description: c.description,
        location: c.location ?? null,
        primary_instructor_id: c.primary_instructor_id ?? null,
        assistant_instructor_ids: c.assistant_instructor_ids ?? [],
        show_assistants: c.show_assistants !== false,
        is_visible_to_parents: c.is_visible_to_parents !== false,
        capacity: c.capacity ?? null,
        price_cents: c.price_cents ?? null,
        supply_fee: c.supply_fee ?? null,
        supply_budget_per_student: c.supply_budget_per_student ?? null,
        min_age: c.min_age ?? null,
        max_age: c.max_age ?? null,
        requires_full_day: c.requires_full_day ?? false,
        internal_notes: c.internal_notes ?? null,
        registration_status: 'closed',
        organization_id: orgId,
      }
      const r = await api.post('/api/sis/classes', body)
      const id = r.data?.class?.id
      // Recreate its meeting times on the copy.
      for (const m of (c.meetings || [])) {
        if (!id || m.day_of_week == null || !m.start_time || !m.end_time) continue
        await api.post(`/api/sis/classes/${id}/meetings`, {
          day_of_week: m.day_of_week, start_time: m.start_time, end_time: m.end_time, organization_id: orgId,
        })
      }
      toast.success('Class duplicated — review and open registration when ready')
      load(true)
      // A copy shares the original's teacher and times, so it usually IS a
      // double-booking until the schedule is edited — say so up front.
      if (id) warnIfTeacherDoubleBooked(id)
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not duplicate class')
    }
  }

  const openRoster = (c) => { setEditTab('roster'); setEditing(c) }
  const openEditor = (c) => { setEditTab('details'); setEditing(c) }

  // CSV export moved to ClassesExportModal: same client-side build from the
  // already-loaded rows, but with a column picker and schedule-grid formats
  // (iCreate asked to choose what the spreadsheet looks like).
  const [exporting, setExporting] = useState(false)

  const archiveClass = async (c) => {
    if (!(await confirm(`Archive "${c.name}"? It will no longer accept registrations.`))) return
    try {
      await api.delete(`/api/sis/classes/${c.id}?organization_id=${orgId}`)
      toast.success('Class archived')
      setEditing(null)
      load()
    } catch { toast.error('Could not archive class') }
  }

  const restoreClass = async (c) => {
    try {
      await api.post(`/api/sis/classes/${c.id}/restore?organization_id=${orgId}`, {})
      toast.success('Class restored')
      setEditing(null)
      load()
    } catch { toast.error('Could not restore class') }
  }

  // Optimistic: flip the row in place so the expanded row / open modal stays
  // put — a full load() would blank the page and collapse where you were.
  const toggleRegistration = async (cls) => {
    const next = cls.registration_status === 'open' ? 'closed' : 'open'
    setClasses((cs) => cs.map((c) => (c.id === cls.id ? { ...c, registration_status: next } : c)))
    try {
      await api.patch(`/api/sis/classes/${cls.id}`, { registration_status: next, organization_id: orgId })
    } catch {
      setClasses((cs) => cs.map((c) => (c.id === cls.id ? { ...c, registration_status: cls.registration_status } : c)))
      toast.error('Could not update registration')
    }
  }

  // Offer the open seat to the next waiting student, straight from a class row —
  // no need to open the class and switch to the Waitlist tab. Only surfaced on
  // rows with an open seat AND someone actually waiting (see ClassesTable).
  const offerNextSeat = async (c) => {
    try {
      const r = await api.post(`/api/sis/classes/${c.id}/waitlist/offer-next`, { organization_id: orgId })
      // Name who — an unnamed "next student" left the office with no record of
      // who had been offered the seat (iCreate, 2026-08-17).
      if (r.data?.entry) toast.success(`Seat offered to ${r.data.entry.student_name || 'the next student'}`)
      // Nobody to offer to: the API says why (usually "they already have an
      // offer out"), which beats a bare "No one waiting" next to a row that
      // reads Waitlist 1.
      else toast(r.data?.message || 'No one is waiting for this class', { icon: 'ℹ️' })
      load(true)  // silent — refresh the counts without collapsing the table
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not offer seat')
    }
  }

  // Every non-archived class that isn't open is invisible to families in the
  // Schedule Builder — new classes default to closed, which is easy to miss.
  const isClosed = (c) => c.registration_status !== 'open' && c.status !== 'archived'
  const closedClasses = classes.filter(isClosed)
  const openAll = async () => {
    if (!(await confirm(`Open registration for all ${closedClasses.length} closed class${closedClasses.length === 1 ? '' : 'es'}? Families will see them in the Schedule Builder immediately.`))) return
    try {
      await Promise.all(closedClasses.map((c) =>
        api.patch(`/api/sis/classes/${c.id}`, { registration_status: 'open', organization_id: orgId })))
      toast.success('Registration opened for all classes')
    } catch {
      toast.error('Could not open some classes — check the list')
    }
    // Nothing is closed any more, so leaving the filter on would show an empty
    // page and read as "the classes are gone".
    setClosedOnly(false)
    load()
  }

  // Map staff by ID for quick teacher name resolution during search and rendering
  const staffMap = useMemo(() => {
    const map = {}
    for (const s of staff || []) {
      if (s.id) map[s.id] = s
    }
    return map
  }, [staff])

  const classMatchesSearch = useCallback((c, query) => {
    if (!query) return true
    const q = query.trim().toLowerCase()
    if (!q) return true

    // Check class name
    if ((c.name || '').toLowerCase().includes(q)) return true

    // Check primary instructor
    const primaryName = c.primary_instructor?.name || c.primary_instructor?.display_name
    if (primaryName && primaryName.toLowerCase().includes(q)) return true

    if (c.primary_instructor_id && staffMap[c.primary_instructor_id]) {
      const s = staffMap[c.primary_instructor_id]
      const sName = s.name || s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim()
      if (sName.toLowerCase().includes(q)) return true
    }

    // Check assistant instructors
    if (Array.isArray(c.assistant_instructors)) {
      for (const a of c.assistant_instructors) {
        const aName = a.name || a.display_name
        if (aName && aName.toLowerCase().includes(q)) return true
      }
    }

    if (Array.isArray(c.assistant_instructor_ids)) {
      for (const aid of c.assistant_instructor_ids) {
        const s = staffMap[aid]
        if (s) {
          const sName = s.name || s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim()
          if (sName.toLowerCase().includes(q)) return true
        }
      }
    }

    return false
  }, [staffMap])

  const courseMatchesSearch = useCallback((c, query) => {
    if (!query) return true
    const q = query.trim().toLowerCase()
    if (!q) return true

    // Check course title
    if ((c.title || '').toLowerCase().includes(q)) return true

    // Check course teacher setting
    const cs = courseSettings[c.id]
    if (cs) {
      const teacherName = cs.teacher?.name || cs.teacher?.display_name || cs.teacher_name
      if (teacherName && teacherName.toLowerCase().includes(q)) return true

      const tid = cs.teacher?.id || cs.teacher_id
      if (tid && staffMap[tid]) {
        const s = staffMap[tid]
        const sName = s.name || s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim()
        if (sName.toLowerCase().includes(q)) return true
      }
    }

    // Direct instructor/teacher on course object
    const directTeacher = c.primary_instructor?.name || c.primary_instructor?.display_name || c.teacher?.name
    if (directTeacher && directTeacher.toLowerCase().includes(q)) return true

    return false
  }, [courseSettings, staffMap])

  // ── Tab-scoped, searched catalog ─────────────────────────────────────────────
  const items = useMemo(() => {
    if (tab === 'courses') {
      return courses
        .filter((c) => courseMatchesSearch(c, search))
        .map((c) => ({ kind: 'course', _name: c.title, ...c }))
    }
    return classes
      .filter((c) => classMatchesSearch(c, search))
      .filter((c) => !closedOnly || isClosed(c))
      .map((c) => ({ kind: 'class', _name: c.name, ...c }))
  }, [classes, courses, tab, search, closedOnly, classMatchesSearch, courseMatchesSearch])

  // Table view is the org's classes only (Optio courses aren't org-editable).
  const tableClasses = useMemo(() => {
    return classes
      .filter((c) => classMatchesSearch(c, search))
      .filter((c) => !closedOnly || isClosed(c))
  }, [classes, search, closedOnly, classMatchesSearch])

  const TABS = [
    { key: 'classes', label: `${orgName} classes`, count: classes.length },
    { key: 'courses', label: 'Optio courses', count: courses.length },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-neutral-900">Classes</h1>
        <div className="flex items-center gap-3">
          <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
          {tab === 'classes' && (
            <Button size="sm" onClick={() => setCreating(true)} disabled={!orgId}>Create class</Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-5 border-b border-gray-200 mb-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-1 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tab === t.key ? 'border-optio-purple text-optio-purple' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {tab === 'classes' && (
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white">
            <button onClick={() => setView('cards')} title="Card view" aria-pressed={view === 'cards'}
              className={`px-2.5 py-1.5 rounded-md transition-colors ${view === 'cards' ? 'bg-optio-purple text-white' : 'text-neutral-500 hover:bg-neutral-50'}`}>
              <Squares2X2Icon className="w-4 h-4" />
            </button>
            <button onClick={() => setView('table')} title="Table view" aria-pressed={view === 'table'}
              className={`px-2.5 py-1.5 rounded-md transition-colors ${view === 'table' ? 'bg-optio-purple text-white' : 'text-neutral-500 hover:bg-neutral-50'}`}>
              <TableCellsIcon className="w-4 h-4" />
            </button>
          </div>
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="flex-1 min-w-[160px] max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
        />
        {tab === 'classes' && (
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`text-sm px-3 py-2 rounded-lg border transition-colors ${
              showArchived ? 'border-optio-purple text-optio-purple bg-optio-purple/5' : 'border-gray-200 text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            {showArchived ? 'Showing archived' : 'Show archived'}
          </button>
        )}
        {tab === 'classes' && orgId && <ScheduleAiEditor orgId={orgId} onApplied={load} />}
        {tab === 'classes' && orgId && (
          <button onClick={() => setShowSync(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-optio-purple/40 text-optio-purple text-sm font-medium hover:bg-optio-purple/5 transition-colors">
            <ArrowPathIcon className="w-4 h-4" />
            Sync from Sheet
          </button>
        )}
        {tab === 'classes' && orgId && classes.length > 0 && (
          <button onClick={() => setExporting(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-neutral-600 text-sm font-medium hover:bg-neutral-50 transition-colors">
            <ArrowDownTrayIcon className="w-4 h-4" />
            Export CSV
          </button>
        )}
        {tab === 'classes' && orgId && !loading && closedClasses.length > 0 && (
          <div className="inline-flex rounded-lg border border-amber-400 overflow-hidden">
            <button onClick={() => setClosedOnly((v) => !v)}
              aria-pressed={closedOnly}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                closedOnly ? 'bg-amber-100 text-amber-900' : 'text-amber-700 hover:bg-amber-50'
              }`}
              title="Show only the classes whose registration is closed">
              {closedOnly ? 'Showing' : 'Show'} {closedClasses.length} closed
            </button>
            <button onClick={openAll}
              className="px-3 py-2 text-sm font-medium text-amber-700 border-l border-amber-400 hover:bg-amber-50 transition-colors"
              title="Open registration for every class marked Closed">
              Open all
            </button>
          </div>
        )}
        {closedOnly && (
          <button onClick={() => setClosedOnly(false)}
            className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800 underline">
            Clear filter
          </button>
        )}
      </div>

      {/* Teacher double-booking cross-check — advisory, so an intentional save
          still goes through; this just makes sure nobody finds out on the day. */}
      {tab === 'classes' && teacherConflicts.length > 0 && (
        <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold mb-1">
            Teacher double-booked
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            {teacherConflicts.map((c) => (
              <li key={`${c.teacher_id}-${c.class_a_id}-${c.class_b_id}`}>{conflictText(c)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Optio-course billing notice — Optio invoices the school per enrollment */}
      {tab === 'courses' && (
        <div className="mb-5 rounded-lg bg-optio-purple/5 border border-optio-purple/20 px-4 py-3 text-sm text-neutral-700">
          Enrolling a student in an Optio course costs{' '}
          <span className="font-semibold text-neutral-900">{OPTIO_COURSE_FEE} per student</span>.
          Optio invoices the school for each enrollment when the student is added.
        </div>
      )}

      {showSync && orgId && (
        <ScheduleSyncModal orgId={orgId} onClose={() => setShowSync(false)} onApplied={load} />
      )}

      {exporting && (
        <ClassesExportModal classes={classes} orgName={orgName} seesMoney={canSeeFinance(user)}
          onClose={() => setExporting(false)} />
      )}

      {loading && <p className="text-neutral-500">Loading…</p>}

      {/* Empty state (courses tab, or classes tab in card view) */}
      {!loading && !items.length && (tab === 'courses' || view === 'cards') && (
        <p className="text-neutral-500">
          {closedOnly
            ? 'Every class has registration open.'
            : search
            ? 'Nothing matches your search.'
            : tab === 'courses'
              ? 'No Optio courses are available to enroll in yet.'
              : 'Nothing here yet. Create a class to get started.'}
        </p>
      )}

      {/* Classes — table view */}
      {!loading && tab === 'classes' && view === 'table' && (
        <ClassesTable
          classes={tableClasses}
          staff={staff}
          timeBlocks={timeBlocks}
          rooms={rooms}
          onSave={saveClass}
          onToggleRegistration={toggleRegistration}
          onOpen={openEditor}
          onRoster={openRoster}
          onDuplicate={duplicateClass}
          onArchive={archiveClass}
          onRestore={restoreClass}
          onOfferSeat={offerNextSeat}
        />
      )}

      {/* Cards — classes (card view) or the Optio course catalog */}
      {!loading && (tab === 'courses' || view === 'cards') && items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => (
            item.kind === 'class' ? (
              <ClassCard
                key={`class-${item.id}`}
                c={item}
                onOpen={() => setEditing(item)}
              />
            ) : (
              <CourseCard
                key={`course-${item.id}`}
                c={item}
                onOpen={() => setSettingsCourse(item)}
                onView={() => setViewingCourse(item)}
              />
            )
          ))}
        </div>
      )}

      {creating && (
        <CreateClassModal staff={staff} timeBlocks={timeBlocks} rooms={rooms} onClose={() => setCreating(false)} onSubmit={handleCreate} />
      )}
      {editing && (
        <ClassDetailModal
          cls={classes.find((c) => c.id === editing.id) || editing}
          staff={staff}
          timeBlocks={timeBlocks}
          rooms={rooms}
          orgId={orgId}
          initialTab={editTab}
          onClose={() => setEditing(null)}
          onSubmit={handleUpdate}
          onToggleRegistration={toggleRegistration}
          onArchive={() => archiveClass(classes.find((c) => c.id === editing.id) || editing)}
          onRestore={() => restoreClass(classes.find((c) => c.id === editing.id) || editing)}
          onRosterChanged={() => load(true)}
        />
      )}
      {viewingCourse && (
        <CoursePreviewModal courseId={viewingCourse.id} onClose={() => setViewingCourse(null)} />
      )}
      {settingsCourse && (
        <CourseDetailModal
          course={settingsCourse}
          staff={staff}
          current={courseSettings[settingsCourse.id]}
          tuitionCents={courseTuition}
          orgId={orgId}
          isSuperadmin={isSuperadmin}
          onClose={() => setSettingsCourse(null)}
          onSaved={() => { setSettingsCourse(null); load() }}
        />
      )}
    </div>
  )
}

const ClassCard = ({ c, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col text-left hover:border-optio-purple/50 hover:shadow-md transition-all"
  >
    <div className="relative h-40 w-full bg-gradient-to-br from-optio-purple/10 to-optio-pink/10">
      {c.image_url ? (
        <img src={c.image_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-optio-purple/30">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
          </svg>
        </div>
      )}
      <span className="absolute top-2 right-2"><Chip className="bg-white/90 text-optio-purple">Class</Chip></span>
      {c.is_full && <span className="absolute top-2 left-2"><Chip className="bg-red-500 text-white">Full</Chip></span>}
    </div>

    <div className="p-4">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-neutral-900">{c.name}</h3>
        {c.registration_status !== 'open' && c.status !== 'archived' && (
          <Chip className="bg-amber-100 text-amber-700">Closed</Chip>
        )}
      </div>
      {c.description && <p className="text-sm text-neutral-500 mt-1 line-clamp-3">{c.description}</p>}
    </div>
  </button>
)

// The card body opens the course's SIS settings/enrollments; "View" opens the
// course in the real student view so staff can review it or demo it.
const CourseCard = ({ c, onOpen, onView }) => (
  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col hover:border-optio-purple/50 hover:shadow-md transition-all">
    <button type="button" onClick={onOpen} className="text-left flex-1">
      <div className="relative h-40 w-full bg-gradient-to-br from-optio-pink/10 to-optio-purple/10">
        {c.cover_image_url ? (
          <img src={c.cover_image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-optio-pink/30">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        )}
        <span className="absolute top-2 right-2"><Chip className="bg-white/90 text-optio-pink">Course</Chip></span>
      </div>

      <div className="px-4 pt-4">
        <h3 className="font-semibold text-neutral-900">{c.title}</h3>
        {c.description && <p className="text-sm text-neutral-500 mt-1 line-clamp-3">{c.description}</p>}
        <p className="mt-2 text-xs font-medium text-optio-purple">{OPTIO_COURSE_FEE} per student · billed to the school</p>
      </div>
    </button>

    <div className="px-4 pb-4 pt-3">
      <button
        type="button"
        onClick={onView}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-optio-purple/10 text-optio-purple text-sm font-medium hover:bg-optio-purple/20 transition-colors min-h-[44px]"
      >
        <EyeIcon className="w-5 h-5" />
        View
      </button>
    </div>
  </div>
)

const COURSE_TABS = [
  { key: 'details', label: 'Details' },
  { key: 'manage', label: 'Enrollments' },
]

// Tuition is intentionally not shown here: SIS staff manage the teacher and
// rosters; the price surfaces in the parent-facing schedule builder instead.
// "View as student" opens the course in the real student view (CourseHomepage),
// so staff can review it or demo it without enrolling themselves.
const CourseDetailModal = ({ course, staff, current, orgId, isSuperadmin, onClose, onSaved }) => {
  const [tab, setTab] = useState('details')
  const [teacherId, setTeacherId] = useState(current?.teacher?.id || '')
  const [saving, setSaving] = useState(false)
  const [quests, setQuests] = useState([])
  const [viewingAsStudent, setViewingAsStudent] = useState(false)

  // Courses are built from Projects (quests) — list what's inside.
  useEffect(() => {
    api.get(`/api/courses/${course.id}/quests`)
      .then((r) => setQuests((r.data?.quests || []).filter((q) => q.is_published !== false)))
      .catch(() => setQuests([]))
  }, [course.id])

  const dirty = (teacherId || '') !== (current?.teacher?.id || '')

  const save = async () => {
    setSaving(true)
    try {
      await api.put(`/api/sis/courses/${course.id}/settings`, {
        teacher_id: teacherId || null,
        organization_id: orgId,
      })
      toast.success('Course updated')
      onSaved()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not update course')
    } finally {
      setSaving(false)
    }
  }

  if (viewingAsStudent) {
    return <CoursePreviewModal courseId={course.id} onClose={() => setViewingAsStudent(false)} />
  }

  return (
    <ModalOverlay onClose={onClose}>
      {/* one fixed size for every tab — wide enough for the enrollment tables */}
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {course.cover_image_url && (
          <img src={course.cover_image_url} alt="" className="w-full h-36 object-cover shrink-0" />
        )}
        <div className="flex items-center justify-between px-4 pt-4 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">{course.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="flex gap-4 px-4 mt-2 border-b border-gray-200 shrink-0">
          {COURSE_TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`pb-2.5 px-1 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-optio-purple text-optio-purple' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {tab === 'details' && (
            <div className="space-y-4">
              {course.description && <p className="text-sm text-neutral-600">{course.description}</p>}

              <div className="pt-3 border-t border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
                <SearchSelect
                  value={teacherId}
                  onChange={setTeacherId}
                  options={staff}
                  getId={(s) => s.id}
                  getLabel={(s) => s.name}
                  placeholder="Search staff…"
                />
              </div>

              {quests.length > 0 && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-sm font-medium text-gray-700 mb-2">Projects in this course</p>
                  <ol className="space-y-2">
                    {quests.map((q, i) => (
                      <li key={q.id || i} className="flex gap-3 text-sm">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-optio-purple/10 text-optio-purple text-[11px] font-bold flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-neutral-800">{q.title}</p>
                          {q.description && <p className="text-neutral-500 line-clamp-2">{stripHtml(q.description)}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}

          {tab === 'manage' && (
            <div className="space-y-3">
              <div className="rounded-lg bg-optio-purple/5 border border-optio-purple/20 px-3 py-2 text-xs text-neutral-700">
                Each student you enroll adds a <span className="font-semibold text-neutral-900">{OPTIO_COURSE_FEE}</span> charge that Optio invoices to the school.
              </div>
              <CourseEnrollmentManager embedded courseId={course.id} courseName={course.title}
                orgId={orgId} isSuperadmin={isSuperadmin} />
            </div>
          )}
        </div>

        {tab === 'details' && (
          <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 shrink-0">
            <button
              onClick={() => setViewingAsStudent(true)}
              className="mr-auto px-4 py-2 text-sm font-medium text-optio-purple border border-optio-purple/30 rounded-lg hover:bg-optio-purple/5 transition-colors"
            >
              View as student
            </button>
            <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm">
              Close
            </button>
            <Button size="sm" onClick={save} disabled={saving || !dirty}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}
      </div>
    </ModalOverlay>
  )
}

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-neutral-400">{label}</dt>
    <dd className="text-neutral-700 text-right">{value}</dd>
  </div>
)

const CLASS_TABS = [
  { key: 'details', label: 'Details' },
  { key: 'roster', label: 'Roster' },
  { key: 'waitlist', label: 'Waitlist' },
]

// Same shell as CourseDetailModal, but a class is org-owned so every field is
// editable (the embedded CreateClassModal form), plus registration + archive.
// "Preview" renders the exact read-only modal parents and students see in the
// Schedule Builder.
const ClassDetailModal = ({ cls, staff, timeBlocks = [], rooms = [], orgId, initialTab = 'details', onClose, onSubmit, onToggleRegistration, onArchive, onRestore, onRosterChanged }) => {
  const [tab, setTab] = useState(initialTab)
  const [previewing, setPreviewing] = useState(false)
  const isOpen = cls.registration_status === 'open'
  const isArchived = cls.status === 'archived'

  if (previewing) {
    return (
      <ParentClassPreview
        item={cls}
        type="class"
        locked
        onClose={() => setPreviewing(false)}
      />
    )
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">{cls.name}</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => setPreviewing(true)}
              className="text-sm font-medium text-optio-purple hover:underline">
              Preview
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
        </div>
        <div className="flex gap-4 px-4 mt-2 border-b border-gray-200 shrink-0">
          {CLASS_TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`pb-2.5 px-1 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-optio-purple text-optio-purple' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {tab === 'details' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
                <div className="text-sm text-neutral-700">
                  <span className="font-medium">{cls.enrolled_count ?? 0}</span>
                  {cls.capacity != null ? ` / ${cls.capacity}` : ''} enrolled
                  {' · '}Registration <span className={isOpen ? 'text-green-600 font-medium' : 'text-neutral-400'}>{isOpen ? 'open' : 'closed'}</span>
                </div>
                <button
                  type="button" role="switch" aria-checked={isOpen} aria-label="Toggle registration"
                  onClick={() => onToggleRegistration(cls)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${isOpen ? 'bg-green-500' : 'bg-neutral-300'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${isOpen ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <CreateClassModal embedded initial={cls} staff={staff} timeBlocks={timeBlocks} rooms={rooms} onClose={onClose} onSubmit={onSubmit} />

              <div className="pt-1">
                {isArchived ? (
                  <button onClick={onRestore} className="text-sm font-medium text-optio-purple hover:underline">Restore class</button>
                ) : (
                  <button onClick={onArchive} className="text-sm text-red-500 hover:underline">Archive class</button>
                )}
              </div>
            </div>
          )}

          {tab === 'roster' && <ClassRoster classId={cls.id} className={cls.name} orgId={orgId} onChanged={onRosterChanged} />}
          {tab === 'waitlist' && <ClassWaitlist classId={cls.id} orgId={orgId} cls={cls} onChanged={onRosterChanged} />}
        </div>
      </div>
    </ModalOverlay>
  )
}

// Enrolled students for the class (sorted by last name).
//
// Two things the office asked to do from HERE rather than by going and finding
// the family first (iCreate, 2026-08-17): add a student to the class, and move
// one to another section of the same class. Moving is deliberately limited to
// sibling sections — the same class at a different time, which is what "she is
// in the wrong one" nearly always means, and the only move that cannot change
// what the family is charged.
// onChanged refreshes the parent's class list. Without it the roster panel's own
// count moved but the "X / Y enrolled" column, the Full chip and spots_left kept
// their stale values until the page was reopened (iCreate, 2026-08-26: "it
// doesn't update the enrolled number ... on a bunch of classes").
const ClassRoster = ({ classId, className, orgId, onChanged }) => {
  const confirm = useConfirm()
  const [roster, setRoster] = useState(null)
  const [dropping, setDropping] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [people, setPeople] = useState([])
  const [adding, setAdding] = useState('')        // student id chosen in the picker
  const [busy, setBusy] = useState(false)
  const [sections, setSections] = useState([])
  const [movingId, setMovingId] = useState(null)  // whose section picker is open

  const reload = useCallback(() => {
    api.get(withOrg(`/api/sis/classes/${classId}/enrollments`, orgId))
      .then((r) => setRoster(r.data?.roster || []))
      .catch(() => { toast.error('Failed to load the roster'); setRoster([]) })
  }, [classId, orgId])
  useEffect(() => { reload() }, [reload])

  // The org's students, for the add picker, and the other sections with room.
  useEffect(() => {
    api.get(withOrg('/api/sis/roster', orgId))
      .then((r) => setPeople((r.data?.roster || []).filter((p) => p.is_student)))
      .catch(() => setPeople([]))
    api.get(withOrg(`/api/sis/classes/${classId}/sibling-sections`, orgId))
      .then((r) => setSections(r.data?.sections || []))
      .catch(() => setSections([]))
  }, [classId, orgId])

  const drop = async (s) => {
    if (!(await confirm(`Drop ${s.name} from this class?`))) return
    setDropping(s.student_id)
    try {
      await api.delete(withOrg(`/api/sis/classes/${classId}/enrollments/${s.student_id}`, orgId))
      toast.success(`Dropped ${s.name}`)
      reload()
      onChanged?.()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not drop the student') }
    finally { setDropping(null) }
  }

  // Enrolling someone still waiting for a place AT THE SCHOOL comes back as a
  // 409, exactly as it does from the student's own page, and is confirmed
  // before forcing.
  const add = async (force = false) => {
    if (!adding) return
    setBusy(true)
    try {
      const r = await api.post(`/api/sis/classes/${classId}/enrollments`,
        { organization_id: orgId, student_user_id: adding, force })
      toast.success(r.data?.already_enrolled ? 'Already on this roster' : 'Added to the class')
      setAdding('')
      reload()
      onChanged?.()
    } catch (e) {
      if (e?.response?.status === 409 && e.response.data?.enrollment_waitlisted) {
        setBusy(false)
        if (await confirm(`${e.response.data.error}\n\nAdd them anyway?`)) return add(true)
        return
      }
      toast.error(e?.response?.data?.error || 'Could not add the student')
    } finally { setBusy(false) }
  }

  // Into the new section first, out of this one second: a failure halfway
  // through must leave them somewhere, and a student in two sections for a
  // moment is a smaller problem than a student in none.
  const move = async (s, section) => {
    setMovingId(null)
    setDropping(s.student_id)
    try {
      // force: they already hold a seat in a section of this very class, so the
      // school-waitlist question has been answered.
      await api.post(`/api/sis/classes/${section.class_id}/enrollments`,
        { organization_id: orgId, student_user_id: s.student_id, force: true })
      await api.delete(withOrg(`/api/sis/classes/${classId}/enrollments/${s.student_id}`, orgId))
      toast.success(`Moved ${s.name} to ${section.name}`)
      reload()
      onChanged?.()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not move the student')
    } finally { setDropping(null) }
  }

  const enrolledIds = new Set((roster || []).map((s) => s.student_id))
  const addable = people.filter((p) => !enrolledIds.has(p.student_id))

  const addRow = (
    <div className="flex items-end gap-2 mb-3">
      <div className="flex-1 min-w-0">
        <label className="block text-xs text-neutral-500 mb-1" htmlFor={`add-${classId}`}>Add a student</label>
        <SearchSelect
          value={adding}
          onChange={setAdding}
          options={addable}
          getId={(p) => p.student_id}
          getLabel={(p) => (p.age != null ? `${p.name} (age ${p.age})` : p.name)}
          placeholder="Search students…"
        />
      </div>
      <Button size="sm" disabled={!adding || busy} onClick={() => add()}>
        {busy ? 'Adding…' : 'Add'}
      </Button>
    </div>
  )

  if (roster === null) return <p className="text-sm text-neutral-400">Loading…</p>
  if (!roster.length) {
    return (
      <div>
        {addRow}
        <p className="text-sm text-neutral-400">No students enrolled yet.</p>
      </div>
    )
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs text-neutral-400">{roster.length} enrolled</p>
        {/* Sign-in sheets, contact lists, allergy lists — see the modal. */}
        <Button size="sm" variant="outline" onClick={() => setExporting(true)}>
          Print / Export
        </Button>
      </div>
      {addRow}
      {exporting && (
        <ClassRosterExportModal classId={classId} className={className} orgId={orgId}
          onClose={() => setExporting(false)} />
      )}
      <ul className="divide-y divide-gray-100">
        {roster.map((s) => (
          <li key={s.student_id} className="py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-neutral-800">
                {s.name}
                {s.age != null && <span className="ml-1.5 text-xs font-normal text-neutral-400">age {s.age}</span>}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-neutral-400 truncate max-w-[10rem]">{s.email || s.username || ''}</span>
                {sections.length > 0 && (
                  <Button size="sm" variant="outline" disabled={dropping === s.student_id}
                    onClick={() => setMovingId(movingId === s.student_id ? null : s.student_id)}>
                    Move
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={dropping === s.student_id} onClick={() => drop(s)}>
                  {dropping === s.student_id ? '…' : 'Drop'}
                </Button>
              </div>
            </div>
            {movingId === s.student_id && (
              <div className="mt-2 rounded-lg bg-gray-50 border border-gray-100 p-2">
                <p className="text-xs text-neutral-500 mb-1">Other sections with room:</p>
                <div className="flex flex-wrap gap-2">
                  {sections.map((sec) => (
                    <button key={sec.class_id} type="button" onClick={() => move(s, sec)}
                      className="px-2 py-1 rounded-lg border border-gray-300 text-xs text-neutral-700 hover:bg-white">
                      {sec.name}
                      {sec.spots_left != null && (
                        <span className="ml-1 text-neutral-400">{sec.spots_left} left</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Status label + tone for a waitlist row. 'expired' is deliberately not a dead
// end any more — staff can re-offer it or admit the student outright.
const WAITLIST_STATUS = {
  waiting: { label: 'Waiting', tone: 'text-neutral-400' },
  offered: { label: 'Offered', tone: 'text-green-600' },
  expired: { label: 'Offer expired', tone: 'text-amber-600' },
  declined: { label: 'Declined', tone: 'text-neutral-400' },
  promoted: { label: 'Enrolled', tone: 'text-neutral-400' },
}

const offerExpiryText = (e) => {
  if (e.status !== 'offered' || !e.offer_expires_at) return null
  const ms = new Date(e.offer_expires_at) - Date.now()
  if (Number.isNaN(ms)) return null
  if (ms <= 0) return 'offer lapsed'
  const days = Math.floor(ms / 86400000)
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`
  const hours = Math.max(1, Math.round(ms / 3600000))
  return `${hours} hour${hours === 1 ? '' : 's'} left`
}

const ClassWaitlist = ({ classId, orgId, cls, onChanged }) => {
  const confirm = useConfirm()
  const [entries, setEntries] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(null)
  // Other sections of the same class that still have room. Nine students sat on
  // one Ukelele Jam section's waitlist while two others had seats — the seat
  // they want exists, just at another time (iCreate, 2026-07-31).
  const [sections, setSections] = useState([])
  const [movingId, setMovingId] = useState(null)   // entry whose section picker is open
  const [people, setPeople] = useState([])         // org students, for the add picker
  const [adding, setAdding] = useState('')
  const [addBusy, setAddBusy] = useState(false)

  const reload = useCallback(() => {
    api.get(`/api/sis/classes/${classId}/waitlist?organization_id=${orgId}`)
      .then((r) => setEntries(r.data?.waitlist || []))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [classId, orgId])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    api.get(withOrg(`/api/sis/classes/${classId}/sibling-sections`, orgId))
      .then((r) => setSections(r.data?.sections || []))
      .catch(() => setSections([]))
    api.get(withOrg('/api/sis/roster', orgId))
      .then((r) => setPeople((r.data?.roster || []).filter((p) => p.is_student)))
      .catch(() => setPeople([]))
  }, [classId, orgId])

  // Put a student on this waitlist by hand. Families join it themselves in the
  // Schedule Builder, but the office takes the ask on the phone and at the desk
  // and had nowhere to record it (iCreate, 2026-09-02). Same 409-then-confirm
  // shape as the roster's Add: a student still waiting for a place at the
  // SCHOOL is a warning, not a wall.
  const addToWaitlist = async (force = false) => {
    if (!adding) return
    setAddBusy(true)
    try {
      await api.post(`/api/sis/classes/${classId}/waitlist`,
        { organization_id: orgId, student_user_id: adding, force })
      toast.success('Added to the waitlist')
      setAdding('')
      reload()
      onChanged?.()
    } catch (e) {
      if (e?.response?.status === 409 && e.response.data?.enrollment_waitlisted) {
        setAddBusy(false)
        if (await confirm(`${e.response.data.error}\n\nAdd them anyway?`)) return addToWaitlist(true)
        return
      }
      toast.error(e?.response?.data?.error || 'Could not add the student')
    } finally { setAddBusy(false) }
  }

  // A seat can only be offered when one is actually open. Offering into a full
  // class enrolls someone over capacity, so the button is disabled until a seat
  // frees up (a drop, or raising the capacity).
  const capacity = cls?.capacity
  const enrolled = cls?.enrolled_count ?? 0
  const isFull = cls?.is_full ?? (capacity != null && enrolled >= capacity)

  const offerNext = async () => {
    try {
      const r = await api.post(`/api/sis/classes/${classId}/waitlist/offer-next`, { organization_id: orgId })
      // Name who — an unnamed "next student" left the office with no record of
      // who had been offered the seat (iCreate, 2026-08-17).
      if (r.data?.entry) toast.success(`Seat offered to ${r.data.entry.student_name || 'the next student'}`)
      else toast(r.data?.message || 'No one is waiting for this class', { icon: 'ℹ️' })
      reload()
    } catch { toast.error('Could not offer seat') }
  }

  // Nobody to offer to when every live entry already has an offer out — the
  // per-entry Offer again / Enroll now buttons are the way forward there.
  const waitingCount = entries.filter((e) => e.status === 'waiting').length
  // Still queued for a seat — the number the office reads as "the waitlist".
  const liveCount = entries.filter((e) => e.status === 'waiting' || e.status === 'offered').length

  // Admit the student now. The school already decided — this doesn't wait for
  // the family to click Claim, and it isn't blocked by a full class.
  // A clash with something they already attend comes back as a 409 and is
  // confirmed before forcing — admitting off the waitlist is how a student
  // ended up in two Wednesday microschool sections at once.
  const enroll = async (e, force = false) => {
    if (!force && !(await confirm(`Enroll ${e.student_name} in ${cls?.name || 'this class'} now?`))) return
    setBusy(e.id)
    try {
      await api.post(`/api/sis/waitlist/${e.id}/enroll`, { organization_id: orgId, force })
      toast.success(`${e.student_name} enrolled`)
      reload()
      onChanged?.()
    } catch (err) {
      const clash = err?.response?.status === 409 && err.response.data?.conflicts
      if (clash?.length) {
        const names = clash.map((c) => c.class_name || c.name).filter(Boolean).join(', ')
        if (await confirm(
          `${e.student_name} already has ${names} at that time.\n\n`
          + `Enroll in ${cls?.name || 'this class'} anyway? They'll be in both.`)) {
          return enroll(e, true)
        }
        return
      }
      toast.error(err?.response?.data?.error || 'Could not enroll the student')
    } finally { setBusy(null) }
  }

  // Hand the other section's seat to the FAMILY to claim. The office can see
  // the open seat; only they can see whether that time works — "can we OFFER
  // them the seat since we don't know what their schedule is?" (iCreate).
  const offerSection = async (e, section) => {
    setBusy(e.id)
    setMovingId(null)
    try {
      await api.post(`/api/sis/waitlist/${e.id}/offer-section`, {
        organization_id: orgId, class_id: section.class_id,
      })
      toast.success(`${section.name} offered to ${e.student_name}`)
      reload()
      onChanged?.()   // an offer holds a seat, so spots_left and Full move too
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not offer that section')
    } finally { setBusy(null) }
  }

  // Put them in it outright — for when the office already knows the time works.
  // A clash with something they already attend comes back as a 409 and is
  // confirmed before forcing.
  const enrollInSection = async (e, section, force = false) => {
    setBusy(e.id)
    setMovingId(null)
    try {
      await api.post(`/api/sis/waitlist/${e.id}/enroll`, {
        organization_id: orgId, class_id: section.class_id, force,
      })
      toast.success(`${e.student_name} enrolled in ${section.name}`)
      reload()
      onChanged?.()
    } catch (err) {
      const clash = err?.response?.status === 409 && err.response.data?.conflicts
      if (clash) {
        const names = clash.map((c) => c.class_name || c.name).filter(Boolean).join(', ')
        if (await confirm(
          `${e.student_name} already has ${names} at that time.\n\n`
          + `Enroll in ${section.name} anyway? They'll be in both.`)) {
          return enrollInSection(e, section, true)
        }
        return
      }
      toast.error(err?.response?.data?.error || 'Could not move the student')
    } finally { setBusy(null) }
  }

  const offer = async (e) => {
    setBusy(e.id)
    try {
      await api.post(`/api/sis/waitlist/${e.id}/offer`, { organization_id: orgId })
      toast.success(`Seat offered to ${e.student_name}`)
      reload()
      onChanged?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not offer the seat')
    } finally { setBusy(null) }
  }

  const remove = async (e) => {
    if (!(await confirm(`Remove ${e.student_name} from this waitlist?`))) return
    setBusy(e.id)
    try {
      await api.delete(`/api/sis/waitlist/${e.id}?organization_id=${orgId}`)
      toast.success('Removed from the waitlist')
      reload()
      onChanged?.()
    } catch { toast.error('Could not remove the entry') } finally { setBusy(null) }
  }

  const queuedIds = new Set(entries.filter((e) => e.status === 'waiting' || e.status === 'offered')
    .map((e) => e.student_user_id))
  const addRow = (
    <div className="flex items-end gap-2 mb-3">
      <div className="flex-1 min-w-0">
        <label className="block text-xs text-neutral-500 mb-1" htmlFor={`wl-add-${classId}`}>
          Add a student to the waitlist
        </label>
        <SearchSelect
          value={adding}
          onChange={setAdding}
          options={people.filter((p) => !queuedIds.has(p.student_id))}
          getId={(p) => p.student_id}
          getLabel={(p) => (p.age != null ? `${p.name} (age ${p.age})` : p.name)}
          placeholder="Search students…"
        />
      </div>
      <Button size="sm" disabled={!adding || addBusy} onClick={() => addToWaitlist()}>
        {addBusy ? 'Adding…' : 'Add'}
      </Button>
    </div>
  )

  if (loaded && !entries.length) {
    return (
      <div className="border-t border-gray-100 mt-3 pt-3">
        {addRow}
        <p className="text-sm text-neutral-400">No one on the waitlist.</p>
      </div>
    )
  }

  return (
    <div className="border-t border-gray-100 mt-3 pt-3">
      <div className="flex items-center justify-between mb-2">
        {/* The count is the LIVE queue. Promoted/declined/expired rows stay in
            the list as history, but counting them meant the number never moved
            when a student was enrolled (iCreate, 2026-08-13: "If someone is
            enrolled, then the waitlist number should go down"). Matches
            waitlist_count everywhere else: waiting + offered. */}
        <span className="text-sm font-medium text-neutral-700">Waitlist ({liveCount})</span>
        <Button size="sm" variant="secondary" onClick={offerNext} disabled={isFull || !waitingCount}
          title={isFull
            ? 'The class is full — free a seat or raise the capacity to offer one'
            : (!waitingCount
              ? 'Nobody is waiting — everyone here already has an offer out. Use Offer again or Enroll now.'
              : undefined)}>
          Offer next seat
        </Button>
      </div>
      {isFull && (
        <p className="text-xs text-neutral-400 mb-2">
          Class is full ({enrolled}/{capacity}). Drop a student or raise the capacity to offer a seat.
        </p>
      )}
      {addRow}
      <div className="space-y-1">
        {entries.map((e) => {
          const meta = WAITLIST_STATUS[e.status] || { label: e.status, tone: 'text-neutral-400' }
          const expiry = offerExpiryText(e)
          const done = e.status === 'promoted'
          return (
            <div key={e.id} className="flex items-center justify-between gap-3 text-sm py-0.5">
              {/* Only the NAME may truncate. Age and status used to share the
                  truncating span, so on a long name they were the first thing
                  clipped — which is why the age looked missing rather than
                  absent (iCreate, 2026-08-13: "I also can't see the age here"). */}
              <span className="text-neutral-700 min-w-0 flex items-baseline gap-1.5">
                <span className="min-w-0 truncate">#{e.position} · {e.student_name}</span>
                {e.student_age != null && <span className="shrink-0 text-xs text-neutral-400">age {e.student_age}</span>}
                <span className={`shrink-0 text-xs ${meta.tone}`}>{meta.label}</span>
                {expiry && <span className="shrink-0 text-xs text-neutral-400">({expiry})</span>}
              </span>
              {!done && (
                <span className="flex items-center gap-2 shrink-0 text-xs">
                  <button onClick={() => enroll(e)} disabled={busy === e.id}
                    className="text-optio-purple hover:underline disabled:opacity-50">
                    Enroll now
                  </button>
                  <button onClick={() => offer(e)} disabled={busy === e.id}
                    className="text-neutral-500 hover:underline disabled:opacity-50">
                    {e.status === 'waiting' ? 'Offer seat' : 'Offer again'}
                  </button>
                  {sections.length > 0 && (
                    <span className="relative">
                      <button onClick={() => setMovingId(movingId === e.id ? null : e.id)}
                        disabled={busy === e.id}
                        className="text-neutral-500 hover:underline disabled:opacity-50">
                        Other section ▾
                      </button>
                      {movingId === e.id && (
                        <>
                          <span className="fixed inset-0 z-10" onClick={() => setMovingId(null)} />
                          <span className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-left block">
                            <span className="block px-3 py-1 text-[11px] uppercase tracking-wide text-neutral-400">
                              Sections with room
                            </span>
                            <span className="block px-3 pb-1 text-[11px] text-neutral-400 leading-snug">
                              Offer it lets the family claim the seat — they know
                              whether that time works.
                            </span>
                            {sections.map((sec) => (
                              <span key={sec.class_id} className="block px-3 py-1.5 hover:bg-neutral-50">
                                <span className="block text-xs text-neutral-700">
                                  {sec.name}
                                  <span className="text-neutral-400">
                                    {sec.capacity != null
                                      ? ` · ${Math.max(0, sec.capacity - (sec.enrolled_count || 0))} seat(s)`
                                      : ' · space available'}
                                  </span>
                                </span>
                                <span className="flex items-center gap-2 mt-0.5">
                                  <button onClick={() => offerSection(e, sec)}
                                    className="text-xs font-medium text-optio-purple hover:underline">
                                    Offer it
                                  </button>
                                  <button onClick={() => enrollInSection(e, sec)}
                                    className="text-xs text-neutral-500 hover:underline">
                                    Enroll directly
                                  </button>
                                </span>
                              </span>
                            ))}
                          </span>
                        </>
                      )}
                    </span>
                  )}
                  <button onClick={() => remove(e)} disabled={busy === e.id}
                    className="text-neutral-400 hover:text-red-500 hover:underline disabled:opacity-50">
                    Remove
                  </button>
                </span>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-neutral-400">
        <strong>Enroll now</strong> puts the student in the class immediately — use it when the school has
        already decided. <strong>Offer</strong> asks the family to claim the seat themselves, and can be
        sent again if the first offer lapsed.
      </p>
    </div>
  )
}

export default ClassesPage
