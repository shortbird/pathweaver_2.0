import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import WeeklySchedule from '../components/schedule/WeeklySchedule'
import ClassDetailsModal, { meetingText, money } from '../components/schedule/ClassDetailsModal'

// Family Schedule Builder: pick a child, see their week at a glance, and add /
// drop / waitlist classes. Self-service is open until the org's first day of
// school (feature_flags.sis_settings.first_day_of_school); after that, changes
// are staff-only and this page is read-only.

const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const toMin = (t) => {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  return Number.isNaN(h) ? null : h * 60 + (m || 0)
}

// Does candidate overlap any of the student's current meetings?
const conflictsWith = (candidate, current) => {
  for (const cm of candidate.meetings || []) {
    if (cm.day_of_week == null) continue
    const cs = toMin(cm.start_time); const ce = toMin(cm.end_time)
    if (cs == null || ce == null) continue
    for (const cls of current) {
      for (const m of cls.meetings || []) {
        if (m.day_of_week !== cm.day_of_week) continue
        const s = toMin(m.start_time); const e = toMin(m.end_time)
        if (s == null || e == null) continue
        if (cs < e && s < ce) return cls.name
      }
    }
  }
  return null
}

const fmtDate = (d) => {
  try { return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) }
  catch { return d }
}

// Slot filter (an hour clicked on the calendar): label + does-this-class-meet-then.
const SLOT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const fmtHour = (min) => {
  const h = Math.floor(min / 60)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${ampm}`
}
const slotLabel = (f) => `${SLOT_DAYS[f.day]} ${fmtHour(f.min)}–${fmtHour(f.min + 60)}`
const meetsAt = (c, f) => (c.meetings || []).some((m) => {
  if (m.day_of_week !== f.day) return false
  const s = toMin(m.start_time); const e = toMin(m.end_time)
  return s != null && e != null && s < f.min + 60 && f.min < e
})

const ScheduleBuilderPage = () => {
  const [ctx, setCtx] = useState(null)          // { orgs: [{organization_id, organization_name, students[]}] }
  const [orgId, setOrgId] = useState(null)
  const [studentId, setStudentId] = useState(null)
  const [schedule, setSchedule] = useState(null) // { classes, waitlist, courses, first_day_of_school, changes_locked }
  const [catalog, setCatalog] = useState([])
  const [courseCatalog, setCourseCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)         // class_id being added/dropped
  const [ghost, setGhost] = useState(null)       // hover preview on the calendar
  const [search, setSearch] = useState('')
  const [catalogTab, setCatalogTab] = useState('scheduled') // scheduled | home
  const [detail, setDetail] = useState(null)     // { type: 'class' | 'course', item }
  const [slotFilter, setSlotFilter] = useState(null) // { day, min } — hour clicked on the calendar

  // A time filter for one child's week doesn't carry over to another schedule.
  useEffect(() => { setSlotFilter(null) }, [orgId, studentId])

  useEffect(() => {
    api.get('/api/sis/parent/context')
      .then((r) => {
        const orgs = r.data?.orgs || []
        setCtx({ orgs })
        if (orgs.length) {
          setOrgId(orgs[0].organization_id)
          setStudentId(orgs[0].students?.[0]?.student_id || null)
        }
      })
      .catch(() => toast.error('Could not load your family'))
      .finally(() => setLoading(false))
  }, [])

  const reload = useCallback(() => {
    if (!orgId || !studentId) return
    api.get(`/api/sis/parent/students/${studentId}/schedule?organization_id=${orgId}`)
      .then((r) => setSchedule(r.data))
      .catch(() => toast.error('Could not load the schedule'))
    api.get(`/api/sis/parent/classes?organization_id=${orgId}`)
      .then((r) => setCatalog(r.data?.classes || []))
      .catch(() => { /* catalog list is supplementary */ })
    api.get(`/api/sis/parent/courses?organization_id=${orgId}`)
      .then((r) => setCourseCatalog(r.data?.courses || []))
      .catch(() => { /* course catalog is supplementary */ })
  }, [orgId, studentId])

  useEffect(() => { reload() }, [reload])

  const org = ctx?.orgs?.find((o) => o.organization_id === orgId)
  const students = org?.students || []
  const student = students.find((s) => s.student_id === studentId)
  const locked = !!schedule?.changes_locked
  const firstDay = schedule?.first_day_of_school

  const enrolled = schedule?.classes || []
  const waitlist = schedule?.waitlist || []
  const homeCourses = schedule?.courses || []
  const enrolledIds = new Set(enrolled.map((c) => c.id))
  const waitlistIds = new Set(waitlist.map((w) => w.class_id))
  const homeCourseIds = new Set(homeCourses.map((c) => c.id))

  // Running tuition total across everything on the schedule (waitlist excluded —
  // those seats aren't confirmed). "Estimated" because billing cadence can vary.
  const tuitionCents = [...enrolled.map((c) => c.price_cents), ...homeCourses.map((c) => c.tuition_cents)]
    .reduce((sum, v) => sum + (v || 0), 0)
  const tuitionCount = enrolled.length + homeCourses.length

  const available = useMemo(() => {
    const q = search.trim().toLowerCase()
    return catalog
      .filter((c) => !enrolledIds.has(c.id) && !waitlistIds.has(c.id))
      .filter((c) => !q || (c.name || '').toLowerCase().includes(q))
      .filter((c) => !slotFilter || meetsAt(c, slotFilter))
  }, [catalog, schedule, search, slotFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const availableCourses = useMemo(() => {
    const q = search.trim().toLowerCase()
    return courseCatalog
      .filter((c) => !homeCourseIds.has(c.id))
      .filter((c) => !q || (c.title || '').toLowerCase().includes(q))
  }, [courseCatalog, schedule, search]) // eslint-disable-line react-hooks/exhaustive-deps

  const addClass = async (c) => {
    setBusy(c.id)
    try {
      const { data } = await api.post(`/api/sis/parent/students/${studentId}/classes`, {
        organization_id: orgId, class_id: c.id,
      })
      if (data.waitlisted) toast.success(`${c.name} is full — added to the waitlist${data.position ? ` (#${data.position})` : ''}`)
      else toast.success(`Added ${c.name}`)
      setGhost(null)
      reload()
      return true
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not add the class')
      return false
    } finally { setBusy(null) }
  }

  const addCourse = async (c) => {
    setBusy(c.id)
    try {
      await api.post(`/api/sis/parent/students/${studentId}/courses`, {
        organization_id: orgId, course_id: c.id,
      })
      toast.success(`Added ${c.title}`)
      reload()
      return true
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not add the course')
      return false
    } finally { setBusy(null) }
  }

  const dropCourse = async (c) => {
    if (!window.confirm(`Drop "${c.title}"? Their progress in its quests is removed.`)) return
    setBusy(c.id)
    try {
      await api.delete(`/api/sis/parent/students/${studentId}/courses/${c.id}?organization_id=${orgId}`)
      toast.success(`Dropped ${c.title}`)
      reload()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not drop the course')
    } finally { setBusy(null) }
  }

  const dropClass = async (c, isWaitlist = false) => {
    const verb = isWaitlist ? `Leave the waitlist for "${c.name || c.class_name}"?` : `Drop "${c.name}"?`
    if (!window.confirm(verb)) return
    setBusy(c.id || c.class_id)
    try {
      await api.delete(`/api/sis/parent/students/${studentId}/classes/${c.id || c.class_id}?organization_id=${orgId}`)
      toast.success(isWaitlist ? 'Left the waitlist' : `Dropped ${c.name}`)
      reload()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not drop the class')
    } finally { setBusy(null) }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-optio-purple" /></div>
  }
  if (!ctx?.orgs?.length) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <h1 className="text-xl font-bold text-neutral-900 mb-2">Schedule Builder</h1>
        <p className="text-neutral-500">No school schedules to manage — this page is for families of schools that use Optio's class scheduling.</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-neutral-900">Schedule Builder</h1>
        <div className="flex items-center gap-2">
          {ctx.orgs.length > 1 && (
            <select className={field} value={orgId || ''} onChange={(e) => {
              setOrgId(e.target.value)
              const o = ctx.orgs.find((x) => x.organization_id === e.target.value)
              setStudentId(o?.students?.[0]?.student_id || null)
            }}>
              {ctx.orgs.map((o) => <option key={o.organization_id} value={o.organization_id}>{o.organization_name}</option>)}
            </select>
          )}
          {students.length > 1 ? (
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white">
              {students.map((s) => (
                <button key={s.student_id} onClick={() => setStudentId(s.student_id)}
                  className={`text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${
                    s.student_id === studentId ? 'bg-optio-purple text-white' : 'text-neutral-600 hover:bg-neutral-50'
                  }`}>
                  {s.name}
                </button>
              ))}
            </div>
          ) : student && <span className="text-sm text-neutral-500">{student.name}</span>}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-neutral-500">
          Build {student ? `${student.name.split(' ')[0]}'s` : 'your student\'s'} week — add, drop, or waitlist classes and see the schedule fill in.
        </p>
        {tuitionCount > 0 && (
          <div className="inline-flex items-baseline gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Estimated tuition</span>
            <span className="text-lg font-bold text-neutral-900">{money(tuitionCents)}</span>
            <span className="text-xs text-neutral-400">{tuitionCount} {tuitionCount === 1 ? 'class' : 'classes'}</span>
          </div>
        )}
      </div>

      {schedule?.registration_hold && (
        <div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          Your family's registration is on hold — please contact {org?.organization_name || 'your school'} to
          resolve it before signing up for classes.
        </div>
      )}
      {!schedule?.registration_hold && schedule?.registration_opens_on && (
        <div className="mb-5 rounded-lg bg-optio-purple/5 border border-optio-purple/20 px-4 py-3 text-sm text-neutral-600">
          Class registration opens for your family on <span className="font-medium text-neutral-800">{fmtDate(schedule.registration_opens_on)}</span>.
          You can browse classes now and sign up once it opens.
        </div>
      )}
      {locked ? (
        <div className="mb-5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          The school year has started{firstDay ? ` (first day was ${fmtDate(firstDay)})` : ''} — schedule changes are now made by
          the school. Contact {org?.organization_name || 'your school'} to add or drop classes.
        </div>
      ) : firstDay ? (
        <div className="mb-5 rounded-lg bg-optio-purple/5 border border-optio-purple/20 px-4 py-3 text-sm text-neutral-600">
          You can make schedule changes until the first day of school, <span className="font-medium text-neutral-800">{fmtDate(firstDay)}</span>.
        </div>
      ) : null}

      {/* Weekly calendar — clicking an open hour filters the catalog to that time */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mb-6">
        <p className="text-xs text-neutral-400 mb-3">
          {enrolled.length === 0 && !ghost
            ? 'No classes yet — click a time to see what\'s offered then, or browse below.'
            : 'Click an open time to see the classes offered then.'}
        </p>
        <WeeklySchedule
          classes={enrolled}
          ghost={ghost}
          selectedSlot={slotFilter}
          onSlotClick={(day, min) => {
            setSlotFilter((f) => (f && f.day === day && f.min === min) ? null : { day, min })
            setCatalogTab('scheduled')
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current schedule — self-start so it hugs its content instead of
            stretching to match the (usually taller) available-classes column */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 self-start">
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">
            {student ? `${student.name.split(' ')[0]}'s classes` : 'Enrolled classes'} ({enrolled.length})
          </h2>
          {enrolled.length === 0 && <p className="text-sm text-neutral-400">Not enrolled in any classes yet.</p>}
          <div className="space-y-2">
            {enrolled.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="font-medium text-neutral-900 truncate">{c.name}</div>
                  <div className="text-xs text-neutral-500">{meetingText(c.meetings)}</div>
                </div>
                <div className="shrink-0 ml-3 flex items-center gap-3">
                  <button onClick={() => setDetail({ type: 'class', item: c, enrolled: true })}
                    className="text-sm text-optio-purple hover:underline">Details</button>
                  {!locked && (
                    <button onClick={() => dropClass(c)} disabled={busy === c.id}
                      className="text-sm text-red-500 hover:underline disabled:opacity-50">Drop</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {homeCourses.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-neutral-700 mt-5 mb-2">At-home learning</h3>
              <div className="space-y-2">
                {homeCourses.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="font-medium text-neutral-900 truncate">{c.title}</div>
                      {c.estimated_hours && <div className="text-xs text-neutral-500">~{c.estimated_hours} hrs</div>}
                    </div>
                    <div className="shrink-0 ml-3 flex items-center gap-3">
                      <button onClick={() => setDetail({ type: 'course', item: c, enrolled: true })}
                        className="text-sm text-optio-purple hover:underline">Details</button>
                      {!locked && (
                        <button onClick={() => dropCourse(c)} disabled={busy === c.id}
                          className="text-sm text-red-500 hover:underline disabled:opacity-50">Drop</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {waitlist.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-neutral-700 mt-5 mb-2">Waitlisted</h3>
              <div className="space-y-2">
                {waitlist.map((w) => (
                  <div key={w.entry_id} className="flex items-center justify-between rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="font-medium text-neutral-900 truncate">{w.class_name}</div>
                      <div className="text-xs text-amber-700">
                        {w.status === 'offered' ? 'Seat offered — the school will confirm with you' : `Waitlist${w.position ? ` #${w.position}` : ''}`}
                        {' · '}{meetingText(w.meetings)}
                      </div>
                    </div>
                    {!locked && (
                      <button onClick={() => dropClass(w, true)} disabled={busy === w.class_id}
                        className="text-sm text-red-500 hover:underline disabled:opacity-50 shrink-0 ml-3">Leave</button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Available classes */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-semibold text-neutral-900">Available classes</h2>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
              className={`${field} w-36 sm:w-44`} />
          </div>

          {courseCatalog.length > 0 && (
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-neutral-50 mb-3">
              <button onClick={() => setCatalogTab('scheduled')}
                className={`text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${catalogTab === 'scheduled' ? 'bg-optio-purple text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}>
                Scheduled classes
              </button>
              <button onClick={() => setCatalogTab('home')}
                className={`text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${catalogTab === 'home' ? 'bg-optio-purple text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}>
                At-home learning
              </button>
            </div>
          )}

          {slotFilter && catalogTab === 'scheduled' && (
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-optio-purple/10 text-optio-purple text-xs font-semibold px-3 py-1">
                Meets {slotLabel(slotFilter)}
                <button onClick={() => setSlotFilter(null)} aria-label="Clear time filter"
                  className="hover:text-optio-pink font-bold leading-none">×</button>
              </span>
            </div>
          )}

          {catalogTab === 'scheduled' && available.length === 0 && (
            <p className="text-sm text-neutral-400">
              {slotFilter
                ? `No open classes meet ${slotLabel(slotFilter)} — pick another time or clear the filter.`
                : 'Nothing else available right now.'}
            </p>
          )}
          {catalogTab === 'home' && availableCourses.length === 0 && (
            <p className="text-sm text-neutral-400">No more at-home courses available.</p>
          )}
          <div className="space-y-2">
            {catalogTab === 'scheduled' && available.map((c) => {
              const conflict = conflictsWith(c, enrolled)
              const full = c.is_full
              return (
                <div key={c.id}
                  onMouseEnter={() => setGhost(c)} onMouseLeave={() => setGhost(null)}
                  className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 hover:border-optio-purple/50 transition-colors">
                  <div className="min-w-0">
                    <div className="font-medium text-neutral-900 truncate">{c.name}</div>
                    <div className="text-xs text-neutral-500">
                      {meetingText(c.meetings)}
                      {money(c.price_cents) ? ` · ${money(c.price_cents)}` : ''}
                      {c.spots_left != null && !full ? ` · ${c.spots_left} spot${c.spots_left === 1 ? '' : 's'} left` : ''}
                    </div>
                    <div className="flex gap-1.5 mt-0.5">
                      {full && <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">Full — waitlist</span>}
                      {conflict && <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-600">Overlaps {conflict}</span>}
                    </div>
                  </div>
                  <button onClick={() => setDetail({ type: 'class', item: c })}
                    className="shrink-0 ml-3 px-3 py-1.5 rounded-lg text-sm font-semibold border border-optio-purple/40 text-optio-purple hover:bg-optio-purple/5 transition-colors">
                    Details
                  </button>
                </div>
              )
            })}
          </div>

          <div className="space-y-2">
            {catalogTab === 'home' && availableCourses.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 hover:border-optio-purple/50 transition-colors">
                <div className="min-w-0">
                  <div className="font-medium text-neutral-900 truncate">{c.title}</div>
                  <div className="text-xs text-neutral-500">
                    {[c.estimated_hours ? `~${c.estimated_hours} hrs` : null,
                      c.age_range ? `ages ${c.age_range}` : null,
                      money(c.tuition_cents)].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <button onClick={() => setDetail({ type: 'course', item: c })}
                  className="shrink-0 ml-3 px-3 py-1.5 rounded-lg text-sm font-semibold border border-optio-purple/40 text-optio-purple hover:bg-optio-purple/5 transition-colors">
                  Details
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {detail && (
        <ClassDetailsModal
          item={detail.item}
          type={detail.type}
          locked={locked}
          busy={busy === detail.item.id}
          conflict={detail.type === 'class' ? conflictsWith(detail.item, enrolled) : null}
          onClose={() => setDetail(null)}
          onAdd={detail.enrolled ? null : async () => {
            const ok = detail.type === 'class' ? await addClass(detail.item) : await addCourse(detail.item)
            if (ok) setDetail(null)
          }}
        />
      )}
    </div>
  )
}

export default ScheduleBuilderPage
