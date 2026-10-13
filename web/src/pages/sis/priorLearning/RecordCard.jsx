import React from 'react'
import StatusPill from '../../../components/sis/ui/StatusPill'
import EvidenceList from './EvidenceList'
import AiSuggestion from './AiSuggestion'
import TranscriptStep from './TranscriptStep'
import ReviewForm from './ReviewForm'

const dateRange = (record) => (
  [record.started_on, record.ended_on].filter(Boolean).join(' – ') || null
)

/**
 * One prior-learning record: what was claimed, its evidence, the AI's
 * suggestion, the review form and the transcript step.
 *
 * Moved out of PriorLearningPage on 2026-10-13 so the record list and the
 * student workspace render a record the same way. `children` is where the
 * workspace adds its one-step Approve, Send back and history.
 *
 * `showStudent` is false in the workspace, which already names the student.
 * `showReview` is false there too: the workspace's Approve panel and its
 * "Other decisions" link are the decision, and a third door labelled Review
 * beside "Read with AI" read as two buttons doing one thing (Tanner,
 * 2026-10-13).
 */
const RecordCard = ({
  record, subjects, actions, open, onToggle, showStudent = true, showReview = true, children,
}) => {
  const {
    busy, analyzing, suggested, setSuggested,
    review, analyze, deleteEvidence, addDocuments, addToTranscript,
  } = actions
  const reviewable = record.can_review !== false
  const reading = analyzing === record.id
    || (['queued', 'running'].includes(record.ai_status) && !record.ai_suggestion)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-gray-900">{record.title}</h2>
            <StatusPill domain="prior_learning" status={record.status} />
            {/* Accepted-and-awarded but not yet transcribed reads as
                "done" from the status alone, and it is the state where
                the credit exists but the student has none of it. */}
            {record.status === 'accepted' && !record.transfer_credit
              && Object.keys(record.awarded_credits || {}).length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                not on transcript
              </span>
            )}
            {/* Where it came from, because "who filed this" is a question
                an accreditor asks, and a staff record has no family
                behind it to ask about a missing page. */}
            {record.source === 'staff' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                filed by the office
              </span>
            )}
            {/* Optio Academy reviews the records of a microschool that
                issues its diplomas (accreditation_source 'optio'). The
                Academy needs to know which school the family is at; the
                microschool needs to know the decision is not theirs. */}
            {record.academy_reviews && reviewable && record.organization_name && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-optio-purple">
                via {record.organization_name}
              </span>
            )}
            {!reviewable && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-optio-purple">
                Optio Academy reviews this
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {[showStudent ? record.student_name : null, record.provider, dateRange(record),
              record.hours_estimate ? `${record.hours_estimate} hrs` : null,
              record.created_at ? `sent ${new Date(record.created_at).toLocaleDateString()}` : null]
              .filter(Boolean).join(' · ')}
          </p>
        </div>
        {reviewable && (
          <div className="flex items-center gap-3 shrink-0">
            <button type="button" disabled={reading}
                    onClick={() => analyze(record.id)}
                    className="text-sm text-gray-600 font-medium disabled:opacity-50">
              {reading ? 'AI is reading…'
                : record.ai_suggestion ? 'Read again with AI' : 'Read with AI'}
            </button>
            {showReview && (
              <button type="button" onClick={onToggle}
                      className="text-sm text-optio-purple font-medium">
                {open ? 'Close' : 'Review'}
              </button>
            )}
          </div>
        )}
      </div>

      {record.description && (
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{record.description}</p>
      )}

      {record.status === 'needs_info' && record.review_notes && (
        <p className="text-sm text-amber-900 bg-amber-50 rounded-lg px-3 py-2">
          <span className="font-medium">Sent back to the family: </span>{record.review_notes}
        </p>
      )}

      <EvidenceList evidence={record.evidence} busy={busy}
                    onAdd={(files) => addDocuments(record.id, files)}
                    onDelete={(evidenceId) => deleteEvidence(record.id, evidenceId)} />

      {record.ai_suggestion && reviewable && (
        <AiSuggestion
          suggestion={record.ai_suggestion}
          busy={analyzing === record.id}
          onUnlock={(password) => analyze(record.id, [password])}
          onUse={() => {
            setSuggested({ ...suggested, [record.id]: record.ai_suggestion })
            if (!open) onToggle()
          }}
        />
      )}

      {open && reviewable && record.transfer_credit && (
        <p className="text-sm text-gray-600">
          This credit is on the transcript. To change the review, remove it from the
          student&apos;s transfer credits first.
        </p>
      )}

      {open && reviewable && !record.transfer_credit && (
        <ReviewForm record={record} subjects={subjects} busy={busy}
                    prefill={suggested[record.id]}
                    onSubmit={(payload) => review(record.id, payload)} />
      )}

      {record.status === 'accepted' && reviewable && (
        <TranscriptStep record={record} busy={busy}
                        suggestion={record.ai_suggestion}
                        onSubmit={(payload) => addToTranscript(record.id, payload)} />
      )}

      {children}
    </div>
  )
}

export default RecordCard
