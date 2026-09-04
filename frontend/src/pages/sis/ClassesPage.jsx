import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { Squares2X2Icon, TableCellsIcon, ArrowPathIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useOrganization } from '../../contexts/OrganizationContext'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import CreateClassModal from '../../components/sis/CreateClassModal'
import ScheduleAiEditor from '../../components/sis/ScheduleAiEditor'
import ScheduleSyncModal from '../../components/sis/ScheduleSyncModal'
import ClassesTable from '../../components/sis/ClassesTable'
import ClassesExportModal from '../../components/sis/ClassesExportModal'
import CoursePreviewModal from '../../components/course/CoursePreviewModal'
import { fmt12ap } from '../../components/sis/classFields'
import { useConfirm } from '../../contexts/ConfirmContext'
import { useAuth } from '../../contexts/AuthContext'
import { canSeeFinance, isSisAdmin } from './sisRole'

// What Optio charges a school per student to enroll in an Optio course. Optio
// invoices the school directly for each enrollment — there is no in-app billing.

import ClassCard from './classesPage/ClassCard'
import CourseCard from './classesPage/CourseCard'
import CourseDetailModal from './classesPage/CourseDetailModal'
import ClassDetailModal from './classesPage/ClassDetailModal'
import OPTIO_COURSE_FEE from './classesPage/OPTIO_COURSE_FEE'
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

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-neutral-400">{label}</dt>
    <dd className="text-neutral-700 text-right">{value}</dd>
  </div>
)

export default ClassesPage
