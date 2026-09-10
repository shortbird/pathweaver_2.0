import React, { useState, useEffect, useRef } from 'react'
import api from '../../services/api'
import EvidenceBlockCard from './EvidenceBlockCard'
import StatusTimeline from './StatusTimeline'
import CreditFeedbackThread from '../credit/CreditFeedbackThread'
import { toast } from 'react-hot-toast'
import { computeEvidenceDiff, summarizeDiff, DIFF_REMOVED } from './evidenceDiff'
import { useConfirm } from '../../contexts/ConfirmContext'
import AiReviewPanel from './AiReviewPanel'
import AiCriteriaChecklist from './AiCriteriaChecklist'
import AiBadge from './AiBadge'
import {
  aiItemSummary,
  evidenceAnchorId,
  latestAi,
  rescaleSubjects,
  resolveEvidenceRef,
  sumSubjects,
} from './aiReview'


const ALL_SUBJECTS = [
  'language_arts', 'math', 'science', 'social_studies',
  'financial_literacy', 'health', 'pe', 'fine_arts',
  'cte', 'digital_literacy', 'electives'
]

const formatSubject = (s) => {
  if (s === 'pe') return 'PE'
  if (s === 'cte') return 'CTE'
  return s.replace(/_/g, ' ')
}

const ItemDetail = ({ item, detail, loading, effectiveRole, onRefresh, onAdvance, onGrowThis, onFeedbackChange, feedbackTextareaRef, onRerunAi, rerunAiLoading, acceptAiRef }) => {
  const confirm = useConfirm()
  const [feedback, setFeedback] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false)
  const [editedSubjects, setEditedSubjects] = useState({})
  // The XP figure the reviewer has accepted from the AI, if any. Null means
  // "the student's claim stands", which is the default and the common case.
  const [appliedXp, setAppliedXp] = useState(null)
  const [highlightedEvidence, setHighlightedEvidence] = useState(null)
  const highlightTimer = useRef(null)
  // The accept-AI handler needs `detail`, which is not available on the early
  // return paths below. Every hook has to run on every render, so the parent's
  // handle is wired here and points at a ref the render body fills in later.
  const acceptAiImpl = useRef(null)

  /**
   * Put a draft in the feedback box, asking first if there is something there.
   *
   * Shared by the "AI Suggest" button and the two drafts on the review panel.
   * Losing typed feedback to a stray click is a small thing that costs a
   * reviewer the sentence they were mid-way through writing.
   */
  const applyDraft = async (draft, { silent = false } = {}) => {
    if (!draft) {
      if (!silent) toast.error('No suggestion returned')
      return false
    }
    if (feedback.trim() && feedback.trim() !== draft.trim() && !silent) {
      const ok = await confirm({
        title: 'Replace what you have written?',
        body: 'Your current feedback will be replaced with the AI draft.',
        confirmLabel: 'Replace',
        cancelLabel: 'Keep mine',
        destructive: false,
      })
      if (!ok) return false
    }
    setFeedback(draft)
    if (onFeedbackChange) onFeedbackChange(draft)
    feedbackTextareaRef?.current?.focus?.()
    return true
  }

  const handleAiSuggest = async () => {
    if (!item) return
    setAiSuggestLoading(true)
    try {
      const res = await api.post(
        `/api/credit-dashboard/items/${item.completion_id}/suggest-feedback`,
        {}
      )
      const draft = res.data?.data?.suggested_feedback || res.data?.suggested_feedback
      await applyDraft(draft)
    } catch (err) {
      toast.error(err.response?.data?.message || 'AI suggestion failed')
    } finally {
      setAiSuggestLoading(false)
    }
  }

  // Keyed on the completion, not on `detail` itself: polling for a running AI
  // review replaces `detail` every few seconds, and resetting on that would
  // discard subject edits the reviewer made while they waited.
  useEffect(() => {
    setEditedSubjects(detail?.suggested_subjects || {})
    setAppliedXp(null)
    setHighlightedEvidence(null)
  }, [detail?.completion?.id])

  useEffect(() => () => clearTimeout(highlightTimer.current), [])

  useEffect(() => {
    if (!acceptAiRef) return undefined
    acceptAiRef.current = () => acceptAiImpl.current?.()
    return () => { acceptAiRef.current = null }
  }, [acceptAiRef])

  if (!item) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm">Select an item to view details</p>
          <p className="text-xs mt-1 text-gray-300">Use j/k to navigate, Enter to select</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
      </div>
    )
  }

  const completion = detail?.completion || {}
  const task = detail?.task || {}
  const quest = detail?.quest || {}
  const student = detail?.student || {}
  const evidenceBlocks = detail?.evidence_blocks || []
  const reviewRounds = detail?.review_rounds || []
  const { diffStatus, removedBlocks, previousById, hasBaseline, baselineRoundNumber } =
    computeEvidenceDiff(evidenceBlocks, reviewRounds)
  const diffCounts = summarizeDiff(diffStatus, removedBlocks)

  const isSuperadmin = effectiveRole === 'superadmin'
  // Superadmins are simultaneously the org approver AND the Optio approver,
  // so we let them act at the pending_org_approval stage. The /org-approve
  // endpoint collapses both stages into a single finalize for superadmins
  // (see backend/routes/credit_dashboard/org_admin_actions.py).
  const isOrgAdmin = effectiveRole === 'org_admin' || isSuperadmin
  const isAdvisor = effectiveRole === 'advisor' || isSuperadmin
  const isOrgStudent = detail?.is_org_student || item?.is_org_student || false
  const canOrgAdminAct = isOrgAdmin && completion.diploma_status === 'pending_org_approval'
  const canAdvisorAct = isAdvisor && completion.diploma_status === 'pending_review'
  const canEditSubjects = canAdvisorAct || canOrgAdminAct

  // The AI review is superadmin-only: the backend omits it entirely for anyone
  // else, so this resolves to a not_run shape and the panel never renders.
  const ai = latestAi(detail)
  const aiReview = ai?.status === 'complete' ? ai.review : null
  const showAi = isSuperadmin && ai?.status && ai.status !== 'not_run'
  const canApplyXp = isSuperadmin && (canAdvisorAct || canOrgAdminAct)
  const readableRefs = (aiReview?.evidence || [])
    .filter(e => e.status === 'read')
    .map(e => e.index)

  const jumpToEvidence = (refIndex) => {
    const blockId = resolveEvidenceRef(refIndex, aiReview, evidenceBlocks)
    if (!blockId) return
    const el = document.getElementById(evidenceAnchorId(blockId))
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    el?.focus?.({ preventScroll: true })
    setHighlightedEvidence(blockId)
    clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlightedEvidence(null), 1600)
  }

  /**
   * Apply the AI's XP figure, or put the student's claim back.
   *
   * Rescaling the subject split here rather than on approve means the reviewer
   * SEES the split they are about to award before they award it. The server
   * recomputes it anyway; showing one number and crediting another is how the
   * two drift.
   */
  const handleApplyXp = (xp) => {
    if (xp == null) {
      setEditedSubjects(detail?.suggested_subjects || {})
      setAppliedXp(null)
      return
    }
    setEditedSubjects(prev => rescaleSubjects(prev, xp))
    setAppliedXp(xp)
  }

  /**
   * The body both approve endpoints take, built once.
   *
   * Returns null when the reviewer's own subject edits no longer add up to the
   * XP they accepted -- the server rejects that too, and catching it here means
   * they find out before the row optimistically disappears from the queue.
   */
  /**
   * The body both approve endpoints take.
   *
   * Everything is passed in rather than read from state, because the
   * take-the-recommendation path decides the feedback and the XP in the same
   * tick it submits them. A React state update does not reach the closure that
   * queued it, so reading state here would have sent an empty note with an
   * approval the reviewer thought carried the AI's.
   */
  const buildApproveBody = ({ note, xp, draftKind, subjects: subjectsIn }) => {
    const subjects = { ...(subjectsIn || editedSubjects) }
    for (const [k, v] of Object.entries(subjects)) {
      if (!v || v <= 0) delete subjects[k]
    }
    const hasSubjects = Object.keys(subjects).length > 0

    if (xp != null && hasSubjects && sumSubjects(subjects) !== xp) {
      toast.error(
        `The subject split adds up to ${sumSubjects(subjects)} XP, not ${xp}.`)
      return null
    }

    return {
      feedback: note || undefined,
      subjects: hasSubjects ? subjects : undefined,
      ...(xp != null && canApplyXp
        ? {
            xp_value: xp,
            xp_reason: aiReview?.xp?.rationale || 'Adjusted during credit review',
          }
        : {}),
      ...(showAi
        ? { ai_accepted: { feedback: draftKind || null, xp: xp != null } }
        : {}),
    }
  }

  /**
   * `post` is passed in rather than an endpoint name.
   *
   * Building the URL here from a variable would hide it from
   * test_client_api_paths_exist, the guard that checks every path the client
   * calls is a route the backend actually serves. Each caller keeps its literal.
   */
  const submitApprove = async (post, successMessage, options = {}) => {
    const body = buildApproveBody({
      note: options.note !== undefined ? options.note : feedback,
      xp: options.xp !== undefined ? options.xp : appliedXp,
      draftKind: options.draftKind,
      subjects: options.subjects,
    })
    if (!body) return
    const completionId = item.completion_id
    setFeedback('')
    if (onAdvance) onAdvance(completionId)
    try {
      await post(completionId, body)
      toast.success(successMessage)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve')
      onRefresh()
    }
  }

  const handleOrgApprove = (options) => submitApprove(
    (id, body) => api.post(`/api/credit-dashboard/items/${id}/org-approve`, body),
    'Approved for Optio review', options)

  const handleOrgGrowThis = async (note) => {
    const savedFeedback = typeof note === 'string' ? note : feedback
    if (!savedFeedback.trim()) {
      toast.error('Feedback is required for Grow This')
      return
    }
    const completionId = item.completion_id
    setFeedback('')
    if (onAdvance) onAdvance(completionId)
    try {
      await api.post(`/api/credit-dashboard/items/${completionId}/org-grow-this`, {
        feedback: savedFeedback,
        ...(showAi ? { ai_accepted: { feedback: note ? 'grow_this' : null } } : {}),
      })
      toast.success('Returned to student')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to return')
      onRefresh()
    }
  }

  const handleApprove = (options) => submitApprove(
    (id, body) => api.post(`/api/credit-dashboard/items/${id}/approve`, body),
    'Credit approved', options)

  const handleGrowThis = async (note) => {
    const savedFeedback = typeof note === 'string' ? note : feedback
    if (!savedFeedback.trim()) {
      toast.error('Feedback is required for Grow This')
      return
    }
    const completionId = item.completion_id
    setFeedback('')
    if (onGrowThis) {
      onGrowThis(completionId, savedFeedback)
    } else if (onAdvance) {
      onAdvance(completionId)
    }
  }

  /**
   * Take the AI's recommendation as written.
   *
   * The one shortcut this feature adds, and it still confirms. It routes to the
   * same two handlers the buttons use, so there is no second code path that
   * could approve something the buttons would not -- and no path at all when the
   * AI declined to judge.
   */
  const handleAcceptAi = async () => {
    if (!aiReview) {
      toast.error('There is no AI verdict for this one')
      return
    }
    const { recommendation, feedback: drafts, xp } = aiReview

    if (recommendation === 'approve') {
      if (!(canAdvisorAct || canOrgAdminAct)) return
      const changingXp = canApplyXp && xp?.changed
      const ok = await confirm({
        title: changingXp
          ? `Approve at ${xp.recommended} XP?`
          : 'Approve with the AI feedback?',
        body: drafts?.celebrate || undefined,
        confirmLabel: 'Approve',
        destructive: false,
      })
      if (!ok) return

      const acceptedXp = changingXp ? xp.recommended : null
      const subjects = acceptedXp != null
        ? rescaleSubjects(editedSubjects, acceptedXp)
        : undefined

      // Reflect the decision on screen as well as in the request, so a failed
      // approval leaves the reviewer looking at what was attempted.
      if (drafts?.celebrate) await applyDraft(drafts.celebrate, { silent: true })
      if (acceptedXp != null) handleApplyXp(acceptedXp)

      const options = {
        note: drafts?.celebrate || '',
        xp: acceptedXp,
        subjects,
        draftKind: drafts?.celebrate ? 'celebrate' : null,
      }
      if (canOrgAdminAct) handleOrgApprove(options)
      else handleApprove(options)
      return
    }

    if (recommendation === 'grow_this') {
      if (!drafts?.grow_this) {
        toast.error('The AI did not draft a note to send back')
        return
      }
      const ok = await confirm({
        title: 'Return this for more?',
        body: drafts.grow_this,
        confirmLabel: 'Send it back',
        destructive: false,
      })
      if (!ok) return
      if (canOrgAdminAct) handleOrgGrowThis(drafts.grow_this)
      else handleGrowThis(drafts.grow_this)
      return
    }

    toast('The AI wants a person to read this one')
  }

  // A plain assignment, not a hook: this runs below the early returns, where a
  // hook would change the hook order between an empty pane and a loaded one.
  acceptAiImpl.current = handleAcceptAi

  return (
    // Leave room at the bottom on mobile for the sticky action bar so the
    // last bit of content (review history, evidence) isn't covered.
    <div className="p-3 md:p-6 space-y-6 pb-32 md:pb-6">
      {/* Header */}
      <div>
        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3 mb-2">
          <h2 className="text-base md:text-lg font-semibold text-gray-900 leading-snug break-words">
            {task.title || 'Unknown Task'}
          </h2>
          <span className="text-sm text-gray-500 shrink-0">
            {appliedXp != null && appliedXp !== item.xp_value ? (
              <>
                <s className="text-gray-400">{item.xp_value} XP</s>{' '}
                <span className="text-gray-900 font-medium">{appliedXp} XP</span>
                <span className="ml-1 text-[10px] text-optio-purple">AI-adjusted</span>
              </>
            ) : (
              `${item.xp_value} XP`
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
          <span>{`${student.first_name || ''} ${student.last_name || ''}`.trim() || student.display_name || 'Student'}</span>
          <span>in</span>
          <span className="font-medium">{quest.title || 'Unknown Quest'}</span>
        </div>
        {task.description && (
          <p className="mt-2 text-sm text-gray-600">{task.description}</p>
        )}
        <AiCriteriaChecklist
          criteria={task.success_criteria}
          aiReview={aiReview}
          onJumpToEvidence={jumpToEvidence}
          readableRefs={readableRefs}
        />
      </div>

      {/* Status Timeline */}
      <StatusTimeline
        diplomaStatus={completion.diploma_status}
        isOrgStudent={isOrgStudent}
        orgReviewerId={completion.org_reviewer_id}
      />

      {showAi && (
        <AiReviewPanel
          ai={ai}
          requestedXp={item.xp_value}
          canApplyXp={canApplyXp}
          appliedXp={appliedXp}
          onApplyXp={handleApplyXp}
          onUseFeedback={(text) => applyDraft(text)}
          onRerun={() => onRerunAi?.(item.completion_id)}
          rerunLoading={rerunAiLoading}
          onJumpToEvidence={jumpToEvidence}
        />
      )}

      {/* Subject Distribution */}
      {(Object.keys(editedSubjects).length > 0 || canEditSubjects) && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">Subject XP Distribution</h3>
            {canEditSubjects && (
              <span className="text-xs text-gray-400">
                Total: {Object.values(editedSubjects).reduce((s, v) => s + (parseInt(v, 10) || 0), 0)} XP
              </span>
            )}
          </div>
          {canEditSubjects ? (
            <div className="space-y-2 md:max-w-sm">
              {Object.entries(editedSubjects).map(([subject, xp]) => (
                <div key={subject} className="flex items-center gap-2">
                  <select
                    value={subject}
                    onChange={(e) => {
                      const newKey = e.target.value
                      if (newKey === subject) return
                      if (editedSubjects[newKey] !== undefined) {
                        // Merge into existing subject
                        setEditedSubjects(prev => {
                          const next = { ...prev }
                          next[newKey] = (parseInt(next[newKey], 10) || 0) + (parseInt(next[subject], 10) || 0)
                          delete next[subject]
                          return next
                        })
                      } else {
                        setEditedSubjects(prev => {
                          const next = {}
                          for (const [k, v] of Object.entries(prev)) {
                            next[k === subject ? newKey : k] = v
                          }
                          return next
                        })
                      }
                    }}
                    // 16px on mobile to avoid iOS auto-zoom on focus.
                    className="flex-1 min-w-0 text-base md:text-sm rounded border-gray-300 focus:ring-optio-purple focus:border-optio-purple capitalize py-2 md:py-1"
                  >
                    {ALL_SUBJECTS.map(s => (
                      <option key={s} value={s} className="capitalize">{formatSubject(s)}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    inputMode="numeric"
                    value={xp}
                    onChange={(e) => setEditedSubjects(prev => ({ ...prev, [subject]: parseInt(e.target.value, 10) || 0 }))}
                    className="w-20 md:w-24 text-base md:text-sm text-right rounded border-gray-300 focus:ring-optio-purple focus:border-optio-purple py-2 md:py-1"
                  />
                  <span className="text-xs text-gray-400 w-6 shrink-0">XP</span>
                  <button
                    onClick={() => setEditedSubjects(prev => {
                      const next = { ...prev }
                      delete next[subject]
                      return next
                    })}
                    className="p-2 md:p-1 -mr-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded touch-manipulation"
                    title="Remove subject"
                    aria-label={`Remove ${subject}`}
                  >
                    <svg className="w-5 h-5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {/* Add subject button */}
              {Object.keys(editedSubjects).length < ALL_SUBJECTS.length && (
                <button
                  onClick={() => {
                    const unused = ALL_SUBJECTS.find(s => editedSubjects[s] === undefined)
                    if (unused) setEditedSubjects(prev => ({ ...prev, [unused]: 0 }))
                  }}
                  className="flex items-center gap-1 text-sm md:text-xs text-optio-purple hover:text-optio-pink mt-2 md:mt-1 min-h-[36px] md:min-h-0 touch-manipulation"
                >
                  <svg className="w-4 h-4 md:w-3.5 md:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add subject
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(editedSubjects).map(([subject, xp]) => (
                <div key={subject} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded text-sm">
                  <span className="text-gray-700 capitalize">{formatSubject(subject)}</span>
                  <span className="font-medium text-gray-900">{xp} XP</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Evidence Blocks */}
      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="text-sm font-medium text-gray-700">
            Evidence ({evidenceBlocks.length} block{evidenceBlocks.length === 1 ? '' : 's'})
          </h3>
          {hasBaseline && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-500">
                vs. Round {baselineRoundNumber}:
              </span>
              {diffCounts.added > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                  +{diffCounts.added} new
                </span>
              )}
              {diffCounts.modified > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-medium">
                  {diffCounts.modified} modified
                </span>
              )}
              {diffCounts.removed > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 font-medium">
                  −{diffCounts.removed} removed
                </span>
              )}
              {diffCounts.added === 0 && diffCounts.modified === 0 && diffCounts.removed === 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                  No changes
                </span>
              )}
            </div>
          )}
        </div>
        {evidenceBlocks.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No evidence blocks</p>
        ) : (
          <div className="space-y-3">
            {evidenceBlocks.map((block, i) => (
              <EvidenceBlockCard
                key={block.id || i}
                block={block}
                diffType={diffStatus[block.id]}
                previousBlock={previousById[block.id]}
                anchorId={block.id ? evidenceAnchorId(block.id) : undefined}
                highlighted={highlightedEvidence === block.id}
              />
            ))}
          </div>
        )}
        {removedBlocks.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-500 mb-2">
              Removed since Round {baselineRoundNumber} ({removedBlocks.length})
            </p>
            <div className="space-y-3">
              {removedBlocks.map((block, i) => (
                <EvidenceBlockCard
                  key={block.id || `removed-${i}`}
                  block={block}
                  diffType={DIFF_REMOVED}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Review History */}
      {reviewRounds.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Review History</h3>
          <div className="space-y-2">
            {reviewRounds.map((round, i) => (
              <div key={round.id || i} className="text-xs p-2 bg-gray-50 rounded">
                <div className="flex justify-between items-center gap-2">
                  <span className="font-medium">Round {round.round_number} - {round.reviewer_action || 'pending'}</span>
                  <span className="flex items-center gap-2">
                    {isSuperadmin && detail?.ai_by_round?.[round.id] && (
                      <AiBadge size="xs" {...aiItemSummary(detail.ai_by_round[round.id])} />
                    )}
                    <span className="text-gray-400">{round.reviewed_at ? new Date(round.reviewed_at).toLocaleDateString() : ''}</span>
                  </span>
                </div>
                {round.reviewer_feedback && (
                  <p className="text-gray-600 mt-1">{round.reviewer_feedback}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two-way feedback thread with the student */}
      {item?.completion_id && <CreditFeedbackThread completionId={item.completion_id} />}

      {/* Action panel. On mobile this sticks to the bottom of the scrolling
          detail panel so the reviewer can always reach Approve / Grow This
          without scrolling back up past the evidence. Negative margins +
          padding break out of the parent's p-3 so the white background spans
          the full panel width on mobile. */}
      {canOrgAdminAct && (
        <div className="md:static sticky bottom-0 z-10 bg-white border-t border-gray-200 pt-3 pb-3 md:pb-0 space-y-3 -mx-3 px-3 md:mx-0 md:px-0">
          {!isSuperadmin && (
            <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              Your school reviews this request first. Approving sends it to Optio
              for final credit approval — credit is awarded once Optio approves.
              Use Grow This to return it to the student with feedback instead.
            </p>
          )}
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-600">
              Feedback for student
            </label>
            <button
              type="button"
              onClick={handleAiSuggest}
              disabled={aiSuggestLoading || actionLoading}
              className="text-sm md:text-xs text-optio-purple hover:text-optio-pink disabled:opacity-50 disabled:cursor-not-allowed py-1 px-1 touch-manipulation"
              title="Draft Grow This feedback with AI based on the student's submission"
            >
              {aiSuggestLoading ? 'Drafting…' : 'Suggest with AI'}
            </button>
          </div>
          <textarea
            ref={feedbackTextareaRef}
            value={feedback}
            onChange={e => {
              setFeedback(e.target.value)
              if (onFeedbackChange) onFeedbackChange(e.target.value)
            }}
            placeholder="Feedback for student (required for Grow This)..."
            rows={3}
            className="w-full text-base md:text-sm rounded-lg border border-gray-300 focus:ring-optio-purple focus:border-optio-purple px-4 py-3"
          />
          <div className="flex flex-col md:flex-row gap-2">
            <button
              onClick={() => handleOrgApprove()}
              disabled={actionLoading}
              className="w-full md:w-auto px-4 py-3 md:py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 min-h-[44px] touch-manipulation"
            >
              {actionLoading
                ? 'Processing...'
                : isSuperadmin
                  ? 'Approve'
                  : 'Approve for Optio Review'}
            </button>
            <button
              onClick={() => handleOrgGrowThis()}
              disabled={actionLoading || !feedback.trim()}
              className="w-full md:w-auto px-4 py-3 md:py-2 text-sm font-medium text-orange-700 bg-orange-100 rounded-lg hover:bg-orange-200 disabled:opacity-50 min-h-[44px] touch-manipulation"
            >
              Grow This
            </button>
          </div>
        </div>
      )}

      {canAdvisorAct && (
        <div className="md:static sticky bottom-0 z-10 bg-white border-t border-gray-200 pt-3 pb-3 md:pb-0 space-y-3 -mx-3 px-3 md:mx-0 md:px-0">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-600">
              Feedback for student
            </label>
            <button
              type="button"
              onClick={handleAiSuggest}
              disabled={aiSuggestLoading || actionLoading}
              className="text-sm md:text-xs text-optio-purple hover:text-optio-pink disabled:opacity-50 disabled:cursor-not-allowed py-1 px-1 touch-manipulation"
              title="Draft Grow This feedback with AI based on the student's submission"
            >
              {aiSuggestLoading ? 'Drafting…' : 'Suggest with AI'}
            </button>
          </div>
          <textarea
            ref={feedbackTextareaRef}
            value={feedback}
            onChange={e => {
              setFeedback(e.target.value)
              if (onFeedbackChange) onFeedbackChange(e.target.value)
            }}
            placeholder="Feedback for student (required for Grow This)..."
            rows={3}
            className="w-full text-base md:text-sm rounded-lg border border-gray-300 focus:ring-optio-purple focus:border-optio-purple px-4 py-3"
          />
          <div className="flex flex-col md:flex-row gap-2">
            <button
              onClick={() => handleApprove()}
              disabled={actionLoading}
              className="w-full md:w-auto px-4 py-3 md:py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 min-h-[44px] touch-manipulation"
            >
              {actionLoading ? 'Processing...' : 'Approve'}
            </button>
            <button
              onClick={() => handleGrowThis()}
              disabled={actionLoading || !feedback.trim()}
              className="w-full md:w-auto px-4 py-3 md:py-2 text-sm font-medium text-orange-700 bg-orange-100 rounded-lg hover:bg-orange-200 disabled:opacity-50 min-h-[44px] touch-manipulation"
            >
              Grow This
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

export default ItemDetail
