/**
 * OEACreditsView - the OEA diploma credit dashboard for one student.
 *
 * Renders overall progress (earned/required, %, foundation/elective split),
 * weighted + unweighted GPA, and a per-requirement breakdown of courses. When
 * editable (parent view), supports adding a course to a requirement slot,
 * editing/grading a course, deleting it, and opening the linked student quest
 * (where work + evidence live). With readOnly (student view) it shows progress
 * and grades only.
 *
 * Web port of frontend-v2/app/(app)/oea/credits.tsx. Fetches its own data so it
 * can back both the parent credits page and the student's self-view.
 */
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { oeaAPI } from '../../services/api'
import ModalOverlay from '../../components/ui/ModalOverlay'
import OEAGradePeriodsModal from './OEAGradePeriodsModal'

const GRADES = ['A', 'B', 'C', 'D', 'F']

// Credit classification. Transfer + earned-elsewhere are entered with a grade and
// no logs/artifacts; direct credits are worked through the linked quest.
const SOURCES = [
  { key: 'direct', label: 'Direct (Optio uploads)' },
  { key: 'transfer', label: 'Transfer credit' },
  { key: 'earned_elsewhere', label: 'Credit earned elsewhere' },
]

function ProgressBar({ percent }) {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div className="h-3 rounded-full bg-neutral-200 overflow-hidden">
      <div className="h-3 rounded-full bg-optio-purple" style={{ width: `${clamped}%` }} />
    </div>
  )
}

