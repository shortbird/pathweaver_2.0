import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg } from './useSisOrg'
import GlassTabBar from '../../components/ui/GlassTabBar'
import ReceivedTranscriptForm from './priorLearning/ReceivedTranscriptForm'
import ExtensionUploadView from './priorLearning/ExtensionUploadView'
import RecordQueue from './priorLearning/RecordQueue'
import StudentQueue from './priorLearning/StudentQueue'
import StudentWorkspace from './priorLearning/StudentWorkspace'
export { default as previewKindFor } from './priorLearning/previewKindFor'
export { default as LOW_CONFIDENCE } from './priorLearning/LOW_CONFIDENCE'
export { default as transcriptRows } from './priorLearning/transcriptRows'
export { default as parseCourseText } from './priorLearning/parseCourseText'
export { default as courseTotal } from './priorLearning/courseTotal'
export { default as creditsFromSuggestion } from './priorLearning/creditsFromSuggestion'
/**
 * Prior Learning review (SIS console).
 *
 * The office's queue of guardian-submitted prior-learning records: what a family
 * says their child already learned, the evidence they attached, and the credit
 * decision. Accepting IS awarding — the two always happen in one thought ("yes,
 * and that's 1.0 math"), so the award boxes live inside the accept action rather
 * than behind a second screen.
 *
 * ADMIN_ROLES on the backend (front-office paperwork, not money), so a campus
 * coordinator runs this alongside registration and attendance.
 *
 * Three steps, deliberately separate, because they are three different
 * decisions and collapsing them is how wrong numbers reach a transcript:
 *
 *   Analyze   the model reads the evidence and PROPOSES a split. It writes
 *             nothing but ai_suggestion. The panel says "suggested" and every
 *             number in it is editable before it counts for anything.
 *   Accept    the office decides it believes the evidence, and awards credit
 *             on the record.
 *   Transcribe the credit becomes a transfer_credits row and moves the
 *             student's XP. This is the only step that touches a transcript,
 *             and it refuses to run twice on one record.
 *
 * "Use these numbers" copies a suggestion into the reviewer's own boxes. It is
 * a copy, not an application — the reviewer still presses Accept, so a
 * confident-but-wrong reading always passes through a person.
 *
 * Two views (2026-10-13). "By student" is the default: a list of students,
 * longest wait first, and one workspace per student with every record, the
 * diploma progress, what is already on the transcript, overlap warnings, a
 * one-step Approve (accept + transcribe) and Send back. "All records" is the
 * status list this page used to be, for questions a student list does not
 * answer ("everything accepted but not transcribed").
 *
 * ?student=<id> opens one student, and ?organization_id= picks the school for
 * a superadmin -- the bell and the morning digest link here that way.
 *
 * The office can also FILE a record here, not only review one. Transcripts
 * arrive at the school directly — mailed, emailed, handed over at enrollment —
 * and before this an admin holding one either sat on it or asked the family to
 * upload a document the school already had. A record filed here opens in review
 * and is otherwise identical to a family's, and documents can be added to any
 * record afterwards, because the second page of a transcript turns up a week
 * late and belongs on the record it belongs on.
 */

const VIEWS = [
  { id: 'students', label: 'By student' },
  { id: 'records', label: 'All records' },
]

const param = (name) => {
  try { return new URLSearchParams(window.location.search).get(name) } catch { return null }
}

