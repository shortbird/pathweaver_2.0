import React from 'react'
import {
  CheckCircleIcon,
  MinusCircleIcon,
  XCircleIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline'
import { Modal } from '../ui/Modal'
import Spinner from '../ui/Spinner'

/**
 * What a student sees between pressing Request Credit and actually requesting
 * it: the reviewer's AI, run on their work as it stands, and a choice.
 *
 * The answer is a preview and says so. A person reviews every request, so
 * whatever the preview thinks, Submit is always offered -- a student who
 * believes the AI missed something is exactly who should be sending it on.
 *
 * `precheck` is null while the check runs, then the endpoint's data
 * (backend services/credit_ai_review/precheck.py: student_view), or
 * `{ available: false, reason }` when there is no answer this time.
 */

const LIKELIHOOD = {
  likely: {
    title: 'Looks ready for credit',
    body: 'Based on this preview, your work looks like it meets the checklist.',
    tone: 'bg-green-50 border-green-200 text-green-800',
  },
  needs_work: {
    title: 'Might come back for more work',
    body: 'Based on this preview, a reviewer may ask you to add to this before it earns credit.',
    tone: 'bg-amber-50 border-amber-200 text-amber-800',
  },
  uncertain: {
    title: 'Hard to say from here',
    body: 'The preview could not tell how this will go. A reviewer will look at it closely.',
    tone: 'bg-gray-50 border-gray-200 text-gray-700',
  },
}

const VERDICT = {
  met: { label: 'Looks done', Icon: CheckCircleIcon, color: 'text-green-600' },
  partial: { label: 'Partly there', Icon: MinusCircleIcon, color: 'text-amber-600' },
  not_met: { label: 'Not shown yet', Icon: XCircleIcon, color: 'text-red-600' },
  cannot_verify: { label: 'Could not check', Icon: QuestionMarkCircleIcon, color: 'text-gray-500' },
}

const UNAVAILABLE = {
  busy: 'The preview is busy right now.',
  no_readable_evidence:
    'The preview could not open any of your evidence. If you shared a link, check that it is set so anyone with the link can view it.',
  rate_limited: 'You have run the preview a lot in the last hour. Try again later.',
}
const UNAVAILABLE_DEFAULT = 'The preview is not available right now.'

export const PRECHECK_DISCLAIMER =
  'This is an AI preview, not an official review. A person reviews every request and makes the final call.'

const CreditPrecheckModal = ({ isOpen, precheck, isSubmitting, isResubmit, onSubmit, onClose }) => {
  const loading = !precheck
  const available = precheck?.available
  const outcome = available ? (LIKELIHOOD[precheck.likelihood] || LIKELIHOOD.uncertain) : null
  const submitLabel = isResubmit ? 'Resubmit for review' : 'Submit for review'

  const footer = (
    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
      <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
        Keep working
      </button>
      <button type="button" onClick={onSubmit} className="btn-primary" disabled={isSubmitting}>
        {isSubmitting ? <Spinner size="sm" /> : (
          available && precheck.likelihood !== 'likely' ? `${submitLabel} anyway` : submitLabel
        )}
      </button>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Before you request credit"
      size="sm"
      closeOnOverlayClick={!isSubmitting}
      footer={footer}
    >
      <div className="space-y-4 text-sm text-gray-700">
        <p className="text-xs text-gray-500">{PRECHECK_DISCLAIMER}</p>

        {loading && (
          <div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
            <Spinner />
            <p>Checking your work against the task checklist.</p>
            <p className="text-xs text-gray-500">This can take up to a minute. You can also submit without waiting.</p>
          </div>
        )}

        {!loading && !available && (
          <p className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            {UNAVAILABLE[precheck.reason] || UNAVAILABLE_DEFAULT} You can still submit your work for review.
          </p>
        )}

        {!loading && available && (
          <>
            <div className={`rounded-lg border p-3 ${outcome.tone}`}>
              <p className="font-semibold">{outcome.title}</p>
              <p className="mt-1">{outcome.body}</p>
            </div>

            {precheck.criteria?.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Checklist</h3>
                {precheck.criteria_source === 'task_description' && (
                  <p className="text-xs text-gray-500 mb-2">
                    This task has no written checklist, so the preview used the task description.
                  </p>
                )}
                <ul className="space-y-2">
                  {precheck.criteria.map((c, i) => {
                    const v = VERDICT[c.verdict] || VERDICT.cannot_verify
                    return (
                      <li key={i} className="flex items-start gap-2">
                        <v.Icon className={`w-5 h-5 shrink-0 ${v.color}`} aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block">{c.criterion}</span>
                          <span className={`text-xs font-medium ${v.color}`}>{v.label}</span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {precheck.suggestion && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">What might help</h3>
                <p>{precheck.suggestion}</p>
              </div>
            )}

            {precheck.unread?.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">The preview could not open</h3>
                <ul className="list-disc pl-5 space-y-1">
                  {precheck.unread.map((u, i) => (
                    <li key={i}>
                      <span className="font-medium">{u.label || 'An attachment'}</span>
                      {u.reason ? `: ${u.reason}` : ''}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-gray-500">A reviewer can still open these.</p>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

export default CreditPrecheckModal
