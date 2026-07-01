import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { ModalOverlay } from '../../components/ui'
import { useOrganization } from '../../contexts/OrganizationContext'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import CreateClassModal from '../../components/sis/CreateClassModal'
import EnrollStudentForm from '../../components/partner/EnrollStudentForm'
import CourseEnrollmentManager from '../../components/admin/CourseEnrollmentManager'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

const scheduleText = (meetings = []) => {
  if (!meetings.length) return null
  const sorted = [...meetings].sort((a, b) => (a.day_of_week ?? 9) - (b.day_of_week ?? 9))
  const days = sorted.map((m) => (m.day_of_week != null ? DAYS[m.day_of_week] : m.specific_date)).join(', ')
  const first = sorted[0]
  const time = first ? `${hhmm(first.start_time)}–${hhmm(first.end_time)}` : ''
  return `${days}${time ? ` · ${time}` : ''}`
}

const ageBand = (c) => {
  if (c.min_age != null && c.max_age != null) return `${c.min_age}–${c.max_age}`
  if (c.min_age != null) return `${c.min_age}+`
  if (c.max_age != null) return `≤${c.max_age}`
  return null
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

const ClassesPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const { organization } = useOrganization()
  const orgName = organization?.name || orgs.find((o) => o.id === orgId)?.name || 'Org'
  const [classes, setClasses] = useState([])
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)     // class being edited
  const [enrollCourse, setEnrollCourse] = useState(null) // course to enroll a student into
  const [manageCourse, setManageCourse] = useState(null) // course whose enrollments we're managing (bulk)
  const [expanded, setExpanded] = useState(null)
  const [filter, setFilter] = useState('classes')  // all | classes | courses; default: org's own classes
  const [search, setSearch] = useState('')

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      api.get(withOrg('/api/sis/classes', orgId)),
      api.get('/api/courses?filter=all').catch(() => ({ data: {} })),
    ])
      .then(([cls, crs]) => {
        setClasses(cls.data?.classes || [])
        const all = crs.data?.courses || []
        setCourses(all.filter((c) => isSelectableCourse(c, orgId)))
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
    capacity: payload.capacity ?? null,
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

  const handleUpdate = async (payload, imageFile) => {
    const id = editing.id
    try {
      await api.patch(`/api/sis/classes/${id}`, classBody(payload))
      await syncMeetings(id, payload.days_of_week, payload.start_time, payload.duration_minutes, editing.meetings || [])
      if (imageFile) await uploadImage(id, imageFile)
      toast.success('Class updated')
      setEditing(null)
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not update class')
    }
  }

  const archiveClass = async (c) => {
    if (!window.confirm(`Archive "${c.name}"? It will no longer accept registrations.`)) return
    try {
      await api.delete(`/api/sis/classes/${c.id}?organization_id=${orgId}`)
      toast.success('Class archived')
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="flex-1 min-w-[160px] max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
        />
      </div>

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !items.length && (
        <p className="text-neutral-500">
          {search ? 'Nothing matches your search.' : 'Nothing here yet. Create a class to get started.'}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((item) => (
          item.kind === 'class' ? (
            <ClassCard
              key={`class-${item.id}`}
              c={item}
              expanded={expanded === item.id}
              orgId={orgId}
              onToggleExpand={() => setExpanded(expanded === item.id ? null : item.id)}
              onEdit={() => setEditing(item)}
              onArchive={() => archiveClass(item)}
              onToggleRegistration={() => toggleRegistration(item)}
            />
          ) : (
            <CourseCard
              key={`course-${item.id}`}
              c={item}
              onEnroll={() => setEnrollCourse(item)}
              onManage={() => setManageCourse(item)}
            />
          )
        ))}
      </div>

      {creating && (
        <CreateClassModal onClose={() => setCreating(false)} onSubmit={handleCreate} />
      )}
      {editing && (
        <CreateClassModal initial={editing} onClose={() => setEditing(null)} onSubmit={handleUpdate} />
      )}
      {enrollCourse && (
        <ModalOverlay onClose={() => setEnrollCourse(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">Enroll a student</h2>
              <button onClick={() => setEnrollCourse(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="p-4 overflow-y-auto">
              <p className="text-sm text-neutral-500 mb-3">Registering for <span className="font-medium text-neutral-800">{enrollCourse.title}</span>. Add more courses below if needed.</p>
              <EnrollStudentForm orgId={orgId} initialCourseIds={[enrollCourse.id]} onRegistered={() => {}} />
            </div>
          </div>
        </ModalOverlay>
      )}
      {manageCourse && (
        <CourseEnrollmentManager
          courseId={manageCourse.id}
          courseName={manageCourse.title}
          orgId={orgId}
          isSuperadmin={isSuperadmin}
          onClose={() => setManageCourse(null)}
        />
      )}
    </div>
  )
}

const ClassCard = ({ c, expanded, orgId, onToggleExpand, onEdit, onArchive, onToggleRegistration }) => {
  const isOpen = c.registration_status === 'open'
  const sched = scheduleText(c.meetings)
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
      <div className="relative h-40 bg-gradient-to-br from-optio-purple/10 to-optio-pink/10">
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

      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-semibold text-neutral-900">{c.name}</h3>
        {c.description && <p className="text-sm text-neutral-500 mt-1 line-clamp-3">{c.description}</p>}

        <dl className="mt-3 space-y-1.5 text-sm">
          <Row label="Enrolled" value={`${c.enrolled_count}${c.capacity != null ? ` / ${c.capacity}` : ''}`} />
          <Row label="Schedule" value={sched || '—'} />
          <Row label="Ages" value={ageBand(c) || '—'} />
          <Row label="Supply fee" value={c.supply_fee != null ? `$${Number(c.supply_fee).toFixed(2)}` : '—'} />
        </dl>

        <div className="mt-auto pt-3 flex items-center justify-between">
          <span className="text-sm text-neutral-700">
            Registration <span className={isOpen ? 'text-green-600 font-medium' : 'text-neutral-400'}>{isOpen ? 'open' : 'closed'}</span>
          </span>
          <button
            type="button" role="switch" aria-checked={isOpen} aria-label="Toggle registration"
            onClick={onToggleRegistration}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${isOpen ? 'bg-green-500' : 'bg-neutral-300'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${isOpen ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 text-sm">
          <button onClick={onEdit} className="text-optio-purple font-medium hover:underline">Edit</button>
          <button onClick={onToggleExpand} className="text-optio-purple font-medium hover:underline">
            {expanded ? 'Hide waitlist' : 'Waitlist'}
          </button>
          <button onClick={onArchive} className="text-red-500 hover:underline ml-auto">Archive</button>
        </div>
        {expanded && <ClassWaitlist classId={c.id} orgId={orgId} />}
      </div>
    </div>
  )
}

const CourseCard = ({ c, onEnroll, onManage }) => (
  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
    <div className="relative h-40 bg-gradient-to-br from-optio-pink/10 to-optio-purple/10">
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

    <div className="p-4 flex flex-col flex-1">
      <h3 className="font-semibold text-neutral-900">{c.title}</h3>
      {c.description && <p className="text-sm text-neutral-500 mt-1 line-clamp-3">{c.description}</p>}

      <dl className="mt-3 space-y-1.5 text-sm">
        <Row label="Ages" value={c.age_range || '—'} />
        <Row label="Length" value={c.estimated_hours ? `~${c.estimated_hours} hrs` : '—'} />
      </dl>

      <div className="mt-auto pt-3 border-t border-gray-100 flex items-center gap-4">
        <button onClick={onEnroll} className="text-optio-purple font-medium hover:underline text-sm">Enroll student</button>
        <button onClick={onManage} className="text-optio-purple font-medium hover:underline text-sm ml-auto">Manage enrollments</button>
      </div>
    </div>
  </div>
)

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-neutral-400">{label}</dt>
    <dd className="text-neutral-700 text-right">{value}</dd>
  </div>
)

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
