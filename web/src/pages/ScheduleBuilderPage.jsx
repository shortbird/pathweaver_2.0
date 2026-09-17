import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import WeeklySchedule from '../components/schedule/WeeklySchedule'
import ClassDetailsModal, { meetingText } from '../components/schedule/ClassDetailsModal'
import { Spinner } from '../components/ui'
import { useConfirm } from '../contexts/ConfirmContext'
import { useFamilyScope } from '../contexts/FamilyScopeContext'
import StudentClasses from '../components/parent/StudentClasses'

// Family Schedule Builder — the weekly calendar IS the interface:
//   - enrolled classes show as colored blocks; click one for details / drop
//   - empty time-block slots are gray "+ Pick a class" boxes; clicking one pops
//     up the classes offered at that time
// Self-service is open until the org's first day of school
// (feature_flags.sis_settings.first_day_of_school); after that, changes are
// staff-only and this page is read-only. During the school's add/drop window
// (sis_settings.add_drop_deadline) the read-only page still has one action:
// "Request an add/drop", which files a task in the office's Task Center.
//
// Once the year has started the page is a reference, not a builder: no
// running tuition total (that is on the billing page now), no "the school
// year has started" banner, no open-block nags about slots the parent can no
// longer fill. The waitlist, seat offers and add/drop requests stay
// (2026-09-16 parent audit).
//
// /schedule-builder/preview/:previewCode — staff walkthrough (public route,
// reached from the registration funnel's ?preview=1 final step): the org's real
// open-class catalog and time blocks with a sample student, add/drop simulated
// locally, nothing saved.


import UfaRequirementsPanel from './scheduleBuilder/UfaRequirementsPanel'
import SlotClassesModal from './scheduleBuilder/SlotClassesModal'
import AddDropRequestModal from './scheduleBuilder/AddDropRequestModal'
import field from './scheduleBuilder/field'
import fmtDate from './scheduleBuilder/fmtDate'
import DAY_LONG from './scheduleBuilder/DAY_LONG'
import { toMin, fitsAge, ageFromDob, conflictsWith } from '../utils/schedule'
import slotEnd from './scheduleBuilder/slotEnd'
import { formatCents, formatDollars } from '../utils/money'
// The child's age for the year: as of the first day of school, the same
// answer the funnel's waitlist notice, the CLP and the student modal give
// (utils/age.js). Unknown age (no DOB on file) never hides classes.
const ageOn = ageFromDob
// Only called for classes the age filter hid, so at least one bound is set.
const meetsAt = (c, f) => (c.meetings || []).some((m) => {
  if (m.day_of_week !== f.day) return false
  const s = toMin(m.start_time); const e = toMin(m.end_time)
  return s != null && e != null && s < slotEnd(f) && f.min < e
})

// The fake student a staff preview builds a week for. avatar_url is truthy so
// the missing-photo prompt stays hidden; no DOB so age never hides classes.
const PREVIEW_STUDENT = { student_id: 'preview-student', name: 'Casey Sample', avatar_url: 'preview' }

