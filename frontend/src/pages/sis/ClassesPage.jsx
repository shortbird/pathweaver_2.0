import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'react-hot-toast'
import { Squares2X2Icon, TableCellsIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
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
  const [settingsCourse, setSettingsCourse] = useState(null) // course open in the detail modal (settings/enroll/enrollments tabs)
  const [filter, setFilter] = useState('classes')  // all | classes | courses; default: org's own classes
  const [search, setSearch] = useState('')
  const [timeBlocks, setTimeBlocks] = useState([]) // school-day periods (Settings)
  const [showSync, setShowSync] = useState(false)  // sync-from-sheet modal
  // cards | table — table is the spreadsheet view of the org's classes.
  const [view, setViewState] = useState(() => {
    try { return localStorage.getItem('sis_classes_view') || 'table' } catch { return 'table' }
  })
  const setView = (v) => {
    setViewState(v)
    try { localStorage.setItem('sis_classes_view', v) } catch { /* ignore */ }
  }

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      api.get(withOrg('/api/sis/classes', orgId)),
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
  }, [orgId])

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
      load()
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

  const archiveClass = async (c) => {
    if (!window.confirm(`Archive "${c.name}"? It will no longer accept registrations.`)) return
    try {
      await api.delete(`/api/sis/classes/${c.id}?organization_id=${orgId}`)
      toast.success('Class archived')
      setEditing(null)
      load()
    } catch { toast.error('Could not archive class') }
  }

  const toggleRegistration = async (cls) => {
    const next = cls.registration_status === 'open' ? 'closed' : 'open'
    try {
      await api.patch(`/api/sis/classes/${cls.id}`, { registration_status: next, organization_id: orgId })
      load()
    } catch { toast.error('Could not update registration') }
  }

  // ── Unified, filtered catalog ────────────────────────────────────────────────
  const items = useMemo(() => {
    const cls = classes.map((c) => ({ kind: 'class', _name: c.name, ...c }))
    const crs = courses.map((c) => ({ kind: 'course', _name: c.title, ...c }))
    let list = filter === 'classes' ? cls : filter === 'courses' ? crs : [...cls, ...crs]
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((i) => (i._name || '').toLowerCase().includes(q))
    return list
  }, [classes, courses, filter, search])

  // Table view is the org's classes only (Optio courses aren't org-editable).
  const tableClasses = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? classes.filter((c) => (c.name || '').toLowerCase().includes(q)) : classes
  }, [classes, search])

  const FILTERS = [
    { key: 'all', label: `All (${classes.length + courses.length})` },
    { key: 'classes', label: `${orgName} classes (${classes.length})` },
    { key: 'courses', label: `Optio Courses (${courses.length})` },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-neutral-900">Classes</h1>
        <div className="flex items-center gap-3">
          <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
          <Button size="sm" onClick={() => setCreating(true)} disabled={!orgId}>Create class</Button>
        </div>
      </div>

      {/* Filters + view toggle */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {view === 'cards' && (
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${filter === f.key ? 'bg-optio-purple text-white' : 'text-neutral-600 hover:bg-neutral-50'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="flex-1 min-w-[160px] max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
        />
        {orgId && <ScheduleAiEditor orgId={orgId} onApplied={load} />}
        {orgId && (
          <button onClick={() => setShowSync(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-optio-purple/40 text-optio-purple text-sm font-medium hover:bg-optio-purple/5 transition-colors">
            <ArrowPathIcon className="w-4 h-4" />
            Sync from Sheet
          </button>
        )}
      </div>

      {showSync && orgId && (
        <ScheduleSyncModal orgId={orgId} onClose={() => setShowSync(false)} onApplied={load} />
      )}

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && view === 'cards' && !items.length && (
        <p className="text-neutral-500">
          {search ? 'Nothing matches your search.' : 'Nothing here yet. Create a class to get started.'}
        </p>
      )}

      {!loading && view === 'table' && (
        <ClassesTable
          classes={tableClasses}
          staff={staff}
          timeBlocks={timeBlocks}
          onSave={saveClass}
          onToggleRegistration={toggleRegistration}
          onOpen={(c) => setEditing(c)}
        />
      )}

      {view === 'cards' && (
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
          onClose={() => setEditing(null)}
          onSubmit={handleUpdate}
          onToggleRegistration={toggleRegistration}
          onArchive={() => archiveClass(classes.find((c) => c.id === editing.id) || editing)}
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
            <CourseEnrollmentManager embedded courseId={course.id} courseName={course.title}
              orgId={orgId} isSuperadmin={isSuperadmin} />
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
  { key: 'waitlist', label: 'Waitlist' },
]

// Same shell as CourseDetailModal, but a class is org-owned so every field is
// editable (the embedded CreateClassModal form), plus registration + archive.
// "Preview" renders the exact read-only modal parents and students see in the
// Schedule Builder.
const ClassDetailModal = ({ cls, staff, timeBlocks = [], orgId, onClose, onSubmit, onToggleRegistration, onArchive }) => {
  const [tab, setTab] = useState('details')
  const [previewing, setPreviewing] = useState(false)
  const isOpen = cls.registration_status === 'open'

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
                <button onClick={onArchive} className="text-sm text-red-500 hover:underline">Archive class</button>
              </div>
            </div>
          )}

          {tab === 'waitlist' && <ClassWaitlist classId={cls.id} orgId={orgId} />}
        </div>
      </div>
    </ModalOverlay>
  )
}

const ClassWaitlist = ({ classId, orgId }) => {
  const [entries, setEntries] = useState([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(() => {
    api.get(`/api/sis/classes/${classId}/waitlist?organization_id=${orgId}`)
      .then((r) => setEntries(r.data?.waitlist || []))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [classId, orgId])

  useEffect(() => { reload() }, [reload])

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
        <Button size="sm" variant="secondary" onClick={offerNext}>Offer next seat</Button>
      </div>
      <div className="space-y-1">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center justify-between text-sm">
            <span className="text-neutral-700">#{e.position} · {e.student_name}</span>
            <span className="text-neutral-400">{e.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ClassesPage
