import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { useConfirm } from '../../contexts/ConfirmContext'
import { matchesPersonSearch } from '../../utils/personSearch'

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
 * The sub-views live in ./clp/ as module-level components. They used to be
 * plain render helpers inside this function, to keep the DOM stable across
 * re-renders; a component declared at module scope has the same property (its
 * identity does not change between renders), so the split cost nothing there.
 * Declaring one INSIDE this function would remount it on every keystroke --
 * that is the mistake the old comment was guarding against.
 */

// QF-02: the directory, the week grid, one class card and the meeting body
// itself each live in ./clp/. They are module-level components rather than
// the render helpers they used to be -- a component defined at module scope
// has a stable identity across renders, so the DOM does not remount
// mid-interaction, which is what the old helpers were protecting.
import { fitsAge, firstSlot, conflictsWithSchedule, meetingsOverlap, DEFAULT_DAYS } from './clp/clpHelpers'
import StudentDirectory from './clp/StudentDirectory'
import StudentDetail from './clp/StudentDetail'

const ClpPage = () => {
  const confirm = useConfirm()
  const { orgId, setOrgId, orgs, isSuperadmin, loading: orgLoading } = useSisOrg()

  const [directory, setDirectory] = useState({ families: [], students: [], counts: null })
  // Directory lens: everyone / CLP still to do / CLP done. iCreate asked for
  // "a list of who has completed their CLP" — same list, filtered, so the
  // picker you already work from answers it.
  const [lens, setLens] = useState('all')
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
      .then((r) => setDirectory({
        families: r.data?.families || [], students: r.data?.students || [],
        counts: r.data?.counts || null,
      }))
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

  const [schoolBusy, setSchoolBusy] = useState(false)

  // Actions on the family's open requests, straight from the meeting screen.
  const enrollFromWaitlist = (w) => runAction(
    w.entry_id,
    () => api.post(`/api/sis/waitlist/${w.entry_id}/enroll`, { organization_id: orgId }),
    `Enrolled in ${w.class_name}`,
  )
  // Hand the family a claimable seat in a section that has room. They know
  // whether that time works; the office doesn't.
  const offerOtherSection = (w, section) => runAction(
    w.entry_id,
    () => api.post(`/api/sis/waitlist/${w.entry_id}/offer-section`,
      { organization_id: orgId, class_id: section.class_id }),
    `${section.name} offered to the family`,
  )

  const removeWaitlistEntry = (w) => runAction(
    w.entry_id,
    () => api.delete(withOrg(`/api/sis/waitlist/${w.entry_id}`, orgId)),
    `Removed from the ${w.class_name} waitlist`,
  )
  const resolveException = (r, action) => runAction(
    r.request_id,
    () => api.post(`/api/sis/age-exception-requests/${r.request_id}/resolve`,
      { action, organization_id: orgId }),
    action === 'approve' ? `Age exception approved for ${r.class_name}` : 'Request declined',
  )

  // School of record, toggled from the meeting screen. Stored on the household,
  // the same field the Families page edits, so the two never disagree.
  const togglePrivateSchool = async () => {
    const hh = student?.family?.household_id
    if (!hh) { toast.error('Group this student into a family first'); return }
    const next = !student.family.enrolled_private_school
    setSchoolBusy(true)
    try {
      await api.patch(`/api/sis/households/${hh}`, {
        enrolled_private_school: next, organization_id: orgId,
      })
      toast.success(next ? `Marked as ${student.family.school_name}` : 'School of record cleared')
      loadStudent(selectedId)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not update the school of record')
    } finally { setSchoolBusy(false) }
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
  // `rethrow` lets a caller handle a specific failure itself (a 409 it wants to
  // confirm and retry) instead of it dying in the generic toast.
  const runAction = async (key, fn, successMsg, { rethrow = false } = {}) => {
    setBusyId(key)
    try {
      await fn()
      if (successMsg) toast.success(successMsg)
      loadStudent(selectedId)
    } catch (e) {
      if (rethrow) throw e
      toast.error(e.response?.data?.error || 'Something went wrong')
    } finally {
      setBusyId(null)
    }
  }

  // Same 409-then-confirm as joinWaitlist: enrolling a student who has no place
  // at the school yet is the stronger version of queuing them for a class.
  const enroll = async (cls, force = false) => {
    try {
      await runAction(
        cls.class_id,
        () => api.post(`/api/sis/classes/${cls.class_id}/enrollments`,
          { student_user_id: selectedId, organization_id: orgId, force }),
        `Enrolled in ${cls.name}`,
        { rethrow: true },
      )
    } catch (e) {
      if (e.response?.status === 409 && e.response.data?.enrollment_waitlisted) {
        if (await confirm(`${e.response.data.error}\n\nEnroll them in ${cls.name} anyway?`)) {
          return enroll(cls, true)
        }
        return
      }
      toast.error(e.response?.data?.error || 'Something went wrong')
    }
  }

  const drop = (cls) => runAction(
    cls.class_id,
    () => api.delete(withOrg(`/api/sis/classes/${cls.class_id}/enrollments/${selectedId}`, orgId)),
    `Dropped ${cls.name}`,
  )

  // Queuing someone for a class while they're still waiting on a place at the
  // school comes back as a 409 and is confirmed before forcing.
  const joinWaitlist = async (cls, force = false) => {
    try {
      await runAction(
        cls.class_id,
        () => api.post(`/api/sis/classes/${cls.class_id}/waitlist`,
          { student_user_id: selectedId, organization_id: orgId, force }),
        `Added to the waitlist for ${cls.name}`,
        { rethrow: true },
      )
    } catch (e) {
      if (e.response?.status === 409 && e.response.data?.enrollment_waitlisted) {
        if (await confirm(
          `${e.response.data.error}\n\nAdd them to the ${cls.name} waitlist anyway?`)) {
          return joinWaitlist(cls, true)
        }
        return
      }
      toast.error(e.response?.data?.error || 'Something went wrong')
    }
  }

  const leaveWaitlist = (cls) => runAction(
    cls.class_id,
    () => api.delete(withOrg(`/api/sis/waitlist/${cls.waitlist_entry_id}`, orgId)),
    `Left the waitlist for ${cls.name}`,
  )

  // ── Derived data ───────────────────────────────────────────────────────────
  const matchesLens = useCallback((s) => {
    if (lens === 'clp_todo') return !s.clp_finished
    if (lens === 'clp_done') return !!s.clp_finished
    return true
  }, [lens])

  // A student renders under ONE name (the nickname replaces the first name), so
  // matching the rendered string alone left the other half unfindable — the
  // office types the legal name off a form and gets nothing back. matchesPersonSearch
  // searches every name the record holds (iCreate, 2026-08-28).
  const filteredFamilies = useMemo(() => {
    const q = search.trim().toLowerCase()
    return directory.families
      .map((f) => {
        const famMatch = !q || (f.name || '').toLowerCase().includes(q)
        const students = f.students
          .filter((s) => famMatch || matchesPersonSearch(s, q))
          .filter(matchesLens)
        return students.length ? { ...f, students, student_count: students.length } : null
      })
      .filter(Boolean)
  }, [directory.families, search, matchesLens])

  const schedule = student?.schedule || []
  const openRequests = student?.open_requests || { waitlist: [], age_exceptions: [] }
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
      // Day, then time, then name. A CLP meeting walks the week in order —
      // "what else is open Tuesday morning?" — and an alphabetical list made
      // staff re-sort it in their heads against the family's schedule
      // (iCreate, 2026-09-02). Classes with no weekly meeting sort last.
      .sort((a, b) => firstSlot(a) - firstSlot(b) || (a.name || '').localeCompare(b.name || ''))
  }, [student, classSearch, hideFull, fitsOnly, allAges, studentAge, timeFocus, schedule])

  const studentDetail = (
    <StudentDetail
      allAges={allAges} setAllAges={setAllAges}
      availableClasses={availableClasses} busyId={busyId}
      classSearch={classSearch} setClassSearch={setClassSearch}
      confirm={confirm} drop={drop} enroll={enroll}
      enrollFromWaitlist={enrollFromWaitlist}
      fitsOnly={fitsOnly} setFitsOnly={setFitsOnly}
      hideFull={hideFull} setHideFull={setHideFull}
      joinWaitlist={joinWaitlist} leaveWaitlist={leaveWaitlist}
      lowEnrollmentClasses={lowEnrollmentClasses}
      notesDraft={notesDraft} notesStatus={notesStatus}
      offerOtherSection={offerOtherSection} onNotesChange={onNotesChange}
      openRequests={openRequests} presentation={presentation}
      removeWaitlistEntry={removeWaitlistEntry} resolveException={resolveException}
      saveNotes={saveNotes} schedule={schedule} scheduleDays={scheduleDays}
      schoolBusy={schoolBusy} selectStudent={selectStudent}
      student={student} studentAge={studentAge} studentLoading={studentLoading}
      timeFocus={timeFocus} setTimeFocus={setTimeFocus}
      toggleFinished={toggleFinished} togglePrivateSchool={togglePrivateSchool}
      waitlistedClasses={waitlistedClasses}
    />
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
          {selectedId ? studentDetail : (
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
          <StudentDirectory
            dirLoading={dirLoading} directory={directory}
            filteredFamilies={filteredFamilies} lens={lens} setLens={setLens}
            search={search} setSearch={setSearch}
            selectStudent={selectStudent} selectedId={selectedId}
          />
          <div className="flex-1 min-w-0">{studentDetail}</div>
        </div>
      )}
    </div>
  )
}

export default ClpPage
