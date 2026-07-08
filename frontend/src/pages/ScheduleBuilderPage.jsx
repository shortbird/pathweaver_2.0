import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import WeeklySchedule from '../components/schedule/WeeklySchedule'
import ClassDetailsModal, { meetingText, money } from '../components/schedule/ClassDetailsModal'
import { ModalOverlay } from '../components/ui'

// Family Schedule Builder — the weekly calendar IS the interface:
//   - enrolled classes show as colored blocks; click one for details / drop
//   - empty time-block slots are gray "+ Pick a class" boxes; clicking one pops
//     up the classes offered at that time
// Self-service is open until the org's first day of school
// (feature_flags.sis_settings.first_day_of_school); after that, changes are
// staff-only and this page is read-only.
//
// /schedule-builder/preview/:previewCode — staff walkthrough (public route,
// reached from the registration funnel's ?preview=1 final step): the org's real
// open-class catalog and time blocks with a sample student, add/drop simulated
// locally, nothing saved.

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

// A clicked slot on the calendar: f = { day, min, end }.
const SLOT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const fmtHour = (min) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
}
const slotEnd = (f) => f.end || f.min + 60
const slotLabel = (f) => `${SLOT_DAYS[f.day]} ${fmtHour(f.min)}–${fmtHour(slotEnd(f))}`

