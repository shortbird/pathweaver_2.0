import React, { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import { getPillarName } from '../../../utils/pillarMappings'
import GraderFrame from '../../../components/credit-dashboard/grader/GraderFrame'
import GraderEvidence from '../../../components/credit-dashboard/grader/GraderEvidence'
import Kbd from '../../../components/credit-dashboard/grader/Kbd'

/**
 * One submission, the whole screen: the SIS Submissions review in the credit
 * grader's frame (Tanner, 2026-10-15: review submissions "like the
 * credit-review process"). The task and the student's work on the left, read
 * through the credit grader's own evidence cards and feedback thread; the
 * decision on the right, Accept or Grow This, as in the credit grader.
 *
 * The decision is not the credit decision. Accept and Grow This write
 * sis_submission_reviews through /api/sis/submissions (the panel's
 * onDecide), never diploma_status through /api/credit-dashboard, and there is
 * no AI recommendation: the submissions inbox has no AI review to show.
 */

export const timeAgo = (iso) => {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

/** How a review reads on the queue and in the grader. */
/** Shown where a school holds XP until a teacher accepts the work
 *  (sis_settings.require_teacher_acceptance, ticket 536a3018). */
export const ACCEPT_AWARDS_XP = 'Accepting gives the student the XP and puts the work on their portfolio.'

export const REVIEW_LABEL = {
  accepted: 'Accepted',
  grow_this: 'Sent back to grow',
}

/**
 * Inline XP adjustment. Calls PUT /api/sis/completions/<id>/xp (built by the
 * gradebook endpoint) with {xp_value, reason}; hides itself when the endpoint
 * is missing (404/501). `adjustable` is false where the classes module is off:
 * the route is on the engagement blueprint, gated 'classes', and a save there
 * was a ModuleGate "would block" (Apogee Central Florida). The XP still shows.
 */
const XpAdjust = ({ completionId, orgId, xpValue, onChanged, adjustable = true }) => {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(xpValue ?? 0)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [found, setFound] = useState(true)
  const available = found && adjustable

  useEffect(() => {
    setOpen(false)
    setValue(xpValue ?? 0)
    setReason('')
  }, [completionId, xpValue])

  const save = async () => {
    if (!reason.trim()) { toast.error('A reason is required'); return }
    setSaving(true)
    try {
      const { data } = await api.put(`/api/sis/completions/${completionId}/xp`, {
        xp_value: Number(value),
        reason: reason.trim(),
        organization_id: orgId,
      })
      onChanged(data?.xp_value ?? Number(value))
      toast.success('XP updated')
      setOpen(false)
    } catch (e) {
      const status = e.response?.status
      if (status === 404 || status === 501) {
        setFound(false)
        toast.error('XP adjustment is not available')
      } else {
        toast.error(e.response?.data?.error || 'Could not update XP')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <p className="block text-sm font-medium text-gray-700 mb-1.5">XP</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gray-900">{xpValue ?? 0} XP</span>
        {available && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs font-medium text-optio-purple hover:text-optio-purple-dark min-h-[32px] md:min-h-0 touch-manipulation"
          >
            Adjust XP
          </button>
        )}
      </div>
      {available && open && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="New XP value"
            className="w-24 text-base md:text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple px-3 py-2"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
            aria-label="Reason for XP change"
            className="flex-1 min-w-[10rem] text-base md:text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple px-3 py-2"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving || !reason.trim()}
            className="btn-primary"
          >
            {saving ? 'Saving…' : 'Save XP'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="btn-quiet"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The right-hand column: the XP, the note, Accept and Grow This. Keyed on the
 * submission by its parent, so a note never follows the reviewer to the next
 * student. Registers accept / growThis on `decisionRef` so the a and g keys
 * and the buttons go through one code path, as in the credit grader.
 */
const SubmissionDecision = ({ sub, orgId, onDecide, onUnreview, onXpChanged, decisionRef, xpAdjustable, requiresAcceptance = false }) => {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const noteRef = useRef(null)
  const reviewed = !!sub.review

  const decide = async (action) => {
    if (busy || reviewed) return
    const text = note.trim()
    // The credit grader's rule: Grow This without a note focuses the note.
    if (action === 'grow_this' && !text) {
      noteRef.current?.focus()
      toast.error('Write the student a note to send the work back')
      return
    }
    setBusy(true)
    try {
      await onDecide(sub, action, text)
    } finally {
      setBusy(false)
    }
  }

  useImperativeHandle(decisionRef, () => ({
    accept: () => decide('accepted'),
    growThis: () => decide('grow_this'),
  }))

  return (
    <div className="p-4 md:p-5 space-y-5">
      {reviewed ? (
        <section aria-label="Status" className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
          <p className="text-sm text-gray-700">
            <span className="font-semibold text-gray-900">
              {REVIEW_LABEL[sub.review.action] || 'Reviewed'}
            </span>
            {' · '}Reviewed by {sub.review.reviewed_by_name || 'staff'}
            {sub.review.reviewed_at ? ` on ${new Date(sub.review.reviewed_at).toLocaleDateString()}` : ''}
          </p>
          <button
            type="button"
            onClick={() => onUnreview(sub)}
            className="btn-quiet w-full min-h-[44px] text-amber-700 hover:border-amber-300"
          >
            Move back to New
          </button>
        </section>
      ) : (
        <section aria-labelledby="submission-decision-title" className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 id="submission-decision-title" className="text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
              Your decision
            </h3>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <XpAdjust
            completionId={sub.completion_id}
            orgId={orgId}
            xpValue={sub.task?.xp_value}
            onChanged={(xp) => onXpChanged(sub.completion_id, xp)}
            adjustable={xpAdjustable}
          />
          {/* The school holds XP for the accept (ticket 536a3018). */}
          {requiresAcceptance && (
            <p className="text-xs text-gray-500 -mt-2">{ACCEPT_AWARDS_XP}</p>
          )}

          <div>
            <label htmlFor="submission-feedback" className="block text-sm font-medium text-gray-700 mb-1.5">
              Note to student
            </label>
            <textarea
              id="submission-feedback"
              ref={noteRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Feedback for student (required for Grow This)..."
              rows={4}
              className="w-full text-base md:text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple px-3 py-2"
            />
            <p className="mt-1 text-xs text-gray-500">
              The note goes to the student&apos;s feedback conversation on this task.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => decide('accepted')}
              disabled={busy}
              className="btn-primary flex-1 min-h-[44px]"
            >
              <span>Accept</span>
              <Kbd>a</Kbd>
            </button>
            <button
              type="button"
              onClick={() => decide('grow_this')}
              disabled={busy}
              className="btn-quiet flex-1 min-h-[44px] text-orange-700 hover:text-orange-800 hover:border-orange-300"
            >
              <span>Grow This</span>
              <Kbd>g</Kbd>
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

const SubmissionGrader = ({
  sub, orgId, index, total, onPrev, onNext, onExit, onShowShortcuts,
  onDecide, onUnreview, onXpChanged, decisionRef, xpAdjustable = true, requiresAcceptance = false,
}) => {
  const context = [sub.class_name, sub.quest_title].filter(Boolean).join(' · ')
  return (
    <GraderFrame
      label="Submission grader"
      itemKey={sub.completion_id}
      index={index}
      total={total}
      onPrev={onPrev}
      onNext={onNext}
      onExit={onExit}
      onShowShortcuts={onShowShortcuts}
      heading={(
        <>
          <span className="truncate text-sm font-semibold text-gray-900">{sub.student?.name}</span>
          {sub.class_name && (
            <span className="shrink-0 max-w-[10rem] sm:max-w-[16rem] truncate rounded-full bg-optio-purple/10 px-2 py-0.5 text-xs font-medium text-optio-purple">
              <span className="sr-only">Class: </span>
              {sub.class_name}
            </span>
          )}
          {sub.task?.title && (
            <>
              <span className="text-gray-300 hidden sm:inline" aria-hidden="true">·</span>
              <span className="truncate text-sm text-gray-600 hidden sm:inline">{sub.task.title}</span>
            </>
          )}
        </>
      )}
      main={(
        <div className="max-w-3xl space-y-8">
          <section aria-labelledby="submission-task-title" className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-optio-purple mb-1">
                Task
              </p>
              <h2 id="submission-task-title" className="text-xl md:text-2xl font-bold text-gray-900 leading-snug break-words">
                {sub.task?.title || 'Task'}
              </h2>
              {context && <p className="mt-1 text-sm text-gray-500">{context}</p>}
              <p className="mt-0.5 text-sm text-gray-500">
                <span className="font-medium text-gray-700">{sub.student?.name}</span>
                {' '}submitted {timeAgo(sub.completed_at)}
              </p>
            </div>
            {sub.task?.description && (
              <p className="text-sm text-gray-600 whitespace-pre-line">{sub.task.description}</p>
            )}
            {/* Named the way the learner sees it. Printing the raw column
                turned a legacy key like stem_logic into "stem logic", which is
                not a pillar at all. */}
            {sub.task?.pillar && (
              <span className="inline-block text-xs rounded-full bg-optio-purple/10 text-optio-purple px-2 py-0.5">
                {getPillarName(sub.task.pillar)}
              </span>
            )}
          </section>
          <GraderEvidence
            completionId={sub.completion_id}
            evidenceBlocks={sub.evidence_blocks}
            reviewRounds={[]}
            showAi={false}
          />
        </div>
      )}
      aside={(
        <SubmissionDecision
          key={sub.completion_id}
          sub={sub}
          orgId={orgId}
          requiresAcceptance={requiresAcceptance}
          onDecide={onDecide}
          onUnreview={onUnreview}
          onXpChanged={onXpChanged}
          decisionRef={decisionRef}
          xpAdjustable={xpAdjustable}
        />
      )}
    />
  )
}

export default SubmissionGrader
