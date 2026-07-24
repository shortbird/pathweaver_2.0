import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { Squares2X2Icon, TableCellsIcon, ArrowPathIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'
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
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const { organization } = useOrganization()
  const orgName = organization?.name || orgs.find((o) => o.id === orgId)?.name || 'Org'
  const [classes, setClasses] = useState([])
  const [courses, setCourses] = useState([])
  const [staff, setStaff] = useState([])
  const [courseSettings, setCourseSettings] = useState({}) // course_id -> {teacher}
  const [courseTuition, setCourseTuition] = useState(null)  // org-wide tuition (cents) for all Optio courses
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)     // class being edited
  const [editTab, setEditTab] = useState('details') // which tab the class modal opens on
  const [settingsCourse, setSettingsCourse] = useState(null) // course open in the detail modal (settings/enroll/enrollments tabs)
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
  const [showSync, setShowSync] = useState(false)  // sync-from-sheet modal
  const [showArchived, setShowArchived] = useState(false) // include archived classes
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
      api.get(withOrg('/api/sis/staff', orgId)).catch(() => ({ data: {} })),
      api.get(withOrg('/api/sis/course-settings', orgId)).catch(() => ({ data: {} })),
      api.get(`/api/admin/organizations/${orgId}`).catch(() => ({ data: {} })),
    ])
      .then(([cls, crs, stf, ct, org]) => {
        setClasses(cls.data?.classes || [])
        const all = crs.data?.courses || []
        setCourses(all.filter((c) => isSelectableCourse(c, orgId)))
        setStaff(stf.data?.staff || [])
        const map = {}
        for (const row of ct.data?.course_settings || []) map[row.course_id] = row
        setCourseSettings(map)
        setCourseTuition(ct.data?.optio_course_tuition_cents ?? null)
        setTimeBlocks(org.data?.organization?.feature_flags?.sis_settings?.time_blocks || [])
      })
      .catch(() => toast.error('Failed to load catalog'))
      .finally(() => setLoading(false))
  }, [orgId, showArchived])

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

  const classBody = (payload) => ({
    name: payload.name,
    description: payload.description,
    location: payload.location ?? null,
    primary_instructor_id: payload.primary_instructor_id ?? null,
    capacity: payload.capacity ?? null,
    price_cents: payload.price_cents ?? null,
    supply_fee: payload.supply_fee ?? null,
    min_age: payload.min_age ?? null,
    max_age: payload.max_age ?? null,
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
        capacity: c.capacity ?? null,
        price_cents: c.price_cents ?? null,
        supply_fee: c.supply_fee ?? null,
        min_age: c.min_age ?? null,
        max_age: c.max_age ?? null,
        requires_full_day: c.requires_full_day ?? false,
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
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not duplicate class')
    }
  }

  const openRoster = (c) => { setEditTab('roster'); setEditing(c) }
  const openEditor = (c) => { setEditTab('details'); setEditing(c) }

  // Client-side CSV of the org's classes (the columns staff asked to sort in a
  // spreadsheet). Built from the already-loaded rows — no extra request.
  const exportCsv = () => {
    const DOW = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' }
    const t12 = (t) => {
      if (!t) return ''
      const [h, m] = String(t).slice(0, 5).split(':').map(Number)
      const ampm = h >= 12 ? 'pm' : 'am'
      const h12 = h % 12 === 0 ? 12 : h % 12
      return `${h12}:${String(m).padStart(2, '0')}${ampm}`
    }
    const daysOf = (mts = []) => [...new Set(mts.map((m) => m.day_of_week).filter((d) => d != null))].sort()
      .map((d) => DOW[d]).join(' ')
    const timeOf = (mts = []) => {
      const f = (mts || []).find((m) => m.start_time && m.end_time)
      return f ? `${t12(f.start_time)}-${t12(f.end_time)}` : ''
    }
    const ages = (c) => c.min_age != null && c.max_age != null ? `${c.min_age}-${c.max_age}`
      : c.min_age != null ? `${c.min_age}+` : c.max_age != null ? `up to ${c.max_age}` : ''
    const headers = ['Class name', 'Teacher', 'Days', 'Time', 'Ages', 'Description',
      'Supply fee', 'Tuition', 'Classroom', 'Enrolled', 'Capacity', 'Waitlist']
    const rows = classes.map((c) => [
      c.name || '',
      c.primary_instructor?.name || c.primary_instructor?.display_name || '',
      daysOf(c.meetings),
      timeOf(c.meetings),
      ages(c),
      c.description || '',
      c.supply_fee != null ? `$${c.supply_fee}` : '',
      c.price_cents != null ? `$${(c.price_cents / 100).toFixed(2)}` : '',
      c.location || '',
      c.enrolled_count ?? 0,
      c.capacity ?? '',
      c.waitlist_count ?? 0,
    ])
    const esc = (v) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n')
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${orgName.replace(/\s+/g, '-').toLowerCase()}-classes.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const archiveClass = async (c) => {
    if (!window.confirm(`Archive "${c.name}"? It will no longer accept registrations.`)) return
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

  // Every non-archived class that isn't open is invisible to families in the
  // Schedule Builder — new classes default to closed, which is easy to miss.
  const closedClasses = classes.filter((c) => c.registration_status !== 'open')
  const openAll = async () => {
    if (!window.confirm(`Open registration for all ${closedClasses.length} closed class${closedClasses.length === 1 ? '' : 'es'}? Families will see them in the Schedule Builder immediately.`)) return
    try {
      await Promise.all(closedClasses.map((c) =>
        api.patch(`/api/sis/classes/${c.id}`, { registration_status: 'open', organization_id: orgId })))
      toast.success('Registration opened for all classes')
    } catch {
      toast.error('Could not open some classes — check the list')
    }
    load()
  }

  // ── Tab-scoped, searched catalog ─────────────────────────────────────────────
  const items = useMemo(() => {
    const source = tab === 'courses'
      ? courses.map((c) => ({ kind: 'course', _name: c.title, ...c }))
      : classes.map((c) => ({ kind: 'class', _name: c.name, ...c }))
    const q = search.trim().toLowerCase()
    return q ? source.filter((i) => (i._name || '').toLowerCase().includes(q)) : source
  }, [classes, courses, tab, search])

  // Table view is the org's classes only (Optio courses aren't org-editable).
  const tableClasses = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? classes.filter((c) => (c.name || '').toLowerCase().includes(q)) : classes
  }, [classes, search])

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
          <button onClick={exportCsv}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-neutral-600 text-sm font-medium hover:bg-neutral-50 transition-colors">
            <ArrowDownTrayIcon className="w-4 h-4" />
            Export CSV
          </button>
        )}
      </div>

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

      {tab === 'classes' && !loading && closedClasses.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <span>
            {closedClasses.length} class{closedClasses.length === 1 ? ' is' : 'es are'} closed to
            registration — families can't see {closedClasses.length === 1 ? 'it' : 'them'} in the
            Schedule Builder. Use each row's Registration toggle, or open all at once.
          </span>
          <button onClick={openAll}
            className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold border border-amber-400 text-amber-800 hover:bg-amber-100 transition-colors">
            Open all {closedClasses.length}
          </button>
        </div>
      )}

      {loading && <p className="text-neutral-500">Loading…</p>}

      {/* Empty state (courses tab, or classes tab in card view) */}
      {!loading && !items.length && (tab === 'courses' || view === 'cards') && (
        <p className="text-neutral-500">
          {search
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
          onSave={saveClass}
          onToggleRegistration={toggleRegistration}
          onOpen={openEditor}
          onRoster={openRoster}
          onDuplicate={duplicateClass}
          onArchive={archiveClass}
          onRestore={restoreClass}
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
              />
            )
          ))}
        </div>
      )}

      {creating && (
        <CreateClassModal staff={staff} timeBlocks={timeBlocks} onClose={() => setCreating(false)} onSubmit={handleCreate} />
      )}
      {editing && (
        <ClassDetailModal
          cls={classes.find((c) => c.id === editing.id) || editing}
          staff={staff}
          timeBlocks={timeBlocks}
          orgId={orgId}
          initialTab={editTab}
          onClose={() => setEditing(null)}
          onSubmit={handleUpdate}
          onToggleRegistration={toggleRegistration}
          onArchive={() => archiveClass(classes.find((c) => c.id === editing.id) || editing)}
          onRestore={() => restoreClass(classes.find((c) => c.id === editing.id) || editing)}
        />
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
      <h3 className="font-semibold text-neutral-900">{c.name}</h3>
      {c.description && <p className="text-sm text-neutral-500 mt-1 line-clamp-3">{c.description}</p>}
    </div>
  </button>
)

const CourseCard = ({ c, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col text-left hover:border-optio-purple/50 hover:shadow-md transition-all"
  >
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

    <div className="p-4">
      <h3 className="font-semibold text-neutral-900">{c.title}</h3>
      {c.description && <p className="text-sm text-neutral-500 mt-1 line-clamp-3">{c.description}</p>}
      <p className="mt-2 text-xs font-medium text-optio-purple">{OPTIO_COURSE_FEE} per student · billed to the school</p>
    </div>
  </button>
)

const COURSE_TABS = [
  { key: 'details', label: 'Details' },
  { key: 'manage', label: 'Enrollments' },
]

// Tuition is intentionally not shown here: SIS staff manage the teacher and
// rosters; the price surfaces in the parent-facing schedule builder instead.
const CourseDetailModal = ({ course, staff, current, orgId, isSuperadmin, onClose, onSaved }) => {
  const [tab, setTab] = useState('details')
  const [teacherId, setTeacherId] = useState(current?.teacher?.id || '')
  const [saving, setSaving] = useState(false)
  const [quests, setQuests] = useState([])

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
const ClassDetailModal = ({ cls, staff, timeBlocks = [], orgId, initialTab = 'details', onClose, onSubmit, onToggleRegistration, onArchive, onRestore }) => {
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

              <CreateClassModal embedded initial={cls} staff={staff} timeBlocks={timeBlocks} onClose={onClose} onSubmit={onSubmit} />

              <div className="pt-1">
                {isArchived ? (
                  <button onClick={onRestore} className="text-sm font-medium text-optio-purple hover:underline">Restore class</button>
                ) : (
                  <button onClick={onArchive} className="text-sm text-red-500 hover:underline">Archive class</button>
                )}
              </div>
            </div>
          )}

          {tab === 'roster' && <ClassRoster classId={cls.id} orgId={orgId} />}
          {tab === 'waitlist' && <ClassWaitlist classId={cls.id} orgId={orgId} cls={cls} />}
        </div>
      </div>
    </ModalOverlay>
  )
}