const ScheduleBuilderPage = () => {
  const { previewCode } = useParams()           // staff walkthrough — see header comment
  // ?student=<id> — where a waitlist-offer email or notification lands. Without
  // it the page opened the FIRST child's week, and a parent of two looking for
  // the offered seat found no Claim button (iCreate, 2026-09-02).
  const [searchParams] = useSearchParams()
  const wantedStudent = searchParams.get('student')
  const [ctx, setCtx] = useState(null)          // { orgs: [{organization_id, organization_name, students[]}] }
  const [orgId, setOrgId] = useState(null)
  const [studentId, setStudentId] = useState(null)
  const [schedule, setSchedule] = useState(null) // { classes, waitlist, courses, time_blocks, first_day_of_school, changes_locked }
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)         // class id being added/dropped
  const [slotModal, setSlotModal] = useState(null)   // { day, min, end } — classes offered then
  const [detail, setDetail] = useState(null)     // { item, enrolled }
  const [myAvatar, setMyAvatar] = useState(null)
  const [photoBusy, setPhotoBusy] = useState(null) // student_id or 'me' mid-upload
  const [addDropOpen, setAddDropOpen] = useState(false) // add/drop request modal
  const [myRequests, setMyRequests] = useState([])      // this family's open form submissions
  const confirm = useConfirm()
  // Which child: family scope, picked in the school shell's student rail
  // above this panel (pages/school/SchoolShell). A ?student= link enters
  // scope for that child; the staff preview has no scope and no shell.
  const { selectedChildId, enterScope } = useFamilyScope()

  // Modals for one child's week don't carry over to another schedule.
  useEffect(() => { setSlotModal(null); setDetail(null); setAddDropOpen(false) }, [orgId, studentId])

  useEffect(() => {
    if (previewCode) {
      // Staff preview: the org's real catalog with a sample student, no auth.
      api.get(`/api/registration/schedule-preview/${previewCode}`)
        .then((r) => {
          setCtx({ orgs: [{
            organization_id: 'preview', organization_name: r.data?.organization_name,
            scheduling_url: r.data?.scheduling_url, students: [PREVIEW_STUDENT],
          }] })
          setMyAvatar('preview')
          setOrgId('preview')
          setStudentId(PREVIEW_STUDENT.student_id)
          setSchedule({
            classes: [], waitlist: [], changes_locked: false,
            time_blocks: r.data?.time_blocks || [],
            first_day_of_school: r.data?.first_day_of_school || null,
          })
          setCatalog(r.data?.classes || [])
        })
        .catch((e) => toast.error(e.response?.data?.error || 'Could not load the schedule preview'))
        .finally(() => setLoading(false))
      return
    }
    api.get('/api/sis/parent/context')
      .then((r) => {
        const orgs = r.data?.orgs || []
        setCtx({ orgs })
        setMyAvatar(r.data?.my_avatar_url || null)
        if (orgs.length) {
          const orgOf = (sid) => sid && orgs.find((o) => (o.students || []).some((s) => s.student_id === sid))
          const asked = orgOf(wantedStudent)
          const scoped = orgOf(selectedChildId)
          const org = asked || scoped || orgs[0]
          setOrgId(org.organization_id)
          const sid = asked ? wantedStudent : scoped ? selectedChildId : (orgs[0].students?.[0]?.student_id || null)
          setStudentId(sid)
          if (asked) enterScope(wantedStudent)
        }
      })
      .catch(() => toast.error('Could not load your family'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scope is read once, on load; changes arrive below
  }, [previewCode, wantedStudent])

  // The shell's student rail: follow the scoped child when they are in the
  // org on screen.
  useEffect(() => {
    if (previewCode || !selectedChildId || !ctx) return
    const org = ctx.orgs.find((o) => o.organization_id === orgId)
    if ((org?.students || []).some((s) => s.student_id === selectedChildId)) setStudentId(selectedChildId)
  }, [selectedChildId, ctx, orgId, previewCode])

  // Soft prompt: the school asks every family member to have a photo. Uploads
  // happen inline; nothing is blocked while photos are missing.
  const uploadPhoto = async (studentIdOrMe, file) => {
    setPhotoBusy(studentIdOrMe)
    try {
      const form = new FormData()
      form.append('file', file)
      if (studentIdOrMe === 'me') {
        const { data } = await api.post('/api/sis/parent/photo', form)
        setMyAvatar(data.avatar_url)
      } else {
        form.append('organization_id', orgId)
        const { data } = await api.post(`/api/sis/parent/students/${studentIdOrMe}/photo`, form)
        setCtx((c) => ({
          orgs: (c?.orgs || []).map((o) => ({
            ...o,
            students: (o.students || []).map((s) => (
              s.student_id === studentIdOrMe ? { ...s, avatar_url: data.avatar_url } : s
            )),
          })),
        }))
      }
      toast.success('Photo added')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not upload the photo')
    } finally { setPhotoBusy(null) }
  }

  const reload = useCallback(() => {
    if (previewCode) return // preview state lives in memory only
    if (!orgId || !studentId) return
    api.get(`/api/sis/parent/students/${studentId}/schedule?organization_id=${orgId}`)
      .then((r) => setSchedule(r.data))
      .catch(() => toast.error('Could not load the schedule'))
    api.get(`/api/sis/parent/classes?organization_id=${orgId}`)
      .then((r) => setCatalog(r.data?.classes || []))
      .catch(() => { /* catalog list is supplementary */ })
    // So a family that already asked sees "we have your request" instead of a
    // button that invites them to file the same one again.
    api.get(`/api/sis/parent/forms?organization_id=${orgId}`)
      .then((r) => setMyRequests(r.data?.submissions || []))
      .catch(() => { /* the button still works without this */ })
  }, [orgId, studentId, previewCode])

  useEffect(() => { reload() }, [reload])

  const org = ctx?.orgs?.find((o) => o.organization_id === orgId)
  const students = org?.students || []
  const student = students.find((s) => s.student_id === studentId)
  const locked = !!schedule?.changes_locked
  const firstDay = schedule?.first_day_of_school
  const studentAge = ageOn(student?.date_of_birth, firstDay)
  // The school's add/drop window. Server-computed in the ORG's timezone, so a
  // Sept 8 deadline retires the button at the school's midnight, not the
  // server's. Never in the staff preview: it files a real task.
  // The preview week lives in memory, so its tuition is quoted on demand:
  // the same server quote the family builder receives with its schedule.
  const previewClassKey = previewCode ? (schedule?.classes || []).map((c) => c.id).join(',') : ''
  useEffect(() => {
    if (!previewCode || !schedule) return undefined
    let alive = true
    api.post(`/api/registration/schedule-preview/${previewCode}/quote`, { class_ids: previewClassKey ? previewClassKey.split(',') : [] })
      .then((r) => { if (alive) setSchedule((s) => (s ? { ...s, tuition_quote: r.data?.quote || null } : s)) })
      .catch(() => { /* the preview shows no total rather than a wrong one */ })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewCode, previewClassKey])
  const canRequestAddDrop = !previewCode && !!schedule?.add_drop_open
  const addDropDeadline = schedule?.add_drop_deadline
  const pendingAddDrop = myRequests.find((r) => r.form_type === 'schedule_change'
    && r.status !== 'resolved' && r.student_user_id === studentId)

  const enrolled = schedule?.classes || []
  const waitlist = schedule?.waitlist || []
  // Seats the school has actually offered this child. These live at the top of
  // the page as well as under the calendar: the waitlist strip is below a full
  // week of blocks, and after the first day of school the rest of the page is
  // read-only, so an offer buried down there reads as "there is no button"
  // (iCreate, 2026-09-02).
  const offeredSeats = waitlist.filter((w) => w.status === 'offered')
  // Enrollment age-gate: the student themself is waitlisted (not per-class) —
  // the week renders read-only until the school releases them.
  const enrollmentWaitlist = schedule?.enrollment_waitlist || null
  const enrolledIds = new Set(enrolled.map((c) => c.id))
  const waitlistIds = new Set(waitlist.map((w) => w.class_id))

  // The year's tuition for this week, quoted by the server with the schedule
  // (sis_tuition_service.schedule_quote): block tiers, the UFA flat plan and
  // its 4th-day charge, supplies, the payment plan. The office's invoice
  // records the same lines, so what a family watches here is what they are
  // billed -- the page used to price the week itself and the two disagreed.
  const quote = schedule?.tuition_quote || null
  const totalBlocks = quote?.blocks || 0
  const supplyCents = quote?.supply_cents || 0
  const extraPriceCents = quote?.extra_cents || 0
  const tuitionYearCents = quote?.tuition_cents || 0
  const tuitionNote = quote?.note || null
  const totalYearCents = quote?.total_cents || 0
  const installments = quote?.installments?.count || 0
  const feePct = quote?.installments?.fee_pct || 0
  const perPaymentCents = quote?.installments?.per_payment_cents ?? null
  const ufa = quote?.ufa || null
  const ufaShortfall = ufa?.shortfall || 0
  const tuitionCount = enrolled.length

  // -- UFA private school requirements (3 instructional days, 5 in-person
  // blocks, learning-day choice, 4th-day charge) ---------------------------
  const campusDays = ufa?.campus_days || []
  const learningChoice = schedule?.learning_day?.choice || null
  const programDays = ufa?.program_days || [1, 3]   // Mon/Wed microschool program days
  const includedDays = ufa?.included_days || 3      // instructional days UFA covers
  const hasProgramDay = campusDays.some((d) => programDays.includes(d))
  // The learning day (a recorded choice, not a class) counts toward the 3
  // instructional days but NOT toward the in-person block minimum.
  const totalDays = ufa?.total_days || 0
  const learningDayNeeded = !!ufa && enrolled.length > 0 && campusDays.length < includedDays
  const mustChooseElementary = !hasProgramDay
  // A 4th day isn't covered by the flat tuition: its classes are billed a la
  // carte, and the quote names which day(s) and classes.
  const extraCharge = ufa?.extra
    ? { days: ufa.extra.days, priceCents: ufa.extra.amount_cents, classNames: ufa.extra.class_names }
    : null

  const interactionLocked = locked || !!enrollmentWaitlist

  // Program classes (requires_full_day, e.g. the microschool programs meeting
  // blocks 1 & 5) anchor their meeting days: the student must fill every
  // teaching block on those days with classes.
  const teachingBlocks = (schedule?.time_blocks || []).filter((b) => !b.label)
  const fullDayGaps = enrolled.filter((c) => c.requires_full_day).map((p) => {
    const days = [...new Set((p.meetings || []).map((m) => m.day_of_week))].sort()
    let open = 0
    for (const d of days) {
      for (const b of teachingBlocks) {
        const bs = toMin(b.start); const be = toMin(b.end)
        const covered = enrolled.some((e) => (e.meetings || []).some((m) =>
          m.day_of_week === d && toMin(m.start_time) < be && bs < toMin(m.end_time)))
        if (!covered) open += 1
      }
    }
    return { name: p.name, open, daysText: days.map((d) => DAY_LONG[d]).join(' and ') }
  }).filter((g) => g.open > 0)

  // Daily supply-fee totals under the calendar — each class counted once per
  // day it meets, matching the CLP schedule grid.
  const supplyFooters = useMemo(() => {
    const byDay = {}
    for (const c of enrolled) {
      const fee = Number(c.supply_fee) || 0
      if (!fee) continue
      for (const d of new Set((c.meetings || []).map((m) => m.day_of_week))) {
        if (d != null) byDay[d] = (byDay[d] || 0) + fee
      }
    }
    if (!Object.keys(byDay).length) return null
    const out = {}
    for (const [d, amt] of Object.entries(byDay)) {
      out[d] = (
        <div className="text-[11px] text-gray-500 text-center border-t border-gray-100 pt-1.5">
          Supplies: <span className="font-semibold text-gray-700">{formatDollars(amt)}</span>
        </div>
      )
    }
    return out
  }, [enrolled])

  // An empty teaching block BETWEEN two classes on the same day isn't allowed —
  // students on campus must be in a class every block. Flag the slot + banner.
  const gapSlots = useMemo(() => {
    const out = []
    for (let d = 1; d <= 5; d++) {
      const covered = teachingBlocks.map((b) => {
        const bs = toMin(b.start); const be = toMin(b.end)
        return enrolled.some((c) => (c.meetings || []).some((m) =>
          m.day_of_week === d && toMin(m.start_time) < be && bs < toMin(m.end_time)))
      })
      const first = covered.indexOf(true)
      const last = covered.lastIndexOf(true)
      if (first === -1) continue
      for (let i = first + 1; i < last; i++) {
        if (!covered[i]) {
          out.push({ day: d, min: toMin(teachingBlocks[i].start), end: toMin(teachingBlocks[i].end) })
        }
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrolled, schedule?.time_blocks])
  const gapDaysText = [...new Set(gapSlots.map((g) => g.day))].map((d) => DAY_LONG[d]).join(' and ')

  const openClasses = useMemo(
    () => catalog.filter((c) => !enrolledIds.has(c.id) && !waitlistIds.has(c.id)),
    [catalog, schedule], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const addClass = async (c) => {
    if (previewCode) {
      // Simulate the real add: full classes go to the waitlist, nothing saved.
      if (c.is_full) {
        setSchedule((s) => ({ ...s, waitlist: [...s.waitlist, {
          entry_id: `preview-${c.id}`, class_id: c.id, class_name: c.name,
          position: 1, status: 'waiting', meetings: c.meetings || [],
        }] }))
        toast.success(`${c.name} is full — added to the waitlist (#1)`)
      } else {
        setSchedule((s) => ({ ...s, classes: [...s.classes, c] }))
        toast.success(`Added ${c.name}`)
      }
      return true
    }
    setBusy(c.id)
    try {
      const { data } = await api.post(`/api/sis/parent/students/${studentId}/classes`, {
        organization_id: orgId, class_id: c.id,
      })
      if (data.waitlisted) toast.success(`${c.name} is full — added to the waitlist${data.position ? ` (#${data.position})` : ''}`)
      else toast.success(`Added ${c.name}`)
      reload()
      return true
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not add the class')
      return false
    } finally { setBusy(null) }
  }

  // Ask before dropping, in-app. `window.confirm` looked fine on desktop but is
  // not dependable on iOS: in an in-app WKWebView (a link opened from Gmail,
  // Facebook, Outlook) the dialog never renders and the call returns false, so
  // every drop silently did nothing for families on phones. This was the only
  // silent path in the page — every other outcome here raises a toast, which is
  // why the button looked dead rather than broken.
  const dropClass = async (c, isWaitlist = false) => {
    const name = c.name || c.class_name
    const ok = await confirm(isWaitlist ? {
      title: `Leave the waitlist for ${name}?`,
      body: 'You can rejoin later, but you would go to the back of the waitlist.',
      confirmLabel: 'Yes, leave it',
      cancelLabel: 'Keep it',
    } : {
      title: `Drop ${name}?`,
      body: `This frees up ${name}'s seat and opens the time slot back up. `
        + 'You can add it again while schedule changes are still open.',
      confirmLabel: 'Yes, drop it',
      cancelLabel: 'Keep it',
    })
    if (!ok) return false
    if (previewCode) {
      const id = c.id || c.class_id
      setSchedule((s) => ({ ...s,
        classes: s.classes.filter((x) => x.id !== id),
        waitlist: s.waitlist.filter((w) => w.class_id !== id),
      }))
      toast.success(isWaitlist ? 'Left the waitlist' : `Dropped ${c.name}`)
      return true
    }
    setBusy(c.id || c.class_id)
    try {
      await api.delete(`/api/sis/parent/students/${studentId}/classes/${c.id || c.class_id}?organization_id=${orgId}`)
      toast.success(isWaitlist ? 'Left the waitlist' : `Dropped ${c.name}`)
      reload()
      return true
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not drop the class')
      return false
    } finally { setBusy(null) }
  }

  // Claim a per-class waitlist spot the school offered (status 'offered'). The
  // backend re-checks the offer is live and a seat is still open before enrolling.
  const claimSpot = async (w) => {
    if (previewCode) return
    setBusy(w.class_id)
    try {
      await api.post(`/api/sis/parent/students/${studentId}/classes/${w.class_id}/claim`, {
        organization_id: orgId,
      })
      toast.success(`Enrolled in ${w.class_name}`)
      reload()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not claim the spot')
      reload()
    } finally { setBusy(null) }
  }

  // Ask the school to allow this student into a class its age band excludes.
  // Deliberately low-key (exceptions should stay rare): a quiet footnote in the
  // slot popup, only where the age filter actually hid something.
  const requestException = async (c, message) => {
    setBusy(c.id)
    try {
      const { data } = await api.post('/api/sis/parent/age-exception-requests', {
        organization_id: orgId, student_user_id: studentId, class_id: c.id, message,
      })
      toast.success(data.already
        ? `You already have a request in for ${c.name} — the school will follow up.`
        : `Request sent — ${org?.organization_name || 'the school'} will review it and follow up.`)
      reload()
      return true
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not send the request')
      return false
    } finally { setBusy(null) }
  }

  // Ask the office to add or drop classes for this child, once the year has
  // started and the builder is read-only. It files a parent-tagged submission
  // in the same queue the office already triages (Task Center -> Requests),
  // rather than an email to a person who may be out.
  const submitAddDrop = async ({ drops, adds, note }) => {
    const name = (c) => `${c.name}${meetingText(c.meetings) ? ` (${meetingText(c.meetings)})` : ''}`
    const lines = [
      ...drops.map((c) => `Drop: ${name(c)}`),
      ...adds.map((c) => `Add: ${name(c)}`),
    ]
    if (note.trim()) lines.push('', note.trim())
    setBusy('add-drop')
    try {
      await api.post('/api/sis/parent/forms', {
        organization_id: orgId,
        form_type: 'schedule_change',
        title: `Add/drop — ${student?.name || 'student'}`,
        body: lines.join('\n'),
        student_user_id: studentId,
      })
      toast.success(`Request sent — ${org?.organization_name || 'the office'} will make the change and follow up.`)
      setAddDropOpen(false)
      reload()
      return true
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not send the request')
      return false
    } finally { setBusy(null) }
  }

  // UFA learning-day choice (Quest Learning Day / Elementary At-Home). A
  // recorded choice, not an enrollment; preview mode keeps it in memory.
  const selectLearningDay = async (choice) => {
    if (previewCode) {
      setSchedule((s) => ({ ...s, learning_day: choice ? { choice } : null }))
      return
    }
    setBusy('learning-day')
    try {
      await api.put(`/api/sis/parent/students/${studentId}/learning-day`, {
        organization_id: orgId, choice,
      })
      toast.success(choice ? 'Learning day saved' : 'Learning day cleared')
      reload()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not save the learning day')
    } finally { setBusy(null) }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  }
  if (!ctx?.orgs?.length) {
    // The empty state still needs the way back — a superadmin previewing the
    // school page, or a member without a family here, lands on this branch.
    // Not in preview: that route is public and its viewer has no school page.
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        {previewCode && <h1 className="text-xl font-bold text-gray-900 mb-2">Schedule</h1>}
        <p className="text-gray-500">
          {previewCode
            ? 'Could not load the schedule preview — check that the registration link is still active.'
            : "No school schedules to manage — this page is for families of schools that use Optio's class scheduling."}
        </p>
      </div>
    )
  }

  return (
    <div className={previewCode ? 'max-w-6xl mx-auto px-4 sm:px-6 py-6' : ''}>
      {previewCode && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Preview mode</span> — this is the Schedule page parents
          use after registering, with your school's real classes and a sample student. Adds and
          drops here aren't saved.
        </div>
      )}
      {/* In the school shell (pages/school/SchoolShell) the letterhead, the
          rail and the student picker are above this panel. The staff preview
          is a public route with no shell, and keeps its own heading. */}
      {previewCode && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          {student && <span className="text-sm text-gray-500">{student.name}</span>}
        </div>
      )}
      {ctx.orgs.length > 1 && (
        <div className="flex flex-wrap items-center justify-end gap-2 mb-3">
          <select className={field} value={orgId || ''} onChange={(e) => {
            setOrgId(e.target.value)
            const o = ctx.orgs.find((x) => x.organization_id === e.target.value)
            setStudentId(o?.students?.[0]?.student_id || null)
          }}>
            {ctx.orgs.map((o) => <option key={o.organization_id} value={o.organization_id}>{o.organization_name}</option>)}
          </select>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        {locked ? (
          <p className="text-sm text-gray-500">
            {student ? `${student.name.split(' ')[0]}'s` : 'Your student\'s'} weekly schedule — click a
            class for details.{' '}
            {canRequestAddDrop
              ? 'To add or drop a class, send a request below.'
              : `Contact ${org?.organization_name || 'your school'} to add or drop classes.`}
          </p>
        ) : (
          <p className="text-sm text-gray-500">
            Build {student ? `${student.name.split(' ')[0]}'s` : 'your student\'s'} week — click an open
            slot to pick a class, or a scheduled class to see details.
          </p>
        )}
        {tuitionCount > 0 && !locked && (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-2">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Estimated total</span>
              <span className="text-lg font-bold text-gray-900">
                {formatCents(totalYearCents)}<span className="text-xs font-medium text-gray-400">/yr</span>
              </span>
              {perPaymentCents != null && (
                <span className="text-sm text-gray-500">or {installments} payments of {formatCents(perPaymentCents)}</span>
              )}
              <span className="text-xs text-gray-400">
                {tuitionCount} {tuitionCount === 1 ? 'class' : 'classes'} · {totalBlocks} block{totalBlocks === 1 ? '' : 's'}/wk
                {tuitionNote ? ` · ${tuitionNote}` : ''}
              </span>
            </div>
            {/* UFA families see the full picture: flat tuition + itemized supply
                fees (+ any extra-day classes billed personally). */}
            {ufa ? (
              <p className="text-xs text-gray-400 mt-0.5">
                {formatCents(tuitionYearCents)} UFA tuition
                {supplyCents > 0 ? ` + ${formatCents(supplyCents)} supply fees` : ''}
                {extraPriceCents > 0 ? ` + ${formatCents(extraPriceCents)} extra-day classes (billed to you)` : ''}
                {perPaymentCents != null ? ` The payment plan includes a ${feePct}% convenience fee.` : ''}
              </p>
            ) : (supplyCents > 0 || perPaymentCents != null) && (
              <p className="text-xs text-gray-400 mt-0.5">
                {supplyCents > 0 ? `Includes ${formatCents(supplyCents)} in supply fees.` : ''}
                {perPaymentCents != null ? `${supplyCents > 0 ? ' ' : ''}The payment plan includes a ${feePct}% convenience fee.` : ''}
              </p>
            )}
          </div>
        )}
      </div>

      {ufa && (
        <UfaRequirementsPanel
          ufa={ufa}
          totalBlocks={totalBlocks}
          ufaShortfall={ufaShortfall}
          campusDays={campusDays}
          totalDays={totalDays}
          includedDays={includedDays}
          learningChoice={learningChoice}
          learningDayNeeded={learningDayNeeded}
          mustChooseElementary={mustChooseElementary}
          extraCharge={extraCharge}
          orgName={org?.organization_name || 'the school'}
          locked={interactionLocked}
          busy={busy === 'learning-day'}
          onSelect={selectLearningDay}
        />
      )}
      {!locked && fullDayGaps.map((g) => (
        <div key={g.name} className="mb-5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          {g.name} requires a full day of classes — pick classes for the {g.open} open
          block{g.open === 1 ? '' : 's'} on {g.daysText}.
        </div>
      ))}
      {!locked && gapSlots.length > 0 && (
        <div className="mb-5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          There's an open block between classes on {gapDaysText} — students on campus must be
          in a class every block. Click the highlighted slot to pick a class.
        </div>
      )}
      {/* No DOB = age filtering silently off, so the catalog shows every age's
          classes. Parents can't edit a student's DOB here — the school can. */}
      {!previewCode && student && !student.date_of_birth && (
        <div className="mb-5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          We don't have {student.name?.split(' ')[0] || 'this student'}'s birthdate, so classes
          aren't filtered to their age. Ask {org?.organization_name || 'the school'} to add it.
        </div>
      )}
      {enrollmentWaitlist && (
        <div className="mb-5 rounded-lg bg-optio-purple/5 border border-optio-purple/20 px-4 py-3 text-sm text-gray-700">
          <span className="font-medium text-gray-900">
            {student?.name?.split(' ')[0] || 'This student'} is
            {enrollmentWaitlist.position ? ` #${enrollmentWaitlist.position}` : ''} on the enrollment
            waitlist{enrollmentWaitlist.band_label ? ` for ${enrollmentWaitlist.band_label}` : ''}.
          </span>{' '}
          You'll get an email from {org?.organization_name || 'the school'} as soon as they can
          choose classes — nothing to do until then.
        </div>
      )}
      {schedule?.registration_hold && (
        <div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          Your family's registration is on hold — {schedule?.registration_hold_reason
            ? schedule.registration_hold_reason
            : `please contact ${org?.organization_name || 'your school'} to resolve it before signing up for classes.`}
          {schedule?.registration_hold_reason?.toLowerCase().includes('registration fee') && (
            <> <a href="/enroll/resume" className="font-semibold underline">Finish your registration fee</a>.</>
          )}
        </div>
      )}
      {(() => {
        const missing = [
          ...(!myAvatar ? [{ id: 'me', name: 'yourself' }] : []),
          ...students.filter((s) => !s.avatar_url).map((s) => ({ id: s.student_id, name: s.name?.split(' ')[0] || 'your student' })),
        ]
        if (!missing.length) return null
        return (
          <div className="mb-5 rounded-lg bg-optio-purple/5 border border-optio-purple/20 px-4 py-3">
            <p className="text-sm font-medium text-gray-800">Add a photo for each family member</p>
            <p className="text-xs text-gray-500 mt-0.5 mb-2">
              {org?.organization_name || 'Your school'} asks every family member to have a photo so staff can
              recognize students and parents.
            </p>
            <div className="flex flex-wrap gap-2">
              {missing.map((m) => (
                <label key={m.id}
                  className={`inline-flex items-center px-3 py-1.5 rounded-lg border border-optio-purple/40 text-optio-purple text-sm font-medium cursor-pointer hover:bg-optio-purple/5 ${photoBusy === m.id ? 'opacity-50 pointer-events-none' : ''}`}>
                  {photoBusy === m.id ? 'Uploading…' : `Add a photo of ${m.name}`}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) uploadPhoto(m.id, f)
                      e.target.value = ''
                    }} />
                </label>
              ))}
            </div>
          </div>
        )
      })()}
      {offeredSeats.length > 0 && !previewCode && (
        <div className="mb-5 rounded-lg border border-green-300 bg-green-50 px-4 py-3">
          <div className="text-sm font-semibold text-green-900 mb-1">
            {offeredSeats.length === 1 ? 'A spot is being held' : 'Spots are being held'} for {student?.name || 'your student'}
          </div>
          <p className="text-sm text-green-800 mb-2.5">
            {org?.organization_name || 'The school'} offered {offeredSeats.length === 1 ? 'a seat' : 'seats'} off the waitlist.
            Claim {offeredSeats.length === 1 ? 'it' : 'them'} to enroll — the offer expires if it isn't claimed.
          </p>
          <div className="flex flex-wrap gap-2">
            {offeredSeats.map((w) => (
              <button key={w.entry_id} onClick={() => claimSpot(w)} disabled={busy === w.class_id}
                className="text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg px-3 py-1.5 disabled:opacity-50">
                {busy === w.class_id ? 'Claiming…' : `Claim ${w.class_name}`}
                {meetingText(w.meetings) && (
                  <span className="font-normal text-green-100"> · {meetingText(w.meetings)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      {!locked && firstDay && (
        <div className="mb-5 rounded-lg bg-optio-purple/5 border border-optio-purple/20 px-4 py-3 text-sm text-gray-600">
          You can make schedule changes until the first day of school, <span className="font-medium text-gray-800">{fmtDate(firstDay)}</span>.
        </div>
      )}

      {/* The read-only page's one remaining action. iCreate, 2026-09-01: the
          office wants add/drop asks as tasks they can work, not phone calls. */}
      {canRequestAddDrop && student && (
        pendingAddDrop ? (
          <div className="mb-5 rounded-lg border border-optio-purple/20 bg-optio-purple/5 px-4 py-3 text-sm text-gray-600">
            <span className="font-medium text-gray-800">Your add/drop request is in.</span>{' '}
            {org?.organization_name || 'The school'} will make the change and follow up. Need to
            change something else?{' '}
            <button type="button" onClick={() => setAddDropOpen(true)}
              className="font-medium text-optio-purple hover:underline">
              Send another request
            </button>.
          </div>
        ) : (
          <div className="mb-5 rounded-lg border border-optio-purple/20 bg-optio-purple/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-gray-600">
              <span className="font-medium text-gray-800">Need a different class?</span>{' '}
              Tell {org?.organization_name || 'the school'} what to add or drop and the office will
              make the change.
              {addDropDeadline ? ` Add/drop closes after ${fmtDate(addDropDeadline)}.` : ''}
            </div>
            <button type="button" onClick={() => setAddDropOpen(true)} className="btn-primary shrink-0">
              Request an add/drop
            </button>
          </div>
        )
      )}

      {/* The calendar is the schedule: gray boxes are open slots, colored blocks
          are enrolled classes. */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mb-6">
        <WeeklySchedule
          classes={enrolled}
          timeBlocks={schedule?.time_blocks || []}
          selectedSlot={slotModal}
          flaggedSlots={locked ? [] : gapSlots}
          dayFooters={supplyFooters}
          // Browsable in both states. A locked slot still opens its class
          // list -- read-only, no Add button -- because the catalog is where
          // the description, the age range and "full" live, and a parent who
          // cannot open it has no way to see any of them once the year starts
          // (iCreate 22c43f7c). The add/drop request above is the action.
          onSlotClick={(day, min, end) => setSlotModal({ day, min, end })}
          onClassClick={(c, slot) => setDetail({ item: c, enrolled: true, slot })}
        />

        {waitlist.length > 0 && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Waitlisted</h3>
            <div className="space-y-2">
              {waitlist.map((w) => {
                const offered = w.status === 'offered'
                return (
                <div key={w.entry_id} className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${offered ? 'border-green-300 bg-green-50/60' : 'border-dashed border-amber-300 bg-amber-50/50'}`}>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{w.class_name}</div>
                    <div className={`text-xs ${offered ? 'text-green-700 font-medium' : 'text-amber-700'}`}>
                      {offered ? 'A spot opened — claim it now' : `Waitlist${w.position ? ` #${w.position}` : ''}`}
                      {' · '}{meetingText(w.meetings)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    {offered && !previewCode && (
                      <button onClick={() => claimSpot(w)} disabled={busy === w.class_id}
                        className="text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg px-3 py-1.5 disabled:opacity-50">
                        {busy === w.class_id ? 'Claiming…' : 'Claim spot'}
                      </button>
                    )}
                    {!locked && (
                      <button onClick={() => dropClass(w, true)} disabled={busy === w.class_id}
                        className="text-sm text-red-500 hover:underline disabled:opacity-50">{offered ? 'Decline' : 'Leave'}</button>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          </div>
        )}

      </div>

      {/* The appointment comes after the schedule: the office goes over the
          week with the family at that meeting (registerFunnel/DoneStep says
          so). Until 2026-09-16 the button was the first thing on the page,
          above a schedule that was still empty. */}
      {org?.scheduling_url && (
        <div className="mb-6 rounded-lg border border-optio-purple/20 bg-optio-purple/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            <span className="font-medium text-gray-800">Ready to go over this schedule?</span>{' '}
            Book an appointment with {org.organization_name || 'the school'} and staff will review
            the week with you.
          </div>
          <a href={org.scheduling_url} target="_blank" rel="noreferrer" className="btn-primary shrink-0">
            Book appointment
          </a>
        </div>
      )}

      {/* The child's classes as a list, each opening to what the teacher has
          shared with it, with the printable schedule and the school record
          in its header. This sat on the school's feed page for every child at
          once (2026-09-10 to 2026-09-16); a parent looks for a class on the
          Schedule tab, and the feed is for the feed. */}
      {!previewCode && studentId && (
        <div className="mb-6">
          <StudentClasses studentId={studentId} title="Classes and handouts" />
        </div>
      )}

      {slotModal && (
        <SlotClassesModal
          slot={slotModal}
          classes={openClasses.filter((c) => meetsAt(c, slotModal) && fitsAge(c, studentAge))}
          ageHidden={studentAge == null ? [] : openClasses.filter((c) => meetsAt(c, slotModal) && !fitsAge(c, studentAge))}
          requestedIds={new Set(schedule?.age_exception_requests || [])}
          onRequestException={requestException}
          enrolledHere={enrolled.filter((c) => meetsAt(c, slotModal))}
          age={studentAge}
          enrolled={enrolled}
          busy={busy}
          locked={interactionLocked}
          onClose={() => setSlotModal(null)}
          onDetails={(c, isEnrolled = false) => {
            setSlotModal(null)
            setDetail({ item: c, enrolled: isEnrolled, slot: isEnrolled ? slotModal : undefined })
          }}
          onAdd={async (c) => { const ok = await addClass(c); if (ok) setSlotModal(null) }}
          onDrop={async (c) => { const ok = await dropClass(c); if (ok) setSlotModal(null) }}
        />
      )}

      {addDropOpen && (
        <AddDropRequestModal
          studentName={student?.name}
          orgName={org?.organization_name}
          enrolled={enrolled}
          catalog={openClasses}
          deadline={addDropDeadline}
          busy={busy === 'add-drop'}
          onClose={() => setAddDropOpen(false)}
          onSubmit={submitAddDrop}
        />
      )}

      {detail && (
        <ClassDetailsModal
          item={detail.item}
          type="class"
          locked={interactionLocked}
          busy={busy === detail.item.id}
          conflict={!detail.enrolled ? conflictsWith(detail.item, enrolled) : null}
          onClose={() => setDetail(null)}
          onAdd={detail.enrolled ? null : async () => {
            const ok = await addClass(detail.item)
            if (ok) setDetail(null)
          }}
          onRemove={!detail.enrolled ? null : async () => {
            const ok = await dropClass(detail.item)
            if (ok) setDetail(null)
          }}
          onSeeAlternatives={detail.enrolled && detail.slot
            ? () => { const s = detail.slot; setDetail(null); setSlotModal(s) }
            : null}
        />
      )}
    </div>
  )
}

export default ScheduleBuilderPage
