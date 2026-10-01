import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import EvidenceDisplay from '../evidence/EvidenceDisplay'
import AiCriteriaChecklist from './AiCriteriaChecklist'
import { AiRecommendationCard } from './grader/GraderDecision'

const STATE_META = {
  accepted: { label: 'Accepted', className: 'bg-green-100 text-green-800' },
  returned: { label: 'Sent back', className: 'bg-red-100 text-red-800' },
  pending: { label: 'Needs review', className: 'bg-amber-100 text-amber-800' },
  not_submitted: { label: 'Needs review', className: 'bg-amber-100 text-amber-800' },
}

/**
 * One task inside a class review, judged the way the credit queue judges a
 * task: the Definition of Done with the AI's verdict beside each line, the
 * evidence, the AI's recommendation, then accept or send back with feedback.
 *
 * Accepting moves no subject XP. The class's half credit is the only award
 * (backend/services/class_task_review_service.py).
 */
const ClassTaskReview = ({ questId, task, canDecide, onChanged }) => {
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(null)
  const [aiStarting, setAiStarting] = useState(false)
  const [suggesting, setSuggesting] = useState(false)

  const review = task.review || {}
  const state = review.state || 'pending'
  const meta = STATE_META[state] || STATE_META.pending
  const ai = task.ai || { status: 'not_run' }
  const aiReview = ai.status === 'complete' || ai.status === 'skipped' ? ai.review : null
  const recommendation = aiReview?.recommendation
  const drafts = aiReview?.feedback || {}

  // A note typed for one task must not survive a reload of another's review.
  useEffect(() => { setFeedback('') }, [task.completion_id, state])

  const decide = async (action, note, aiAccepted) => {
    if (action === 'return' && !note?.trim()) {
      toast.error('Write feedback before you send the task back')
      return
    }
    setBusy(action)
    try {
      const body = {
        feedback: note?.trim() || undefined,
        ai_accepted: aiAccepted ? { feedback: aiAccepted } : undefined,
      }
      if (action === 'accept') {
        await api.post(`/api/admin/class-reviews/${questId}/tasks/${task.completion_id}/accept`, body)
      } else {
        await api.post(`/api/admin/class-reviews/${questId}/tasks/${task.completion_id}/return`, body)
      }
      toast.success(action === 'accept' ? 'Task accepted' : 'Task sent back')
      onChanged?.()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'That did not save')
    } finally {
      setBusy(null)
    }
  }

  const acceptAi = () => {
    if (recommendation === 'approve') return decide('accept', drafts.celebrate, 'celebrate')
    if (recommendation === 'grow_this' && drafts.grow_this) {
      return decide('return', drafts.grow_this, 'grow_this')
    }
    return undefined
  }

  const runAi = async () => {
    setAiStarting(true)
    try {
      await api.post(`/api/admin/class-reviews/${questId}/tasks/${task.completion_id}/ai-review`, {})
      onChanged?.()
    } catch (err) {
      const code = err.response?.data?.error?.code
      if (code === 'AI_REVIEW_RUNNING') onChanged?.()
      else toast.error(err.response?.data?.error?.message || 'Could not start the AI review')
    } finally {
      setAiStarting(false)
    }
  }

  const suggestFeedback = async () => {
    setSuggesting(true)
    try {
      const res = await api.post(`/api/credit-dashboard/items/${task.completion_id}/suggest-feedback`, {})
      const draft = res.data?.data?.suggested_feedback || res.data?.suggested_feedback
      if (draft) setFeedback(draft)
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'AI suggestion failed')
    } finally {
      setSuggesting(false)
    }
  }

  const canAcceptAi = canDecide && !!aiReview
    && (recommendation === 'approve' || (recommendation === 'grow_this' && !!drafts.grow_this))

  return (
    <div className="px-4 py-4 border-b border-gray-100 last:border-b-0 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-gray-900">{task.title}</div>
          {task.description && (
            <div className="text-xs text-gray-500 mt-1">{task.description}</div>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className={`text-xs px-2 py-0.5 rounded-full ${meta.className}`}>{meta.label}</span>
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {task.subject_xp_attributed} XP{task.xp_value !== task.subject_xp_attributed ? ` • ${task.xp_value} total` : ''}
          </span>
        </div>
      </div>

      <AiCriteriaChecklist criteria={task.success_criteria} aiReview={aiReview} />

      {task.evidence_blocks?.length > 0 && (
        <EvidenceDisplay blocks={task.evidence_blocks} emptyMessage="" singleColumn />
      )}

      <AiRecommendationCard
        ai={ai}
        review={aiReview}
        claimedXp={task.xp_value}
        canApplyXp
        canAccept={canAcceptAi}
        acceptedXp={task.xp_value}
        onAccept={acceptAi}
        onRerun={runAi}
        rerunLoading={aiStarting}
        acceptShortcut={null}
        acceptLabel={recommendation === 'approve'
          ? "Use the AI's call: accept, and add its note to the email"
          : "Use the AI's call: send back, and add its note to the email"}
        noteLabel="Note for the email"
        titleId={`class-task-ai-${task.completion_id}`}
      />

      {review.feedback && state !== 'pending' && (
        <div className="text-sm bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Your feedback</div>
          <p className="text-gray-700 whitespace-pre-wrap">{review.feedback}</p>
        </div>
      )}

      {canDecide && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`class-task-feedback-${task.completion_id}`} className="text-xs font-medium text-gray-700">
              Feedback for the email {state === 'pending' ? '(required to send back)' : '(to change your decision)'}
            </label>
            <button
              type="button"
              onClick={suggestFeedback}
              disabled={suggesting}
              className="text-xs font-medium text-optio-purple hover:text-optio-purple-dark disabled:opacity-50"
            >
              {suggesting ? 'Drafting…' : 'Draft with AI'}
            </button>
          </div>
          <textarea
            id={`class-task-feedback-${task.completion_id}`}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What is strong, and what to grow"
            className="w-full text-sm border border-gray-300 rounded-md p-2 min-h-[72px]"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => decide('return', feedback)}
              disabled={!!busy || !feedback.trim()}
              className="px-3 py-1.5 text-sm border border-red-300 text-red-700 rounded-md hover:bg-red-50 disabled:opacity-50"
            >
              {busy === 'return' ? 'Sending…' : 'Send back'}
            </button>
            <button
              type="button"
              onClick={() => decide('accept', feedback)}
              disabled={!!busy}
              className="px-3 py-1.5 text-sm bg-gradient-primary text-white rounded-md disabled:opacity-50"
            >
              {busy === 'accept' ? 'Saving…' : 'Accept'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 text-right">
            Saves your decision and adds the feedback to the email. Nothing reaches the student until you press Send at the bottom.
          </p>
        </div>
      )}
    </div>
  )
}

export default ClassTaskReview