const PriorLearningPage = ({ defaultView = null }) => {
  const { orgId, setOrgId, isSuperadmin } = useSisOrg()
  const [view, setView] = useState(() => defaultView || param('view') || 'students')
  const [queue, setQueue] = useState({ students: [], totals: {} })
  const [studentId, setStudentId] = useState(() => param('student'))
  const [disabled, setDisabled] = useState(false)
  const [adding, setAdding] = useState(false)
  const [filedAt, setFiledAt] = useState(null)
  // An extension of Optio Academy uploads and watches; Optio reviews.
  const [optioReviews, setOptioReviews] = useState(false)
  // Which view to show is only known once the first read returns; until then
  // show neither, or an extension school's office sees the review tools flash.
  const [ready, setReady] = useState(false)

  // A superadmin arriving from an alert lands on the school the alert names.
  useEffect(() => {
    const wanted = param('organization_id')
    if (wanted && isSuperadmin && setOrgId && wanted !== orgId) setOrgId(wanted)
  }, [isSuperadmin])

  const loadQueue = useCallback(() => {
    return api.get('/api/sis/prior-learning/queue', { params: { organization_id: orgId || undefined } })
      .then((r) => {
        setQueue({ students: r.data?.students || [], totals: r.data?.totals || {} })
        setOptioReviews(Boolean(r.data?.optio_reviews))
        setDisabled(false)
      })
      .catch((err) => {
        if (err.response?.status === 403) { setDisabled(true); return }
        toast.error('Could not load prior learning records')
      })
      .finally(() => setReady(true))
  }, [orgId])

  useEffect(() => { loadQueue() }, [loadQueue])

  // Open the first student who needs something, so the page starts on work.
  useEffect(() => {
    if (studentId || view !== 'students') return
    const first = queue.students.find((s) => s.needs_action)
    if (first && window.matchMedia?.('(min-width: 1024px)').matches) setStudentId(first.student_id)
  }, [queue.students, studentId, view])

  const forbidden = useCallback(() => setDisabled(true), [])

  // A new record lands in review; follow it there.
  const afterFiling = () => {
    setAdding(false)
    setFiledAt(Date.now())
    loadQueue()
  }

  if (disabled) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-gray-900 font-poppins">Prior Learning</h1>
        <p className="text-sm text-gray-600 mt-2">
          Prior learning records aren’t enabled for this school.
        </p>
      </div>
    )
  }

  if (!ready) return <p className="p-6 text-sm text-gray-500">Loading…</p>
  if (optioReviews) return <ExtensionUploadView orgId={orgId} />

  const totals = queue.totals || {}

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 font-poppins">Prior Learning</h1>
          <p className="text-sm text-gray-600 mt-1">
            {totals.waiting
              ? `${totals.waiting} record${totals.waiting === 1 ? '' : 's'} waiting for review`
              : 'Nothing waiting for review'}
            {totals.not_transcribed ? ` · ${totals.not_transcribed} accepted but not on a transcript` : ''}
            {totals.needs_info ? ` · ${totals.needs_info} with families` : ''}
          </p>
        </div>
        <button type="button" onClick={() => setAdding(true)}
                className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-primary">
          Upload a transcript
        </button>
      </div>

      {adding && (
        <ReceivedTranscriptForm orgId={orgId} onClose={() => setAdding(false)}
                                onFiled={afterFiling} />
      )}

      <GlassTabBar align="start" aria-label="Prior learning views"
                   tabs={VIEWS} active={view} onSelect={setView} />

      {view === 'records' && (
        <RecordQueue orgId={orgId} filedAt={filedAt} onForbidden={forbidden} />
      )}

      {view === 'students' && (
        <div className="grid gap-5 lg:grid-cols-[20rem_1fr] items-start">
          <div className={studentId ? 'hidden lg:block' : ''}>
            <StudentQueue students={queue.students} totals={totals}
                          selectedId={studentId} onSelect={setStudentId} />
          </div>
          <div className={studentId ? '' : 'hidden lg:block'}>
            {studentId ? (
              <>
                <button type="button" onClick={() => setStudentId(null)}
                        className="lg:hidden text-sm text-optio-purple font-medium mb-3">
                  ← All students
                </button>
                <StudentWorkspace key={studentId} orgId={orgId} studentId={studentId} onChanged={loadQueue} />
              </>
            ) : (
              <p className="text-sm text-gray-500 p-4">Choose a student to see their records.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default PriorLearningPage
