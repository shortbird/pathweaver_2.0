import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

/**
 * SIS — Customized Learning Plan (CLP) meeting view.
 *
 * Built for iCreate's CLP meetings: an admin sits with a family, pulls up one
 * kid, and finalizes their schedule live. They search a student, see the classes
 * the kid is registered for on a weekly grid, see every other class available
 * (with open seats + waitlist counts), and enroll / drop / waitlist changes on
 * the spot. "Presentation mode" hides the search + every other family so the
 * screen can be turned toward the parent and child — the per-student payload
 * contains no other student's data by construction.
 *
 * The sub-views are plain render helpers (not nested components) so the DOM tree
 * stays stable across re-renders and doesn't remount mid-interaction.
 */

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DEFAULT_DAYS = [1, 2, 3, 4, 5] // Mon–Fri

const fmtTime = (hhmm) => {
  if (!hhmm) return ''
  const [h, m] = String(hhmm).split(':').map(Number)
  if (Number.isNaN(h)) return ''
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number)
  return Number.isNaN(h) ? null : h * 60 + (m || 0)
}

// Two meetings overlap when they share a weekday and their time ranges intersect.
const meetingsOverlap = (a, b) => {
  if (a.day_of_week == null || b.day_of_week == null) return false
  if (a.day_of_week !== b.day_of_week) return false
  const as = toMinutes(a.start_time)
  const ae = toMinutes(a.end_time)
  const bs = toMinutes(b.start_time)
  const be = toMinutes(b.end_time)
  if (as == null || ae == null || bs == null || be == null) return false
  return as < be && bs < ae
}

// Does any meeting of `cls` overlap any meeting in the enrolled schedule
// (ignoring the class itself)?
const conflictsWithSchedule = (cls, schedule) => {
  const others = schedule.filter((s) => s.class_id !== cls.class_id)
  return cls.meetings.some((m) => others.some((s) => s.meetings.some((sm) => meetingsOverlap(m, sm))))
}

// A short "Mon/Wed 9:00–10:00am" style summary; groups meetings by identical time.
const meetingSummary = (meetings) => {
  const recurring = meetings.filter((m) => m.day_of_week != null && m.start_time)
  if (!recurring.length) {
    const oneOff = meetings.find((m) => m.specific_date)
    return oneOff ? `${oneOff.specific_date} ${fmtTime(oneOff.start_time)}` : 'No set time'
  }
  const byTime = {}
  for (const m of recurring) {
    const key = `${m.start_time}-${m.end_time}`
    ;(byTime[key] = byTime[key] || { days: [], m }).days.push(m.day_of_week)
  }
  return Object.values(byTime)
    .map(({ days, m }) => {
      const label = days.sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join('/')
      return `${label} ${fmtTime(m.start_time)}–${fmtTime(m.end_time)}`
    })
    .join(', ')
}

const priceLabel = (cents) => (cents ? `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}` : null)

const dollars = (n) => `$${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`

// Does this class admit a student of `age`? Unknown ages and unbounded classes pass.
const fitsAge = (cls, age) => {
  if (age == null) return true
  if (cls.min_age != null && age < cls.min_age) return false
  if (cls.max_age != null && age > cls.max_age) return false
  return true
}

const Pill = ({ children, className = '' }) => (
  <span className={`inline-flex items-center text-[11px] font-semibold rounded-full px-2 py-0.5 ${className}`}>{children}</span>
)

const CheckIcon = ({ className = '', label }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor"
    role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
  </svg>
)

const LEARNING_DAY_LABELS = {
  quest_learning_day: 'Quest Learning Day',
  elementary_at_home: 'Elementary At-Home Academic Learning Day',
}

// Seats "3 / 12 · 9 left" or "8 / 8 · Full" or "Unlimited".
const SeatsPill = ({ cls }) => {
  if (cls.capacity == null) return <Pill className="bg-neutral-100 text-neutral-600">Unlimited</Pill>
  if (cls.is_full) return <Pill className="bg-rose-100 text-rose-700">{cls.enrolled_count} / {cls.capacity} · Full</Pill>
  return (
    <Pill className="bg-emerald-100 text-emerald-700">
      {cls.enrolled_count} / {cls.capacity} · {cls.spots_left} left
    </Pill>
  )
}

const ClpPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin, loading: orgLoading } = useSisOrg()

  const [directory, setDirectory] = useState({ families: [], students: [] })
  const [dirLoading, setDirLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [selectedId, setSelectedId] = useState(null)
  const [student, setStudent] = useState(null)
  const [studentLoading, setStudentLoading] = useState(false)

  const [presentation, setPresentation] = useState(false)
  const [classSearch, setClassSearch] = useState('')
  const [fitsOnly, setFitsOnly] = useState(false)
  const [hideFull, setHideFull] = useState(false)
  const [allAges, setAllAges] = useState(false)
  const [timeFocus, setTimeFocus] = useState(null) // { label, day, classId, meetings }
  const [busyId, setBusyId] = useState(null)

  // Staff meeting notes: draft + autosave (debounced; also saved on blur).
  const [notesDraft, setNotesDraft] = useState('')
  const [notesStatus, setNotesStatus] = useState('saved') // saved | dirty | saving
  const notesTimer = useRef(null)

  const [classesOverview, setClassesOverview] = useState([])

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadDirectory = useCallback(() => {
    if (!orgId) { setDirLoading(false); return }
    setDirLoading(true)
    api.get(withOrg('/api/sis/clp/directory', orgId))
      .then((r) => setDirectory({ families: r.data?.families || [], students: r.data?.students || [] }))
      .catch(() => toast.error('Failed to load students'))
      .finally(() => setDirLoading(false))
    // Class-level overview for the landing view (waitlisted + low-enrollment).
    api.get(withOrg('/api/sis/classes', orgId))
      .then((r) => setClassesOverview(r.data?.classes || []))
      .catch(() => setClassesOverview([]))
  }, [orgId])

  useEffect(() => { loadDirectory() }, [loadDirectory])

  // Classes that need staff attention: someone waiting, or under 4 enrolled
  // (at risk of being dropped). Archived classes are excluded server-side.
  const waitlistedClasses = useMemo(
    () => classesOverview.filter((c) => (c.waitlist_count || 0) > 0)
      .sort((a, b) => (b.waitlist_count || 0) - (a.waitlist_count || 0)),
    [classesOverview],
  )
  const lowEnrollmentClasses = useMemo(
    () => classesOverview.filter((c) => (c.enrolled_count ?? 0) < 4)
      .sort((a, b) => (a.enrolled_count ?? 0) - (b.enrolled_count ?? 0)),
    [classesOverview],
  )

  const loadStudent = useCallback((sid) => {
    if (!orgId || !sid) return
    setStudentLoading(true)
    api.get(withOrg(`/api/sis/clp/students/${sid}`, orgId))
      .then((r) => setStudent(r.data))
      .catch(() => { toast.error('Failed to load the student'); setStudent(null) })
      .finally(() => setStudentLoading(false))
  }, [orgId])

  const selectStudent = (sid) => {
    setSelectedId(sid)
    setStudent(null)
    setTimeFocus(null)
    setClassSearch('')
    setAllAges(false)
    loadStudent(sid)
  }

  // Reset the selection only when the org actually CHANGES (superadmin picker) —
  // never on the initial mount, which would wipe a just-made selection.
  const prevOrgId = useRef(orgId)
  useEffect(() => {
    if (prevOrgId.current !== orgId) {
      prevOrgId.current = orgId
      setSelectedId(null); setStudent(null); setTimeFocus(null)
    }
  }, [orgId])

  // Sync the notes draft to the loaded student (and after saves reload it).
  useEffect(() => {
    setNotesDraft(student?.clp_record?.notes || '')
    setNotesStatus('saved')
  }, [selectedId, student?.clp_record?.notes])

  const saveNotes = useCallback(async (text) => {
    if (!selectedId || !orgId) return
    setNotesStatus('saving')
    try {
      await api.patch(withOrg(`/api/sis/clp/students/${selectedId}/record`, orgId), { notes: text })
      setNotesStatus('saved')
    } catch {
      setNotesStatus('dirty')
      toast.error('Could not save the notes')
    }
  }, [selectedId, orgId])

  const onNotesChange = (value) => {
    setNotesDraft(value)
    setNotesStatus('dirty')
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => saveNotes(value), 800)
  }

  // Mark the CLP finished (or reopen it) — reflected as a check in the directory.
  const toggleFinished = async () => {
    const next = !student?.clp_record?.finished
    try {
      await api.patch(withOrg(`/api/sis/clp/students/${selectedId}/record`, orgId), { finished: next })
      toast.success(next ? 'CLP marked finished' : 'CLP reopened')
      loadStudent(selectedId)
      loadDirectory()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not update the CLP')
    }
  }

  // ── Enrollment actions ─────────────────────────────────────────────────────
  const runAction = async (key, fn, successMsg) => {
    setBusyId(key)
    try {
      await fn()
      if (successMsg) toast.success(successMsg)
      loadStudent(selectedId)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Something went wrong')
    } finally {
      setBusyId(null)
    }
  }

  const enroll = (cls) => runAction(
    cls.class_id,
    () => api.post(`/api/sis/classes/${cls.class_id}/enrollments`, { student_user_id: selectedId, organization_id: orgId }),
    `Enrolled in ${cls.name}`,
  )

  const drop = (cls) => runAction(
    cls.class_id,
    () => api.delete(withOrg(`/api/sis/classes/${cls.class_id}/enrollments/${selectedId}`, orgId)),
    `Dropped ${cls.name}`,
  )

  const joinWaitlist = (cls) => runAction(
    cls.class_id,
    () => api.post(`/api/sis/classes/${cls.class_id}/waitlist`, { student_user_id: selectedId, organization_id: orgId }),
    `Added to the waitlist for ${cls.name}`,
  )

  const leaveWaitlist = (cls) => runAction(
    cls.class_id,
    () => api.delete(withOrg(`/api/sis/waitlist/${cls.waitlist_entry_id}`, orgId)),
    `Left the waitlist for ${cls.name}`,
  )

  // ── Derived data ───────────────────────────────────────────────────────────
  const filteredFamilies = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return directory.families
    return directory.families
      .map((f) => {
        const famMatch = (f.name || '').toLowerCase().includes(q)
        const students = famMatch ? f.students : f.students.filter((s) => (s.name || '').toLowerCase().includes(q))
        return students.length ? { ...f, students } : null
      })
      .filter(Boolean)
  }, [directory.families, search])

  const schedule = student?.schedule || []
  const scheduleDays = useMemo(() => {
    const days = new Set(DEFAULT_DAYS)
    for (const c of schedule) for (const m of c.meetings) if (m.day_of_week != null) days.add(m.day_of_week)
    return Array.from(days).sort((a, b) => a - b)
  }, [schedule])

  const studentAge = student?.student?.age ?? null

  const availableClasses = useMemo(() => {
    const all = student?.classes || []
    const q = classSearch.trim().toLowerCase()
    return all
      .filter((c) => !c.is_enrolled) // enrolled classes live in the schedule grid
      .filter((c) => (allAges ? true : fitsAge(c, studentAge))) // age-appropriate by default
      .filter((c) => (q ? (c.name || '').toLowerCase().includes(q) : true))
      .filter((c) => (hideFull ? !c.is_full : true))
      .filter((c) => (fitsOnly ? !conflictsWithSchedule(c, schedule) : true))
      .filter((c) => (timeFocus ? c.meetings.some((m) => timeFocus.meetings.some((fm) => meetingsOverlap(m, fm))) : true))
      .map((c) => ({ ...c, conflicts: conflictsWithSchedule(c, schedule) }))
  }, [student, classSearch, hideFull, fitsOnly, allAges, studentAge, timeFocus, schedule])

  // ── Render helpers (plain functions → stable DOM, no remount) ───────────────
  const renderClassActions = (cls) => {
    const busy = busyId === cls.class_id
    if (cls.is_enrolled) {
      return <Button size="sm" variant="outline" disabled={busy} onClick={() => drop(cls)}>{busy ? '…' : 'Drop'}</Button>
    }
    if (cls.on_waitlist) {
      return (
        <div className="flex items-center gap-2">
          <Pill className="bg-amber-100 text-amber-700">Waitlisted{cls.waitlist_position ? ` #${cls.waitlist_position}` : ''}</Pill>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => leaveWaitlist(cls)}>{busy ? '…' : 'Leave'}</Button>
        </div>
      )
    }
    if (cls.is_full) {
      return <Button size="sm" variant="outline" disabled={busy} onClick={() => joinWaitlist(cls)}>{busy ? '…' : 'Join waitlist'}</Button>
    }
    return <Button size="sm" disabled={busy} onClick={() => enroll(cls)}>{busy ? '…' : 'Enroll'}</Button>
  }

  const renderClassCard = (cls) => (
    <div key={cls.class_id} className="rounded-xl border border-gray-200 bg-white p-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-neutral-900 truncate">{cls.name}</span>
          {cls.conflicts && <Pill className="bg-rose-100 text-rose-700">Time conflict</Pill>}
          {cls.registration_status === 'closed' && <Pill className="bg-neutral-100 text-neutral-500">Registration closed</Pill>}
        </div>
        <div className="text-sm text-neutral-500 mt-0.5">{meetingSummary(cls.meetings)}</div>
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          {cls.primary_instructor?.name && <span className="text-xs text-neutral-500">{cls.primary_instructor.name}</span>}
          <SeatsPill cls={cls} />
          {cls.waitlist_count > 0 && <Pill className="bg-amber-100 text-amber-700">{cls.waitlist_count} waiting</Pill>}
          {priceLabel(cls.price_cents) && <span className="text-xs text-neutral-500">{priceLabel(cls.price_cents)}</span>}
          {Number(cls.supply_fee) > 0 && <span className="text-xs text-neutral-500">{dollars(cls.supply_fee)} supplies</span>}
        </div>
      </div>
      <div className="flex-shrink-0">{renderClassActions(cls)}</div>
    </div>
  )

  const renderScheduleGrid = () => {
    const byDay = {}
    for (const c of schedule) {
      for (const m of c.meetings) {
        if (m.day_of_week == null) continue
        ;(byDay[m.day_of_week] = byDay[m.day_of_week] || []).push({ cls: c, m })
      }
    }
    for (const d of Object.keys(byDay)) byDay[d].sort((a, b) => (toMinutes(a.m.start_time) || 0) - (toMinutes(b.m.start_time) || 0))
    const unscheduled = schedule.filter((c) => !c.meetings.some((m) => m.day_of_week != null))

    // Per-day supply-fee totals — each class counted once per day it meets.
    const supplyByDay = {}
    for (const d of Object.keys(byDay)) {
      const seen = new Set()
      supplyByDay[d] = byDay[d].reduce((sum, { cls }) => {
        if (seen.has(cls.class_id) || !Number(cls.supply_fee)) return sum
        seen.add(cls.class_id)
        return sum + Number(cls.supply_fee)
      }, 0)
    }

    return (
      <div>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${scheduleDays.length}, minmax(0, 1fr))` }}>
          {scheduleDays.map((d) => (
            <div key={d} className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2 text-center">{DAY_LABELS[d]}</div>
              <div className="space-y-2">
                {(byDay[d] || []).map(({ cls, m }, i) => {
                  const focused = timeFocus && timeFocus.classId === cls.class_id && timeFocus.day === d
                  return (
                    <button
                      key={`${cls.class_id}-${i}`}
                      type="button"
                      onClick={() => setTimeFocus(focused ? null : { label: cls.name, day: d, classId: cls.class_id, meetings: cls.meetings })}
                      className={`w-full text-left rounded-lg p-2.5 border transition-colors ${
                        focused
                          ? 'border-optio-purple bg-optio-purple/10 ring-1 ring-optio-purple'
                          : 'border-gray-200 bg-gradient-to-br from-[#F3EFF4] to-white hover:border-optio-purple'
                      }`}
                    >
                      <div className="text-sm font-semibold text-neutral-900 leading-tight">{cls.name}</div>
                      <div className="text-xs text-neutral-500 mt-0.5">{fmtTime(m.start_time)}–{fmtTime(m.end_time)}</div>
                      {cls.primary_instructor?.name && <div className="text-[11px] text-neutral-400 mt-0.5 truncate">{cls.primary_instructor.name}</div>}
                    </button>
                  )
                })}
                {!(byDay[d] || []).length && <div className="text-xs text-neutral-300 text-center py-4">—</div>}
              </div>
              {supplyByDay[d] > 0 && (
                <div className="mt-2 text-[11px] text-neutral-500 text-center border-t border-gray-100 pt-1.5">
                  Supplies: <span className="font-semibold text-neutral-700">{dollars(supplyByDay[d])}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {unscheduled.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">No set meeting time</div>
            <div className="flex flex-wrap gap-2">
              {unscheduled.map((c) => <Pill key={c.class_id} className="bg-[#F3EFF4] text-neutral-700">{c.name}</Pill>)}
            </div>
          </div>
        )}

        {!schedule.length && (
          <p className="text-sm text-neutral-400">Not registered for any classes yet. Add classes from the catalog below.</p>
        )}
      </div>
    )
  }

  const renderStudentDetail = () => {
    if (studentLoading) return <p className="text-neutral-500">Loading student…</p>
    if (!student) {
      return (
        <div>
          <div className="flex items-center justify-center py-10 text-neutral-400 text-center">
            <div>
              <p className="font-medium">Search for a student to begin their learning plan.</p>
              <p className="text-sm mt-1">Their schedule and every available class will appear here.</p>
            </div>
          </div>
          {(waitlistedClasses.length > 0 || lowEnrollmentClasses.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-neutral-900 mb-1">Classes with a waitlist</h3>
                <p className="text-xs text-neutral-400 mb-3">Students waiting for a seat — open the class to offer it.</p>
                {waitlistedClasses.length === 0
                  ? <p className="text-sm text-neutral-400">No classes have a waitlist.</p>
                  : (
                    <ul className="divide-y divide-gray-100">
                      {waitlistedClasses.map((c) => (
                        <li key={c.id} className="py-2 flex items-center justify-between gap-2">
                          <span className="text-sm text-neutral-800 truncate">{c.name}</span>
                          <Pill className="bg-amber-100 text-amber-700 shrink-0">{c.waitlist_count} waiting</Pill>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-neutral-900 mb-1">Low enrollment</h3>
                <p className="text-xs text-neutral-400 mb-3">Fewer than 4 students — may be in danger of being dropped.</p>
                {lowEnrollmentClasses.length === 0
                  ? <p className="text-sm text-neutral-400">Every class has 4 or more students.</p>
                  : (
                    <ul className="divide-y divide-gray-100">
                      {lowEnrollmentClasses.map((c) => (
                        <li key={c.id} className="py-2 flex items-center justify-between gap-2">
                          <span className="text-sm text-neutral-800 truncate">{c.name}</span>
                          <Pill className={`shrink-0 ${(c.enrolled_count ?? 0) === 0 ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700'}`}>
                            {c.enrolled_count ?? 0} enrolled
                          </Pill>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            </div>
          )}
        </div>
      )
    }
    const s = student.student
    return (
      <div>
        {/* Student header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className={`font-bold text-neutral-900 ${presentation ? 'text-3xl' : 'text-2xl'}`}>
              {s.name}
              {s.age != null && <span className="font-normal text-neutral-400"> · {s.age}</span>}
            </h2>
            <div className="text-neutral-500 mt-0.5 text-sm">
              {student.family?.name && <span>{student.family.name}</span>}
            </div>
            {(student.family?.payment_intent?.length > 0 || student.family?.ufa_private) && (
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-xs text-neutral-400">Form of payment:</span>
                {(student.family.payment_intent || []).map((p) => (
                  // A UFA-Private family shows a distinct badge instead of the plain
                  // "Utah Fits All" pill so staff can tell them apart at a glance.
                  p === 'Utah Fits All' && student.family.ufa_private
                    ? <Pill key={p} className="bg-indigo-100 text-indigo-700">UFA · Private School</Pill>
                    : <Pill key={p} className="bg-sky-100 text-sky-700">{p}</Pill>
                ))}
                {student.family.ufa_private && !(student.family.payment_intent || []).includes('Utah Fits All') && (
                  <Pill className="bg-indigo-100 text-indigo-700">UFA · Private School</Pill>
                )}
              </div>
            )}
            {student.learning_day?.choice && (
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-xs text-neutral-400">Learning day:</span>
                <Pill className="bg-violet-100 text-violet-700">
                  {LEARNING_DAY_LABELS[student.learning_day.choice] || student.learning_day.choice}
                </Pill>
              </div>
            )}
            {student.siblings?.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-xs text-neutral-400">Siblings:</span>
                {student.siblings.map((sib) => (
                  <button
                    key={sib.student_id}
                    type="button"
                    onClick={() => selectStudent(sib.student_id)}
                    className="text-xs font-medium rounded-full px-2.5 py-1 bg-[#F3EFF4] text-optio-purple hover:bg-optio-purple/20"
                  >
                    {sib.name}
                    {sib.age != null && <span className="text-optio-purple/60"> · {sib.age}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* CLP finished: visible in presentation too — marking it at the end
              of the meeting, screen still turned to the family, is the flow. */}
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            {student.clp_record?.finished ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                  <CheckIcon className="w-4 h-4" /> CLP finished
                </span>
                <button type="button" onClick={toggleFinished}
                  className="text-xs text-neutral-400 underline hover:text-neutral-600">
                  Reopen
                </button>
              </>
            ) : (
              <Button size="sm" onClick={toggleFinished}>Mark CLP finished</Button>
            )}
          </div>
        </div>

        {/* Staff meeting notes — never rendered in presentation (parent-safe). */}
        {!presentation && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-neutral-900 text-sm">
                Meeting notes <span className="text-xs font-normal text-neutral-400">· staff only</span>
              </h3>
              <span className={`text-xs ${notesStatus === 'dirty' ? 'text-amber-600' : 'text-neutral-400'}`}>
                {notesStatus === 'saving' ? 'Saving…' : notesStatus === 'dirty' ? 'Unsaved' : 'Saved'}
              </span>
            </div>
            <textarea
              rows={3}
              value={notesDraft}
              onChange={(e) => onNotesChange(e.target.value)}
              onBlur={() => { if (notesStatus === 'dirty') saveNotes(notesDraft) }}
              placeholder="Notes from the CLP meeting…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
            />
          </div>
        )}

        {/* Weekly schedule */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-neutral-900">Weekly schedule</h3>
            <span className="text-sm text-neutral-400">{schedule.length} class{schedule.length === 1 ? '' : 'es'}</span>
          </div>
          {renderScheduleGrid()}
        </div>

        {/* Available classes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <h3 className="font-semibold text-neutral-900">
              Available classes
              {studentAge != null && !allAges && (
                <span className="ml-2 text-xs font-normal text-neutral-400">for age {studentAge}</span>
              )}
            </h3>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                value={classSearch}
                onChange={(e) => setClassSearch(e.target.value)}
                placeholder="Search classes…"
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
              />
              <label className="flex items-center gap-1.5 text-sm text-neutral-600">
                <input type="checkbox" checked={fitsOnly} onChange={(e) => setFitsOnly(e.target.checked)}
                  className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                Fits schedule
              </label>
              <label className="flex items-center gap-1.5 text-sm text-neutral-600">
                <input type="checkbox" checked={hideFull} onChange={(e) => setHideFull(e.target.checked)}
                  className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                Hide full
              </label>
              {studentAge != null && (
                <label className="flex items-center gap-1.5 text-sm text-neutral-600">
                  <input type="checkbox" checked={allAges} onChange={(e) => setAllAges(e.target.checked)}
                    className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                  All ages
                </label>
              )}
            </div>
          </div>

          {timeFocus && (
            <div className="flex items-center justify-between gap-3 mb-3 rounded-lg bg-optio-purple/10 border border-optio-purple/30 px-3 py-2">
              <span className="text-sm text-optio-purple font-medium">
                Showing classes that overlap <strong>{timeFocus.label}</strong>’s time
              </span>
              <button onClick={() => setTimeFocus(null)} className="text-sm text-optio-purple hover:underline">Clear</button>
            </div>
          )}

          <div className="space-y-2">
            {availableClasses.map((cls) => renderClassCard(cls))}
            {!availableClasses.length && (
              <p className="text-sm text-neutral-400 py-4 text-center">
                {timeFocus ? 'No other classes meet during this time.' : 'No classes match these filters.'}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderDirectory = () => (
    <div className="w-72 flex-shrink-0">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search students or families…"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple mb-3"
      />
      <div className="bg-white rounded-xl border border-gray-200 max-h-[calc(100vh-220px)] overflow-y-auto">
        {dirLoading && <p className="text-sm text-neutral-400 p-3">Loading…</p>}
        {!dirLoading && !filteredFamilies.length && <p className="text-sm text-neutral-400 p-3">No students found.</p>}
        {filteredFamilies.map((f) => (
          <div key={f.household_id || f.students[0]?.student_id} className="border-b border-gray-100 last:border-b-0">
            <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              {f.name}{f.student_count > 1 ? ` · ${f.student_count}` : ''}
            </div>
            {f.students.map((stu) => (
              <button
                key={stu.student_id}
                type="button"
                onClick={() => selectStudent(stu.student_id)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  selectedId === stu.student_id ? 'bg-optio-purple/10 text-optio-purple font-semibold' : 'text-neutral-700 hover:bg-[#F3EFF4]'
                }`}
              >
                {stu.name}
                {stu.age != null && <span className="text-xs text-neutral-400 ml-1.5">· {stu.age}</span>}
                {stu.grade_level && <span className="text-xs text-neutral-400 ml-1.5">Grade {stu.grade_level}</span>}
                {stu.clp_finished && <CheckIcon className="w-3.5 h-3.5 text-green-500 inline ml-1.5 align-text-bottom" label="CLP finished" />}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )

  // ── Presentation (parent-safe) mode: student only, no directory/search ──────
  if (presentation) {
    return (
      <div className="fixed inset-0 z-50 bg-neutral-50 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <span className="text-sm font-semibold uppercase tracking-wide text-optio-purple">Customized Learning Plan</span>
            <Button size="sm" variant="outline" onClick={() => setPresentation(false)}>Exit presentation</Button>
          </div>
          {selectedId ? renderStudentDetail() : (
            <p className="text-neutral-400 text-center py-16">Select a student before entering presentation mode.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Customized Learning Plan</h1>
          <p className="text-neutral-500 mt-1 text-sm">Search a family’s student, review their schedule, and finalize classes together.</p>
        </div>
        <div className="flex items-center gap-3">
          <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
          <Button size="sm" variant="outline" disabled={!selectedId} onClick={() => setPresentation(true)}>
            Presentation mode
          </Button>
        </div>
      </div>

      {!orgId && !orgLoading && <p className="text-neutral-500">Select an organization to begin.</p>}

      {orgId && (
        <div className="flex gap-6 items-start">
          {renderDirectory()}
          <div className="flex-1 min-w-0">{renderStudentDetail()}</div>
        </div>
      )}
    </div>
  )
}

export default ClpPage
