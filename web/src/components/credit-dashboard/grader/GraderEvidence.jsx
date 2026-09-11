import React from 'react'
import EvidenceBlockCard from '../EvidenceBlockCard'
import AiBadge from '../AiBadge'
import CreditFeedbackThread from '../../credit/CreditFeedbackThread'
import { computeEvidenceDiff, summarizeDiff, DIFF_REMOVED } from '../evidenceDiff'
import { aiItemSummary, evidenceAnchorId } from '../aiReview'

/**
 * The student's work, then what has been said about it before.
 *
 * On a resubmission every block is marked new, modified or unchanged against
 * the round the reviewer last saw, and blocks that disappeared are listed
 * separately. A reviewer reading a second attempt needs to know what changed
 * more than they need to re-read what did not.
 */
const GraderEvidence = ({
  completionId, evidenceBlocks, reviewRounds, aiByRound, showAi, highlightedEvidence,
}) => {
  const blocks = evidenceBlocks || []
  const rounds = reviewRounds || []
  const { diffStatus, removedBlocks, previousById, hasBaseline, baselineRoundNumber } =
    computeEvidenceDiff(blocks, rounds)
  const diffCounts = summarizeDiff(diffStatus, removedBlocks)
  const noChanges = diffCounts.added === 0 && diffCounts.modified === 0 && diffCounts.removed === 0

  return (
    <div className="space-y-6">
      <section aria-labelledby="grader-evidence-title">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 id="grader-evidence-title" className="text-xs font-semibold uppercase tracking-wider text-optio-purple">
            Evidence
            <span className="ml-2 font-normal normal-case tracking-normal text-gray-500">
              {blocks.length} block{blocks.length === 1 ? '' : 's'}
            </span>
          </h3>
          {hasBaseline && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-500">vs. Round {baselineRoundNumber}:</span>
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
              {noChanges && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                  No changes
                </span>
              )}
            </div>
          )}
        </div>

        {blocks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
            <p className="text-sm text-gray-500">The student attached no evidence.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {blocks.map((block, i) => (
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
      </section>

      {rounds.length > 0 && (
        <section aria-labelledby="grader-history-title">
          <h3 id="grader-history-title" className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Review History
          </h3>
          <div className="space-y-2">
            {rounds.map((round, i) => (
              <div key={round.id || i} className="text-xs p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex justify-between items-center gap-2">
                  <span className="font-medium text-gray-800">
                    Round {round.round_number} · {(round.reviewer_action || 'pending').replace(/_/g, ' ')}
                  </span>
                  <span className="flex items-center gap-2">
                    {showAi && aiByRound?.[round.id] && (
                      <AiBadge size="xs" {...aiItemSummary(aiByRound[round.id])} />
                    )}
                    <span className="text-gray-400">
                      {round.reviewed_at ? new Date(round.reviewed_at).toLocaleDateString() : ''}
                    </span>
                  </span>
                </div>
                {round.reviewer_feedback && (
                  <p className="text-gray-600 mt-1 whitespace-pre-wrap">{round.reviewer_feedback}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {completionId && (
        <section aria-label="Messages with the student">
          <CreditFeedbackThread completionId={completionId} />
        </section>
      )}
    </div>
  )
}

export default GraderEvidence
