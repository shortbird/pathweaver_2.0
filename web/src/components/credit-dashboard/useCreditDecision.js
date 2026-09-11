import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useConfirm } from '../../contexts/ConfirmContext'
import { latestAi, rescaleSubjects, sumSubjects } from './aiReview'

export const XP_REASON_DEFAULT = 'Adjusted during credit review'
// The platform floor (backend config.constants.MIN_TASK_XP). The server refuses
// anything lower; checking here means the row does not leave the queue first.
export const MIN_XP = 25

/**
 * Everything a reviewer can decide about one credit request, in one place.
 *
 * The grader's buttons, the page's keyboard shortcuts and the "take the AI's
 * recommendation" path all end up here, so there is exactly one way to approve
 * something and exactly one way to send it back. The shortcuts used to carry
 * their own copies of this logic, which is how `a` came to approve with the
 * reviewer's subject edits silently discarded.
 *
 * Stage decides the endpoint, not role: a superadmin at pending_org_approval
 * hits /org-approve, which the backend collapses into a single finalize for
 * them (backend/routes/credit_dashboard/org_admin_actions.py).
 */
export default function useCreditDecision({
  item, detail, effectiveRole,
  onAdvance, onRefresh, onFeedbackChange, feedbackTextareaRef, decisionRef,
}) {
  const confirm = useConfirm()
  const [feedback, setFeedbackState] = useState('')
  const [editedSubjects, setEditedSubjects] = useState({})
  // The XP the reviewer has settled on, if it differs from the student's
  // claim. Null means "the claim stands", which is the default and the common
  // case. The reason travels with it because the audit row needs one, and the
  // AI's rationale is only the right reason when the AI's number was taken.
  const [xp, setXpState] = useState(null)
  const [xpReason, setXpReason] = useState(null)
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false)

  const completionId = item?.completion_id
  const claimedXp = item?.xp_value

  // Keyed on the completion, not on `detail` itself: polling for a running AI
  // review replaces `detail` every few seconds, and resetting on that would
  // discard subject edits the reviewer made while they waited.
  useEffect(() => {
    setEditedSubjects(detail?.suggested_subjects || {})
    setXpState(null)
    setXpReason(null)
  }, [detail?.completion?.id])

  // A note typed for one student must not follow the reviewer to the next.
  useEffect(() => {
    setFeedbackState('')
    onFeedbackChange?.('')
  }, [completionId])

  const setFeedback = useCallback((text) => {
    setFeedbackState(text)
    onFeedbackChange?.(text)
  }, [onFeedbackChange])

  const completion = detail?.completion || {}
  const isSuperadmin = effectiveRole === 'superadmin'
  // Superadmins are simultaneously the org approver AND the Optio approver,
  // so they act at the pending_org_approval stage too.
  const isOrgAdmin = effectiveRole === 'org_admin' || isSuperadmin
  const isAdvisor = effectiveRole === 'advisor' || isSuperadmin
  const canOrgAdminAct = isOrgAdmin && completion.diploma_status === 'pending_org_approval'
  const canAdvisorAct = isAdvisor && completion.diploma_status === 'pending_review'
  const canAct = canOrgAdminAct || canAdvisorAct

  // The AI review is superadmin-only: the backend omits it entirely for anyone
  // else, so this resolves to a not_run shape and nothing AI-shaped renders.
  const ai = latestAi(detail)
  const aiReview = ai?.status === 'complete' ? ai.review : null
  const showAi = isSuperadmin
  const canApplyXp = isSuperadmin && canAct
  const aiXp = aiReview?.xp?.changed ? aiReview.xp.recommended : null

  /**
   * Settle on an XP figure, or put the student's claim back.
   *
   * Rescaling the subject split here rather than on approve means the reviewer
   * SEES the split they are about to award before they award it. The server
   * recomputes it anyway; showing one number and crediting another is how the
   * two drift.
   */
  const applyXp = useCallback((value, reason) => {
    if (value == null || value === claimedXp) {
      setEditedSubjects(detail?.suggested_subjects || {})
      setXpState(null)
      setXpReason(null)
      return
    }
    setEditedSubjects(prev => rescaleSubjects(
      sumSubjects(prev) > 0 ? prev : (detail?.suggested_subjects || {}), value))
    setXpState(value)
    setXpReason(reason || XP_REASON_DEFAULT)
  }, [claimedXp, detail?.suggested_subjects])

  /**
   * A subject edit moves the XP to award.
   *
   * The split is the XP: remove a 50 XP subject and the award drops by 50,
   * because the alternative -- a total the split no longer adds up to -- is a
   * number the server refuses and the reviewer has to reconcile by hand. The
   * other direction (typing an XP) rescales the split to match, in applyXp.
   */
  const updateSubjects = useCallback((next) => {
    setEditedSubjects(next)
    const total = sumSubjects(next)
    if (!Object.keys(next).length || total === claimedXp) {
      setXpState(null)
      setXpReason(null)
      return
    }
    setXpState(total)
    setXpReason(total === aiXp ? (aiReview?.xp?.rationale || XP_REASON_DEFAULT) : XP_REASON_DEFAULT)
  }, [claimedXp, aiXp, aiReview?.xp?.rationale])

  /**
   * Put a draft in the feedback box, asking first if there is something there.
   *
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
    feedbackTextareaRef?.current?.focus?.()
    return true
  }

  const suggestFeedback = async () => {
    if (!completionId) return
    setAiSuggestLoading(true)
    try {
      const res = await api.post(
        `/api/credit-dashboard/items/${completionId}/suggest-feedback`, {})
      const draft = res.data?.data?.suggested_feedback || res.data?.suggested_feedback
      await applyDraft(draft)
    } catch (err) {
      toast.error(err.response?.data?.message || 'AI suggestion failed')
    } finally {
      setAiSuggestLoading(false)
    }
  }

  /**
   * The body both approve endpoints take.
   *
   * Everything is passed in rather than read from state, because the
   * take-the-recommendation path decides the feedback and the XP in the same
   * tick it submits them. A React state update does not reach the closure that
   * queued it, so reading state here would have sent an empty note with an
   * approval the reviewer thought carried the AI's.
   *
   * Returns null when the reviewer's own subject edits no longer add up to the
   * XP they settled on -- the server rejects that too, and catching it here
   * means they find out before the row optimistically disappears from the queue.
   */
  const buildApproveBody = ({ note, xp: xpIn, xpReason: reasonIn, draftKind, subjects: subjectsIn }) => {
    const subjects = { ...(subjectsIn || editedSubjects) }
    for (const [k, v] of Object.entries(subjects)) {
      if (!v || v <= 0) delete subjects[k]
    }
    const hasSubjects = Object.keys(subjects).length > 0

    if (xpIn != null && hasSubjects && sumSubjects(subjects) !== xpIn) {
      toast.error(
        `The subject split adds up to ${sumSubjects(subjects)} XP, not ${xpIn}.`)
      return null
    }
    if (xpIn != null && xpIn < MIN_XP) {
      toast.error(`XP cannot go below ${MIN_XP}.`)
      return null
    }

    return {
      feedback: note || undefined,
      subjects: hasSubjects ? subjects : undefined,
      ...(xpIn != null && canApplyXp
        ? { xp_value: xpIn, xp_reason: reasonIn || XP_REASON_DEFAULT }
        : {}),
      ...(aiReview
        ? { ai_accepted: { feedback: draftKind || null, xp: xpIn != null && xpIn === aiXp } }
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
      xp: options.xp !== undefined ? options.xp : xp,
      xpReason: options.xpReason !== undefined ? options.xpReason : xpReason,
      draftKind: options.draftKind,
      subjects: options.subjects,
    })
    if (!body) return
    setFeedback('')
    onAdvance?.(completionId)
    try {
      await post(completionId, body)
      toast.success(successMessage)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve')
      onRefresh?.()
    }
  }

  const approve = (options) => {
    if (!canAct) return undefined
    if (canOrgAdminAct) {
      return submitApprove(
        (id, body) => api.post(`/api/credit-dashboard/items/${id}/org-approve`, body),
        isSuperadmin ? 'Credit approved' : 'Approved for Optio review', options)
    }
    return submitApprove(
      (id, body) => api.post(`/api/credit-dashboard/items/${id}/approve`, body),
      'Credit approved', options)
  }

  const growThis = async (note, { draftKind } = {}) => {
    if (!canAct) return
    const savedFeedback = (typeof note === 'string' ? note : feedback).trim()
    if (!savedFeedback) {
      toast.error('Feedback is required for Grow This')
      feedbackTextareaRef?.current?.focus?.()
      return
    }
    const body = {
      feedback: savedFeedback,
      ...(aiReview ? { ai_accepted: { feedback: draftKind || null } } : {}),
    }
    setFeedback('')
    onAdvance?.(completionId)
    try {
      if (canOrgAdminAct) {
        await api.post(`/api/credit-dashboard/items/${completionId}/org-grow-this`, body)
      } else {
        await api.post(`/api/credit-dashboard/items/${completionId}/grow-this`, body)
      }
      toast.success('Returned to student')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to return')
      onRefresh?.()
    }
  }

  /**
   * Take the AI's recommendation as written.
   *
   * Routes to the same two handlers the buttons use, so there is no second code
   * path that could approve something the buttons would not -- and no path at
   * all when the AI declined to judge. `ask` is on for the keyboard shortcut,
   * where a stray keypress must not award credit, and off for the button whose
   * label already says exactly what it will do.
   */
  const acceptAi = async ({ ask = true } = {}) => {
    if (!aiReview) {
      toast.error('There is no AI verdict for this one')
      return
    }
    if (!canAct) return
    const { recommendation, feedback: drafts, xp: aiXpInfo } = aiReview

    if (recommendation === 'approve') {
      const changingXp = canApplyXp && aiXpInfo?.changed
      if (ask) {
        const ok = await confirm({
          title: changingXp
            ? `Approve at ${aiXpInfo.recommended} XP?`
            : 'Approve with the AI feedback?',
          body: drafts?.celebrate || undefined,
          confirmLabel: 'Approve',
          destructive: false,
        })
        if (!ok) return
      }

      const acceptedXp = changingXp ? aiXpInfo.recommended : null
      const subjects = acceptedXp != null
        ? rescaleSubjects(editedSubjects, acceptedXp)
        : undefined

      // Reflect the decision on screen as well as in the request, so a failed
      // approval leaves the reviewer looking at what was attempted.
      if (drafts?.celebrate) await applyDraft(drafts.celebrate, { silent: true })
      if (acceptedXp != null) applyXp(acceptedXp, aiXpInfo.rationale)

      approve({
        note: drafts?.celebrate || '',
        xp: acceptedXp,
        xpReason: aiXpInfo?.rationale || XP_REASON_DEFAULT,
        subjects,
        draftKind: drafts?.celebrate ? 'celebrate' : null,
      })
      return
    }

    if (recommendation === 'grow_this') {
      if (!drafts?.grow_this) {
        toast.error('The AI did not draft a note to send back')
        return
      }
      if (ask) {
        const ok = await confirm({
          title: 'Return this for more?',
          body: drafts.grow_this,
          confirmLabel: 'Send it back',
          destructive: false,
        })
        if (!ok) return
      }
      growThis(drafts.grow_this, { draftKind: 'grow_this' })
      return
    }

    toast('The AI wants a person to read this one')
  }

  // The page's keyboard shortcuts reach these through a ref, so a keypress and
  // a click are the same code. Plain assignment on every render keeps the
  // closures fresh without re-registering anything.
  const impl = useRef(null)
  impl.current = { acceptAi, approve, growThis }
  useEffect(() => {
    if (!decisionRef) return undefined
    decisionRef.current = {
      acceptAi: (opts) => impl.current?.acceptAi(opts),
      approve: (opts) => impl.current?.approve(opts),
      growThis: (note) => impl.current?.growThis(note),
    }
    return () => { decisionRef.current = null }
  }, [decisionRef])

  return {
    // state
    feedback, setFeedback,
    editedSubjects, updateSubjects,
    xp, xpReason, applyXp,
    aiSuggestLoading,
    // derived
    isSuperadmin, canOrgAdminAct, canAdvisorAct, canAct,
    canEditSubjects: canAct, canApplyXp,
    ai, aiReview, showAi, aiXp, claimedXp,
    // actions
    applyDraft, suggestFeedback, approve, growThis, acceptAi,
  }
}