// The student's age as of a date (first day of school when known — families
// register for the coming year, so "is my kid old enough" is judged then).
const ageOn = (dob, onDate) => {
  if (!dob) return null
  const d = new Date(`${String(dob).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const t = onDate ? new Date(`${onDate}T00:00:00`) : new Date()
  let a = t.getFullYear() - d.getFullYear()
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a -= 1
  return a
}
// Unknown age (no DOB on file) never hides classes.
const fitsAge = (c, age) => age == null
  || ((c.min_age == null || age >= c.min_age) && (c.max_age == null || age <= c.max_age))
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

  // Modals for one child's week don't carry over to another schedule.
  useEffect(() => { setSlotModal(null); setDetail(null) }, [orgId, studentId])

  useEffect(() => {
    if (previewCode) {
      // Staff preview: the org's real catalog with a sample student, no auth.
      api.get(`/api/icreate/schedule-preview/${previewCode}`)
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
          setOrgId(orgs[0].organization_id)
          setStudentId(orgs[0].students?.[0]?.student_id || null)
        }
      })
      .catch(() => toast.error('Could not load your family'))
      .finally(() => setLoading(false))
  }, [previewCode])

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
  }, [orgId, studentId, previewCode])

  useEffect(() => { reload() }, [reload])

  const org = ctx?.orgs?.find((o) => o.organization_id === orgId)
  const students = org?.students || []
  const student = students.find((s) => s.student_id === studentId)
  const locked = !!schedule?.changes_locked
  const firstDay = schedule?.first_day_of_school
  const studentAge = ageOn(student?.date_of_birth, firstDay)

  const enrolled = schedule?.classes || []
  const waitlist = schedule?.waitlist || []
  const enrolledIds = new Set(enrolled.map((c) => c.id))
  const waitlistIds = new Set(waitlist.map((w) => w.class_id))

  // Running tuition total across everything on the schedule (waitlist excluded —
  // those seats aren't confirmed).
  const tuitionCents = enrolled.map((c) => c.price_cents).reduce((sum, v) => sum + (v || 0), 0)
  const tuitionCount = enrolled.length

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

  const dropClass = async (c, isWaitlist = false) => {
    const verb = isWaitlist ? `Leave the waitlist for "${c.name || c.class_name}"?` : `Drop "${c.name}"?`
    if (!window.confirm(verb)) return false
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

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-optio-purple" /></div>
  }
  if (!ctx?.orgs?.length) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <h1 className="text-xl font-bold text-neutral-900 mb-2">Schedule Builder</h1>
        <p className="text-neutral-500">
          {previewCode
            ? 'Could not load the schedule preview — check that the registration link is still active.'
            : "No school schedules to manage — this page is for families of schools that use Optio's class scheduling."}
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {previewCode && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Preview mode</span> — this is the Schedule Builder parents
          use after registering, with your school's real classes and a sample student. Adds and
          drops here aren't saved.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-neutral-900">Schedule Builder</h1>
        <div className="flex items-center gap-2">
          {org?.scheduling_url && (
            <a href={org.scheduling_url} target="_blank" rel="noreferrer"
              className="text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium hover:opacity-90">
              Book appointment
            </a>
          )}
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
          Build {student ? `${student.name.split(' ')[0]}'s` : 'your student\'s'} week — click an open
          slot to pick a class, or a scheduled class to see details.
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
      {(() => {
        const missing = [
          ...(!myAvatar ? [{ id: 'me', name: 'yourself' }] : []),
          ...students.filter((s) => !s.avatar_url).map((s) => ({ id: s.student_id, name: s.name?.split(' ')[0] || 'your student' })),
        ]
        if (!missing.length) return null
        return (
          <div className="mb-5 rounded-lg bg-optio-purple/5 border border-optio-purple/20 px-4 py-3">
            <p className="text-sm font-medium text-neutral-800">Add a photo for each family member</p>
            <p className="text-xs text-neutral-500 mt-0.5 mb-2">
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

      {/* The calendar is the schedule: gray boxes are open slots, colored blocks
          are enrolled classes. */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mb-6">
        <WeeklySchedule
          classes={enrolled}
          timeBlocks={schedule?.time_blocks || []}
          selectedSlot={slotModal}
          onSlotClick={locked ? null : (day, min, end) => setSlotModal({ day, min, end })}
          onClassClick={(c) => setDetail({ item: c, enrolled: true })}
        />

        {waitlist.length > 0 && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-neutral-700 mb-2">Waitlisted</h3>
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
          </div>
        )}

      </div>

      {slotModal && (
        <SlotClassesModal
          slot={slotModal}
          classes={openClasses.filter((c) => meetsAt(c, slotModal) && fitsAge(c, studentAge))}
          age={studentAge}
          enrolled={enrolled}
          busy={busy}
          onClose={() => setSlotModal(null)}
          onDetails={(c) => { setSlotModal(null); setDetail({ item: c }) }}
          onAdd={async (c) => { const ok = await addClass(c); if (ok) setSlotModal(null) }}
        />
      )}

      {detail && (
        <ClassDetailsModal
          item={detail.item}
          type="class"
          locked={locked}
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
        />
      )}
    </div>
  )
}

// Classes offered in the clicked time slot. Rows add directly; "Details" swaps
// to the full read-only class modal.
const SlotClassesModal = ({ slot, classes, age, enrolled, busy, onClose, onDetails, onAdd }) => (
  <ModalOverlay onClose={onClose}>
    <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Classes at {slotLabel(slot)}</h2>
          <p className="text-xs text-neutral-400">
            Pick a class for this time slot.{age != null ? ` Showing classes for age ${age}.` : ''}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
      </div>
      <div className="p-4 pt-2 overflow-y-auto flex-1 space-y-2">
        {classes.length === 0 && (
          <p className="text-sm text-neutral-400 py-4 text-center">
            No open classes{age != null ? ` for age ${age}` : ''} meet at this time — try another slot.
          </p>
        )}
        {classes.map((c) => {
          const conflict = conflictsWith(c, enrolled)
          const full = c.is_full
          return (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 hover:border-optio-purple/50 transition-colors">
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
              <div className="shrink-0 ml-3 flex items-center gap-2">
                <button onClick={() => onDetails(c)} className="text-sm text-optio-purple hover:underline">Details</button>
                <button onClick={() => onAdd(c)} disabled={busy === c.id}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:opacity-90 disabled:opacity-50">
                  {busy === c.id ? 'Adding…' : full ? 'Waitlist' : 'Add'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  </ModalOverlay>
)

export default ScheduleBuilderPage
