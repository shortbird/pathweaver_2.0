import React, { useState } from 'react'
import AiBadge from './AiBadge'
import AiEvidenceCoverage from './AiEvidenceCoverage'
import { AI_ACTION_META, formatConfidence } from './aiReview'

/**
 * The AI's proposal, laid out so a reviewer can disagree with it in one click.
 *
 * Deliberately not sticky and deliberately above the subject XP table: the XP
 * card here rescales that table, and a control that changes something below it
 * should sit above it. The mobile action bar stays the only fixed thing on the
 * page.
 *
 * Nothing on this panel decides anything. Approve and Grow This are still the
 * two buttons at the bottom of the detail pane, and both still need a click.
 */
const AiReviewPanel = ({
  ai, requestedXp, canApplyXp, appliedXp, onApplyXp,
  onUseFeedback, onRerun, rerunLoading, onJumpToEvidence,
}) => {
  const [open, setOpen] = useState(true)
  const status = ai?.status || 'not_run'
  const review = ai?.review || null
  const running = status === 'queued' || status === 'running'

  const summary = aiItemSummaryFrom(ai)

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 md:p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="flex items-center gap-2 min-h-[32px] touch-manipulation"
        >
          <span aria-hidden="true" className="text-gray-400">{open ? '▾' : '▸'}</span>
          <span className="text-sm font-medium text-gray-700">AI review</span>
          <AiBadge {...summary} />
        </button>

        {status !== 'skipped' && (
          <button
            type="button"
            onClick={onRerun}
            disabled={rerunLoading || running}
            aria-busy={rerunLoading || running}
            className="text-xs text-optio-purple hover:text-optio-pink disabled:opacity-50 min-h-[32px] px-2 touch-manipulation"
          >
            {rerunLoading || running ? 'Reading…' : 'Re-run'}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {running && (
            <p aria-live="polite" className="text-sm text-gray-500">
              Reading the evidence…
            </p>
          )}

          {status === 'not_run' && (
            <div className="text-sm text-gray-500">
              <p>The AI has not read this submission.</p>
              <button
                type="button"
                onClick={onRerun}
                disabled={rerunLoading}
                className="mt-1 text-optio-purple hover:text-optio-pink disabled:opacity-50 min-h-[32px] touch-manipulation"
              >
                Run AI review
              </button>
            </div>
          )}

          {status === 'skipped' && (
            <p className="text-sm text-gray-500">
              {ai?.skip_reason === 'ai_disabled_for_student'
                ? 'AI review is turned off for this student, so their work was not sent anywhere. Read it yourself.'
                : ai?.error || 'There was nothing for the AI to read.'}
            </p>
          )}

          {status === 'failed' && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-2">
              <p className="text-sm text-red-800">The AI review did not finish.</p>
              {ai?.error && <p className="text-[11px] text-red-700 mt-0.5">{ai.error}</p>}
            </div>
          )}

          {status === 'complete' && review && (
            <>
              <Verdict review={review} />
              {review.xp && (
                <XpCard
                  xp={review.xp}
                  requestedXp={requestedXp}
                  canApply={canApplyXp}
                  appliedXp={appliedXp}
                  onApply={onApplyXp}
                />
              )}
              <Drafts feedback={review.feedback} onUse={onUseFeedback} />
              {(review.concerns || []).length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2">
                  <p className="text-[11px] font-medium text-amber-900 mb-0.5">Worth a look</p>
                  <ul className="space-y-0.5">
                    {review.concerns.map((c, i) => (
                      <li key={i} className="text-[11px] text-amber-900">{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              <AiEvidenceCoverage
                evidence={review.evidence}
                stats={review.evidence_read}
                flags={review.flags}
                onJumpToEvidence={onJumpToEvidence}
              />
              <Provenance ai={ai} />
            </>
          )}

          {status === 'skipped' && review && (
            <AiEvidenceCoverage
              evidence={review.evidence}
              stats={review.evidence_read}
              flags={review.flags}
              onJumpToEvidence={onJumpToEvidence}
            />
          )}
        </div>
      )}
    </div>
  )
}

const aiItemSummaryFrom = (ai) => ({
  status: ai?.status || 'not_run',
  action: ai?.review?.recommendation,
  confidence: ai?.review?.confidence,
})

const Verdict = ({ review }) => {
  const meta = AI_ACTION_META[review.recommendation] || AI_ACTION_META.needs_human
  const percent = formatConfidence(review.confidence)
  return (
    <div>
      <p className="text-sm text-gray-800">
        The AI {meta.sentence}.
      </p>
      {review.summary && (
        <p className="text-sm text-gray-600 mt-1">{review.summary}</p>
      )}
      {percent && (
        <div className="mt-1.5 flex items-center gap-2">
          <div
            role="meter"
            aria-valuenow={Math.round((review.confidence || 0) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="AI confidence"
            className="h-1.5 w-24 rounded-full bg-gray-200 overflow-hidden"
          >
            <div
              className="h-full bg-optio-purple"
              style={{ width: `${Math.round((review.confidence || 0) * 100)}%` }}
            />
          </div>
          <span className="text-[11px] text-gray-500">{percent} confident</span>
        </div>
      )}
    </div>
  )
}


/**
 * The XP suggestion.
 *
 * Only ever downward — the model is told it may never raise a student's claim,
 * and the server refuses it if it tries. "Apply" is a toggle rather than a
 * one-way door, because a reviewer who applies it and then reads the evidence
 * properly needs a way back that is not a page reload.
 */
const XpCard = ({ xp, requestedXp, canApply, appliedXp, onApply }) => {
  const requested = xp.requested ?? requestedXp
  if (!xp.changed) {
    return (
      <p className="text-[11px] text-gray-500">
        The AI thinks {requested} XP fits this work.
      </p>
    )
  }

  const applied = appliedXp === xp.recommended
  return (
    <div className="rounded-lg bg-white border border-gray-200 p-2.5">
      <p className="text-sm text-gray-800">
        Claimed {requested} XP. The AI suggests <strong>{xp.recommended} XP</strong>.
      </p>
      {xp.rationale && (
        <p className="text-xs text-gray-500 mt-0.5">{xp.rationale}</p>
      )}
      {canApply ? (
        <button
          type="button"
          onClick={() => onApply?.(applied ? null : xp.recommended)}
          className="mt-2 text-xs text-optio-purple hover:text-optio-pink min-h-[36px] md:min-h-0 touch-manipulation"
        >
          {applied ? `Revert to ${requested} XP` : `Apply ${xp.recommended} XP`}
        </button>
      ) : (
        <p className="mt-1 text-[11px] text-gray-400">Optio sets the final XP.</p>
      )}
    </div>
  )
}


/**
 * Both drafts, always.
 *
 * The model writes one for approval and one for return whatever it recommends,
 * because the reviewer disagreeing with the recommendation is the case where
 * having the other draft saves the most time.
 */
const Drafts = ({ feedback, onUse }) => {
  const drafts = [
    ['celebrate', 'If you approve', feedback?.celebrate],
    ['grow_this', 'If you return it', feedback?.grow_this],
  ].filter(([, , text]) => text)

  if (!drafts.length) return null

  return (
    <div className="space-y-2">
      {drafts.map(([kind, label, text]) => (
        <div key={kind} className="rounded-lg bg-white border border-gray-200 p-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
              {label}
            </p>
            <button
              type="button"
              onClick={() => onUse?.(text, kind)}
              className="text-xs text-optio-purple hover:text-optio-pink min-h-[32px] md:min-h-0 touch-manipulation"
            >
              Use this
            </button>
          </div>
          <p className="text-sm text-gray-700 mt-1">{text}</p>
        </div>
      ))}
    </div>
  )
}


const Provenance = ({ ai }) => {
  if (!ai?.model && !ai?.reviewed_at) return null
  const when = ai.reviewed_at ? new Date(ai.reviewed_at).toLocaleString() : null
  return (
    <p className="text-[10px] text-gray-400">
      {[ai.model, when].filter(Boolean).join(' · ')}
    </p>
  )
}



export default AiReviewPanel