// "Sep 30, 2026" from an ISO date, parsed as local (avoids the UTC-midnight
// off-by-one-day that new Date('YYYY-MM-DD') gives in western timezones).
function formatDeadline(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Current-quarter upload checklist for a direct in-progress course, from the
// backend's quarter_compliance (present only while a quarter is open). Items
// check themselves off as the minimums are met; items whose minimum is 0 are
// hidden (an org can zero out any of the three).
function QuarterChecklist({ compliance, deadline }) {
  if (!compliance) return null
  const items = []
  if (compliance.logs_required > 0) {
    items.push({
      done: compliance.logs >= compliance.logs_required,
      label: `Learning logs (${compliance.logs} of ${compliance.logs_required})`,
    })
  }
  if (compliance.artifacts_required > 0) {
    items.push({
      done: compliance.artifacts >= compliance.artifacts_required,
      label: `Work artifacts (${compliance.artifacts} of ${compliance.artifacts_required})`,
    })
  }
  if (compliance.summaries_required > 0) {
    items.push({
      done: compliance.summaries >= compliance.summaries_required,
      label: 'Quarterly summary',
    })
  }
  if (items.length === 0) return null
  const due = formatDeadline(deadline)
  return (
    <div className="mt-2 rounded-lg border border-neutral-100 bg-neutral-50 px-2.5 py-2">
      <p className="text-xs font-semibold text-neutral-500">
        Quarter {compliance.term_index} checklist{due ? ` — due by ${due}` : ''}
      </p>
      <ul className="mt-1 space-y-1">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5">
            {item.done ? (
              <svg className="w-4 h-4 text-green-600 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm4.03-12.47a.75.75 0 10-1.06-1.06L11 12.44l-1.97-1.97a.75.75 0 10-1.06 1.06l2.5 2.5a.75.75 0 001.06 0l4.5-4.5z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-neutral-300 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
              </svg>
            )}
            <span className={`text-xs ${item.done ? 'text-green-700' : 'text-neutral-600'}`}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function GradePill({ credit }) {
  if (credit.status !== 'complete') {
    return (
      <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800 text-xs whitespace-nowrap">
        In progress
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      {credit.is_weighted && (
        <svg className="w-3 h-3 text-amber-600" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
        </svg>
      )}
      <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-semibold whitespace-nowrap">
        {credit.letter_grade ? `Grade ${credit.letter_grade}` : 'Complete'}
      </span>
    </span>
  )
}

export default function OEACreditsView({ studentId, studentName, readOnly = false }) {
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Add-course modal
  const [addFor, setAddFor] = useState(null)
  const [newCourse, setNewCourse] = useState('')
  const [newCredits, setNewCredits] = useState('1')
  const [newSource, setNewSource] = useState('direct')
  const [newGrade, setNewGrade] = useState(null)
  const [newWeighted, setNewWeighted] = useState(false)

  // Grades-by-term modal (per course)
  const [periodsFor, setPeriodsFor] = useState(null)

  // Edit / grade modal
  const [editing, setEditing] = useState(null)
  const [editName, setEditName] = useState('')
  const [editComplete, setEditComplete] = useState(false)
  const [editGrade, setEditGrade] = useState(null)
  const [editWeighted, setEditWeighted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [openingQuest, setOpeningQuest] = useState(false)

  const load = useCallback(async () => {
    if (!studentId) { setLoading(false); return }
    try {
      const { data: res } = await oeaAPI.credits(studentId)
      setData(res)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not load credits.')
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => { load() }, [load])

  const creditsForReq = (key) => (data?.credits || []).filter((c) => c.requirement_key === key)

  const openAdd = (req) => {
    setAddFor(req)
    setNewCourse('')
    setNewCredits('1')
    setNewSource('direct')
    setNewGrade(null)
    setNewWeighted(false)
  }

  const saveAdd = async () => {
    if (!studentId || !addFor || !newCourse.trim() || saving) return
    const nonDirect = newSource !== 'direct'
    if (nonDirect && !newGrade) {
      toast.error('Choose a grade for this transfer course.')
      return
    }
    setSaving(true)
    try {
      await oeaAPI.addCredit(studentId, {
        requirement_key: addFor.key,
        course_name: newCourse.trim(),
        credits: Number(newCredits) || 1,
        credit_source: newSource,
        is_weighted: nonDirect ? newWeighted : false,
        letter_grade: nonDirect ? newGrade : null,
      })
      setAddFor(null)
      await load()
    } catch (err) {
      // Cap breaches (transfer > 6, combined non-direct > 18) surface here.
      toast.error(err.response?.data?.error || 'Could not add the course.')
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (credit) => {
    if (readOnly) return
    setEditing(credit)
    setEditName(credit.course_name)
    setEditComplete(credit.status === 'complete')
    setEditGrade(credit.letter_grade)
    setEditWeighted(credit.is_weighted)
  }

  // Open the quest for this course (work + evidence + journal live there).
  // Parents get ParentQuestView (upload evidence on the student's behalf) —
  // the student route would bounce them to their own dashboard. Students
  // (readOnly self-view) open the quest directly. Creates the quest on first
  // use for credits added before the course-as-quest feature.
  const questPath = (questId) => (
    readOnly ? `/quests/${questId}` : `/parent/quest/${studentId}/${questId}`
  )
  const openQuest = async (credit) => {
    if (openingQuest) return
    if (credit.quest_id) { navigate(questPath(credit.quest_id)); return }
    setOpeningQuest(true)
    try {
      const { data: res } = await oeaAPI.ensureCreditQuest(credit.id)
      if (res?.quest_id) navigate(questPath(res.quest_id))
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not open the quest.')
    } finally {
      setOpeningQuest(false)
    }
  }

  const saveEdit = async () => {
    if (!editing || saving) return
    setSaving(true)
    try {
      await oeaAPI.updateCredit(editing.id, {
        course_name: editName.trim() || editing.course_name,
        status: editComplete ? 'complete' : 'in_progress',
        letter_grade: editComplete ? editGrade : null,
        is_weighted: editWeighted,
      })
      setEditing(null)
      await load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save the course.')
    } finally {
      setSaving(false)
    }
  }

  const deleteEditing = async () => {
    if (!editing || saving) return
    setSaving(true)
    try {
      await oeaAPI.deleteCredit(editing.id)
      setEditing(null)
      await load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not delete the course.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const progress = data?.progress
  const gpa = data?.gpa

  if (!progress) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center">
        <p className="text-sm text-neutral-600 mb-4">
          {readOnly
            ? 'No diploma pathway has been chosen yet. Ask your parent to choose one to start tracking credits.'
            : 'Choose a diploma pathway first to start tracking credits.'}
        </p>
        {!readOnly && (
          <button
            type="button"
            onClick={() => navigate(`/hearthwood/student/${studentId}/pathway`, {
              state: { studentName },
            })}
            className="min-h-[44px] px-5 rounded-lg font-semibold text-white bg-gradient-to-r from-optio-purple to-optio-pink"
          >
            Choose a pathway
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Overall progress + GPA */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        {data?.enrollment?.pathway?.name && (
          <p className="text-xs font-semibold uppercase tracking-wide text-optio-purple mb-2">
            {data.enrollment.pathway.name} diploma plan
          </p>
        )}
        <div className="flex items-end justify-between">
          <span className="text-lg font-bold text-neutral-900">
            {progress.total_earned} of {progress.total_required} credits
          </span>
          <span className="text-sm text-neutral-500">{progress.percent_complete}%</span>
        </div>
        <div className="mt-3">
          <ProgressBar percent={progress.percent_complete} />
        </div>
        <div className="flex justify-between mt-3">
          <span className="text-xs text-neutral-500">
            Foundation {progress.foundation_earned}/{progress.foundation_required}
          </span>
          <span className="text-xs text-neutral-500">
            Elective {progress.elective_earned}/{progress.elective_required}
          </span>
        </div>
        {progress.is_complete && (
          <div className="bg-green-50 border border-green-200 p-2 rounded-lg mt-3">
            <p className="text-sm text-green-800 font-semibold text-center">All requirements met</p>
          </div>
        )}
        <div className="flex justify-around pt-4">
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold text-optio-purple">{gpa?.unweighted ?? '—'}</span>
            <span className="text-xs text-neutral-400">Unweighted GPA</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold text-optio-pink">{gpa?.weighted ?? '—'}</span>
            <span className="text-xs text-neutral-400">Weighted GPA</span>
          </div>
        </div>
      </div>

      {/* Report / transcript links. Credit caps are enforced on the backend; we
          don't surface "X / 6" counters here (they read like a target to fill). */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="flex gap-3">
          <button type="button"
            onClick={() => navigate(`/hearthwood/student/${studentId}/progress-report`, { state: { studentName } })}
            className="text-sm text-optio-purple font-medium">Quarterly report</button>
          <button type="button"
            onClick={() => navigate(`/hearthwood/student/${studentId}/transcript`, { state: { studentName } })}
            className="text-sm text-optio-purple font-medium">Transcript</button>
          {data?.help_video_url && (
            <a href={data.help_video_url} target="_blank" rel="noopener noreferrer"
              className="text-sm text-optio-purple font-medium ml-auto">Watch the tutorial</a>
          )}
        </div>
      </div>

      {/* On-page directions + quarterly minimums (Hearthwood feedback: parents
          need to be told what to do here, and what the program requires). */}
      {!readOnly && (
        <div className="rounded-2xl border border-optio-purple/20 bg-[#F3EFF4] p-4">
          <p className="text-sm text-neutral-700">
            Use this page to enter the courses {studentName || 'your student'} is currently
            working on — select a subject below and add each course. Select a course to
            record grades or add work evidence and learning logs.
          </p>
          {data?.minimums_text && (
            <p className="text-sm text-neutral-700 mt-2">
              Each course needs at least {data.minimums_text} every quarter
              {data?.current_quarter && data?.current_quarter_end
                ? ` — Quarter ${data.current_quarter} ends ${formatDeadline(data.current_quarter_end)}`
                : ''}.
              They don't all have to happen every week — but Hearthwood Academy will
              reach out if a course falls short when the quarter ends.
            </p>
          )}
        </div>
      )}

      {/* Per-requirement breakdown */}
      {progress.requirements.map((req) => {
        const courses = creditsForReq(req.key)
        return (
          <div key={req.key} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    req.category === 'foundation' ? 'bg-optio-purple' : 'bg-optio-pink'
                  }`}
                />
                <span className="font-semibold text-neutral-900">{req.label}</span>
                {req.is_met && (
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <span className="text-sm text-neutral-500">{req.earned}/{req.required}</span>
            </div>

            {courses.map((c) => {
              const RowTag = readOnly ? 'div' : 'button'
              return (
                <RowTag
                  key={c.id}
                  type={readOnly ? undefined : 'button'}
                  onClick={readOnly ? undefined : () => openEdit(c)}
                  className={`w-full flex items-center justify-between py-2 mt-2 border-t border-neutral-100 text-left ${
                    readOnly ? '' : 'hover:bg-neutral-50 -mx-1 px-1 rounded'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-sm text-neutral-700 truncate">{c.course_name}</p>
                    <p className="text-xs text-neutral-400">
                      {c.credits} {c.credits === 1 ? 'credit' : 'credits'}
                    </p>
                    <QuarterChecklist compliance={c.quarter_compliance} deadline={data?.current_quarter_end} />
                  </div>
                  <GradePill credit={c} />
                </RowTag>
              )
            })}

            {!readOnly && (
              <button
                type="button"
                onClick={() => openAdd(req)}
                className="flex items-center gap-1 pt-3 text-sm text-optio-purple font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add course
              </button>
            )}
          </div>
        )
      })}

      {/* Add-course modal */}
      {addFor && (
        <ModalOverlay onClose={() => setAddFor(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-semibold text-neutral-900">Add course — {addFor.label}</h3>

            <label className="block text-sm font-medium text-neutral-700 mt-4 mb-1">Course type</label>
            <select
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              aria-label="Course type"
              className="w-full border border-neutral-300 rounded-lg p-2.5 text-sm"
            >
              {SOURCES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            {newSource === 'earned_elsewhere' && (
              <p className="text-xs text-neutral-500 mt-1">
                Shows on the transcript as "Accepted transfer credit from previous school."
              </p>
            )}

            <label className="block text-sm font-medium text-neutral-700 mt-4 mb-1">Course name</label>
            <input
              value={newCourse}
              onChange={(e) => setNewCourse(e.target.value)}
              placeholder="e.g. Algebra I"
              className="w-full border border-neutral-300 rounded-lg p-2.5 text-sm"
              autoFocus
            />
            <label className="block text-sm font-medium text-neutral-700 mt-4 mb-1">Credits</label>
            <input
              value={newCredits}
              onChange={(e) => setNewCredits(e.target.value)}
              inputMode="decimal"
              className="w-24 border border-neutral-300 rounded-lg p-2.5 text-sm"
            />

            {/* Transfer / earned-elsewhere credits carry a grade (no logs/artifacts). */}
            {newSource !== 'direct' && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-neutral-700 mb-1">Grade</label>
                <div className="flex gap-2">
                  {GRADES.map((g) => (
                    <button key={g} type="button" onClick={() => setNewGrade(g)}
                      className={`flex-1 py-2 rounded-lg border text-sm ${
                        newGrade === g ? 'bg-optio-purple border-optio-purple text-white font-semibold'
                          : 'border-neutral-200 text-neutral-700'
                      }`}>
                      {g}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setNewWeighted((v) => !v)}
                  className="flex items-center gap-2 mt-3">
                  <span className={`w-5 h-5 rounded border flex items-center justify-center ${
                    newWeighted ? 'bg-optio-purple border-optio-purple' : 'border-neutral-300'
                  }`}>
                    {newWeighted && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="text-sm text-neutral-700">Honors / AP / IB (weighted)</span>
                </button>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setAddFor(null)}
                disabled={saving}
                className="min-h-[40px] px-4 rounded-lg border border-neutral-300 text-neutral-700 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveAdd}
                disabled={saving || !newCourse.trim()}
                className="min-h-[40px] px-4 rounded-lg text-white text-sm font-semibold bg-gradient-to-r from-optio-purple to-optio-pink disabled:opacity-60"
              >
                {saving ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Edit / grade modal */}
      {editing && (
        <ModalOverlay onClose={() => setEditing(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-semibold text-neutral-900">Edit course</h3>
            <label className="block text-sm font-medium text-neutral-700 mt-4 mb-1">Course name</label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full border border-neutral-300 rounded-lg p-2.5 text-sm"
            />

            {/* Mark complete */}
            <button
              type="button"
              onClick={() => setEditComplete((v) => !v)}
              className="flex items-center gap-2 mt-4"
            >
              <span className={`w-5 h-5 rounded border flex items-center justify-center ${
                editComplete ? 'bg-optio-purple border-optio-purple' : 'border-neutral-300'
              }`}>
                {editComplete && (
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span className="text-sm text-neutral-700">Mark complete</span>
            </button>

            {/* Grade selector (only when complete) */}
            {editComplete && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-neutral-700 mb-1">Grade</label>
                <div className="flex gap-2">
                  {GRADES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setEditGrade(g)}
                      className={`flex-1 py-2 rounded-lg border text-sm ${
                        editGrade === g
                          ? 'bg-optio-purple border-optio-purple text-white font-semibold'
                          : 'border-neutral-200 text-neutral-700'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>

                {/* Honors / AP / IB */}
                <button
                  type="button"
                  onClick={() => setEditWeighted((v) => !v)}
                  className="flex items-center gap-2 mt-3"
                >
                  <span className={`w-5 h-5 rounded border flex items-center justify-center ${
                    editWeighted ? 'bg-optio-purple border-optio-purple' : 'border-neutral-300'
                  }`}>
                    {editWeighted && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="text-sm text-neutral-700">Honors / AP / IB (weighted)</span>
                </button>
              </div>
            )}

            {/* Grades by term: quarter grades/summaries (report card) + the
                semester/annual transcript grade. */}
            <button
              type="button"
              onClick={() => { setPeriodsFor(editing); setEditing(null) }}
              className="w-full flex items-center justify-between border-t border-neutral-100 pt-4 mt-4 text-left"
            >
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6h13M9 5h13M3 5h.01M3 11h.01M3 17h.01" />
                </svg>
                <span>
                  <span className="block text-sm font-medium text-neutral-900">Grades by term</span>
                  <span className="block text-xs text-neutral-400">Quarter, semester, and annual grades</span>
                </span>
              </span>
              <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Student quest: work, evidence, and journal entries live here, using
                the same flow as any Optio quest. */}
            <button
              type="button"
              onClick={() => editing && openQuest(editing)}
              disabled={openingQuest}
              className="w-full flex items-center justify-between border-t border-neutral-100 pt-4 mt-4 text-left"
            >
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>
                  <span className="block text-sm font-medium text-neutral-900">
                    {openingQuest ? 'Opening...' : 'Add work evidence & learning logs'}
                  </span>
                  <span className="block text-xs text-neutral-400">
                    Opens the course quest — upload documents and videos, and add
                    learning log entries
                  </span>
                </span>
              </span>
              <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <div className="flex items-center justify-between pt-4">
              <button type="button" onClick={deleteEditing} disabled={saving} className="text-sm text-red-600">
                Delete
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  disabled={saving}
                  className="min-h-[40px] px-4 rounded-lg border border-neutral-300 text-neutral-700 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={saving}
                  className="min-h-[40px] px-4 rounded-lg text-white text-sm font-semibold bg-gradient-to-r from-optio-purple to-optio-pink disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Grades by term */}
      {periodsFor && (
        <OEAGradePeriodsModal
          credit={periodsFor}
          onClose={() => setPeriodsFor(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