// Enrolled students for the class (sorted by last name).
const ClassRoster = ({ classId, orgId }) => {
  const [roster, setRoster] = useState(null)
  const [dropping, setDropping] = useState(null)

  const reload = useCallback(() => {
    api.get(withOrg(`/api/sis/classes/${classId}/enrollments`, orgId))
      .then((r) => setRoster(r.data?.roster || []))
      .catch(() => { toast.error('Failed to load the roster'); setRoster([]) })
  }, [classId, orgId])
  useEffect(() => { reload() }, [reload])

  const drop = async (s) => {
    if (!window.confirm(`Drop ${s.name} from this class?`)) return
    setDropping(s.student_id)
    try {
      await api.delete(withOrg(`/api/sis/classes/${classId}/enrollments/${s.student_id}`, orgId))
      toast.success(`Dropped ${s.name}`)
      reload()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not drop the student') }
    finally { setDropping(null) }
  }

  if (roster === null) return <p className="text-sm text-neutral-400">Loading…</p>
  if (!roster.length) return <p className="text-sm text-neutral-400">No students enrolled yet.</p>
  return (
    <div>
      <p className="text-xs text-neutral-400 mb-2">{roster.length} enrolled</p>
      <ul className="divide-y divide-gray-100">
        {roster.map((s) => (
          <li key={s.student_id} className="py-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-neutral-800">
              {s.name}
              {s.age != null && <span className="ml-1.5 text-xs font-normal text-neutral-400">age {s.age}</span>}
            </span>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-neutral-400 truncate max-w-[10rem]">{s.email || s.username || ''}</span>
              <Button size="sm" variant="outline" disabled={dropping === s.student_id} onClick={() => drop(s)}>
                {dropping === s.student_id ? '…' : 'Drop'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

const ClassWaitlist = ({ classId, orgId, cls }) => {
  const [entries, setEntries] = useState([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(() => {
    api.get(`/api/sis/classes/${classId}/waitlist?organization_id=${orgId}`)
      .then((r) => setEntries(r.data?.waitlist || []))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [classId, orgId])

  useEffect(() => { reload() }, [reload])

  // A seat can only be offered when one is actually open. Offering into a full
  // class enrolls someone over capacity, so the button is disabled until a seat
  // frees up (a drop, or raising the capacity).
  const capacity = cls?.capacity
  const enrolled = cls?.enrolled_count ?? 0
  const isFull = cls?.is_full ?? (capacity != null && enrolled >= capacity)

  const offerNext = async () => {
    try {
      const r = await api.post(`/api/sis/classes/${classId}/waitlist/offer-next`, { organization_id: orgId })
      toast.success(r.data?.entry ? 'Seat offered to next student' : 'No one waiting')
      reload()
    } catch { toast.error('Could not offer seat') }
  }

  if (loaded && !entries.length) {
    return <div className="border-t border-gray-100 mt-3 pt-3 text-sm text-neutral-400">No one on the waitlist.</div>
  }

  return (
    <div className="border-t border-gray-100 mt-3 pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-neutral-700">Waitlist ({entries.length})</span>
        <Button size="sm" variant="secondary" onClick={offerNext} disabled={isFull}
          title={isFull ? 'The class is full — free a seat or raise the capacity to offer one' : undefined}>
          Offer next seat
        </Button>
      </div>
      {isFull && (
        <p className="text-xs text-neutral-400 mb-2">
          Class is full ({enrolled}/{capacity}). Drop a student or raise the capacity to offer a seat.
        </p>
      )}
      <div className="space-y-1">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center justify-between text-sm">
            <span className="text-neutral-700">
              #{e.position} · {e.student_name}
              {e.student_age != null && <span className="ml-1.5 text-xs text-neutral-400">age {e.student_age}</span>}
            </span>
            <span className="text-neutral-400">{e.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ClassesPage
