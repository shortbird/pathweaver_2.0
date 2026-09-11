import React, { useState } from 'react'
import AiBadge from '../AiBadge'
import AiEvidenceCoverage from '../AiEvidenceCoverage'
import StudentContext from '../StudentContext'
import SubjectSplitEditor from './SubjectSplitEditor'
import GraderStoryPanel from './GraderStoryPanel'
import { AI_ACTION_META, formatConfidence } from '../aiReview'
import { MIN_XP } from '../useCreditDecision'

const STATUS_NOTICE = {
  finalized: 'Credit was approved. There is nothing left to decide.',
  grow_this: 'This was returned to the student. It comes back when they resubmit.',
  merged: 'This was merged into another request.',
  pending_review: 'Your school approved this. Optio makes the final call.',
  pending_org_approval: 'The school reviews this first.',
}

/**
 * The right-hand column of the grader: the AI's proposal, then the reviewer's.
 *
 * Two ways out, and the order is deliberate. The AI card comes first with one
 * button that does exactly what its label says, because most of the time the
 * reviewer agrees and the job is to get them to the next student. Below it the
 * override form takes every input the AI's button would have supplied -- the
 * note, the XP, the split -- so disagreeing costs typing, never a different
 * screen. Nothing on the AI card decides anything without a click.
 */
const GraderDecision = ({
  item, detail, decision, studentContext, contextLoading,
  onRerunAi, rerunAiLoading, onJumpToEvidence, feedbackTextareaRef, onOpenStory,
}) => {
  const {
    feedback, setFeedback, editedSubjects, updateSubjects,
    xp, applyXp, aiSuggestLoading,
    isSuperadmin, canOrgAdminAct, canAct, canEditSubjects, canApplyXp,
    ai, aiReview, showAi, aiXp, claimedXp,
    applyDraft, suggestFeedback, approve, growThis, acceptAi,
  } = decision

  const status = detail?.completion?.diploma_status
  const effectiveXp = xp ?? claimedXp
  const recommendation = aiReview?.recommendation
  const drafts = aiReview?.feedback || {}
  const canAcceptAi = showAi && !!aiReview && canAct
    && (recommendation === 'approve' || (recommendation === 'grow_this' && drafts.grow_this))

  // An item nobody can act on does not need an offer to run the AI on it.
  const showAiCard = showAi && (ai?.status !== 'not_run' || canAct)

  return (
    <div className="p-4 md:p-5 space-y-5">
      {showAiCard && (
        <AiRecommendationCard
          ai={ai}
          review={aiReview}
          claimedXp={claimedXp}
          canApplyXp={canApplyXp}
          canAccept={canAcceptAi}
          acceptedXp={recommendation === 'approve' && canApplyXp && aiXp != null ? aiXp : claimedXp}
          onAccept={() => acceptAi({ ask: false })}
          onRerun={() => onRerunAi?.(item.completion_id)}
          rerunLoading={rerunAiLoading}
          onJumpToEvidence={onJumpToEvidence}
        />
      )}

      {canAct ? (
        <section aria-labelledby="grader-override-title" className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 id="grader-override-title" className="text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
              {canAcceptAi ? 'Or decide yourself' : 'Your decision'}
            </h3>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {canOrgAdminAct && !isSuperadmin && (
            <p className="text-xs text-gray-600 bg-optio-purple/5 border border-optio-purple/10 rounded-lg px-3 py-2">
              Your school reviews this request first. Approving sends it to Optio
              for final credit approval. Use Grow This to return it to the student
              with feedback instead.
            </p>
          )}

          <XpField
            // Remount on every settled value: the draft below is only ever the
            // reviewer's in-progress typing, and a value that arrived from
            // elsewhere (the AI, a revert) should replace it outright.
            key={`${item.completion_id}:${effectiveXp}`}
            claimedXp={claimedXp}
            xp={xp}
            aiXp={aiXp}
            aiRationale={aiReview?.xp?.rationale}
            editable={canApplyXp}
            onChange={applyXp}
          />

          <SubjectSplitEditor
            subjects={editedSubjects}
            onChange={updateSubjects}
            editable={canEditSubjects}
            targetXp={effectiveXp}
          />

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
              <label htmlFor="grader-feedback" className="block text-sm font-medium text-gray-700">
                Note to student
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {drafts.celebrate && (
                  <DraftChip label="Use approve draft" onClick={() => applyDraft(drafts.celebrate)} />
                )}
                {drafts.grow_this && (
                  <DraftChip label="Use return draft" onClick={() => applyDraft(drafts.grow_this)} />
                )}
                {!drafts.grow_this && (
                  <button
                    type="button"
                    onClick={suggestFeedback}
                    disabled={aiSuggestLoading}
                    className="text-xs font-medium text-optio-purple hover:text-optio-purple-dark disabled:opacity-50 disabled:cursor-not-allowed min-h-[32px] md:min-h-0 touch-manipulation"
                    title="Draft Grow This feedback with AI based on the student's submission"
                  >
                    {aiSuggestLoading ? 'Drafting…' : 'Suggest with AI'}
                  </button>
                )}
              </div>
            </div>
            <textarea
              id="grader-feedback"
              ref={feedbackTextareaRef}
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="Feedback for student (required for Grow This)..."
              rows={4}
              className="w-full text-base md:text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple px-3 py-2"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => approve()}
              className={`${canAcceptAi ? 'btn-quiet' : 'btn-primary'} flex-1 min-h-[44px]`}
            >
              {canOrgAdminAct && !isSuperadmin
                ? 'Approve for Optio Review'
                : `Approve at ${effectiveXp} XP`}
              {!canAcceptAi && <Kbd>a</Kbd>}
            </button>
            <button
              type="button"
              onClick={() => growThis()}
              className="btn-quiet flex-1 min-h-[44px] text-orange-700 hover:text-orange-800 hover:border-orange-300"
            >
              Grow This
              <Kbd>g</Kbd>
            </button>
          </div>
        </section>
      ) : (
        <section aria-label="Status" className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-600">
            {STATUS_NOTICE[status] || 'This item is not at a stage you can act on.'}
          </p>
        </section>
      )}

      {/* Superadmin only, and only once credit is final: a story drawn from
          work that could still be sent back would publish something the
          reviewer has not signed off on. Keyed so the next item gets a fresh
          panel instead of the previous student's poll. */}
      {isSuperadmin && status === 'finalized' && (
        <GraderStoryPanel
          key={item.completion_id}
          completionId={item.completion_id}
          onOpenStory={onOpenStory}
        />
      )}

      <details className="group rounded-lg border border-gray-200 bg-white">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-gray-700 flex items-center justify-between min-h-[44px] touch-manipulation">
          <span>Student progress</span>
          <span aria-hidden="true" className="text-gray-400 transition-transform group-open:rotate-90">▸</span>
        </summary>
        <div className="border-t border-gray-100">
          <StudentContext context={studentContext} loading={contextLoading} />
        </div>
      </details>
    </div>
  )
}


const Kbd = ({ children }) => (
  <kbd
    aria-hidden="true"
    className="hidden md:inline-flex items-center justify-center ml-2 min-w-[20px] h-5 px-1 text-[10px] font-mono rounded border border-current opacity-60"
  >
    {children}
  </kbd>
)


const DraftChip = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-xs font-medium px-2 py-1 rounded-full border border-optio-purple/30 text-optio-purple hover:bg-optio-purple/10 min-h-[32px] md:min-h-0 touch-manipulation"
  >
    {label}
  </button>
)


/**
 * The AI's proposal, with one button that takes it whole.
 *
 * The note shown is the one the button will send. The XP on the button is the
 * XP the button will award. There is no confirmation because there is nothing
 * the dialog could tell the reviewer that the card has not already.
 */
const AiRecommendationCard = ({
  ai, review, claimedXp, canApplyXp, canAccept, acceptedXp,
  onAccept, onRerun, rerunLoading, onJumpToEvidence,
}) => {
  const status = ai?.status || 'not_run'
  const running = status === 'queued' || status === 'running'
  const meta = review ? (AI_ACTION_META[review.recommendation] || AI_ACTION_META.needs_human) : null
  const percent = review ? formatConfidence(review.confidence) : null
  const noteKind = review?.recommendation === 'grow_this' ? 'grow_this' : 'celebrate'
  const note = review?.feedback?.[noteKind]

  return (
    <section
      aria-labelledby="grader-ai-title"
      className="rounded-xl border border-optio-purple/20 bg-optio-purple/5 p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 id="grader-ai-title" className="text-xs font-semibold uppercase tracking-wider text-optio-purple">
            AI recommendation
          </h3>
          <AiBadge status={status} action={review?.recommendation} confidence={review?.confidence} />
        </div>
        {status !== 'skipped' && status !== 'not_run' && (
          <button
            type="button"
            onClick={onRerun}
            disabled={rerunLoading || running}
            aria-busy={rerunLoading || running}
            className="text-xs font-medium text-optio-purple hover:text-optio-purple-dark disabled:opacity-50 min-h-[32px] md:min-h-0 touch-manipulation"
          >
            {rerunLoading || running ? 'Reading…' : 'Re-run'}
          </button>
        )}
      </div>

      {running && (
        <p aria-live="polite" className="text-sm text-gray-600">Reading the evidence…</p>
      )}

      {status === 'not_run' && (
        <div className="text-sm text-gray-600">
          <p>The AI has not read this submission.</p>
          <button
            type="button"
            onClick={onRerun}
            disabled={rerunLoading}
            className="mt-2 btn-quiet text-optio-purple"
          >
            {rerunLoading ? 'Starting…' : 'Run AI review'}
          </button>
        </div>
      )}

      {status === 'skipped' && (
        <p className="text-sm text-gray-600">
          {ai?.skip_reason === 'ai_disabled_for_student'
            ? 'AI review is turned off for this student, so their work was not sent anywhere. Read it yourself.'
            : ai?.error || 'There was nothing for the AI to read.'}
        </p>
      )}

      {status === 'failed' && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-2">
          <p className="text-sm text-red-800">The AI review did not finish.</p>
          {ai?.error && <p className="text-xs text-red-700 mt-0.5">{ai.error}</p>}
        </div>
      )}

      {status === 'complete' && review && (
        <>
          <div>
            <p className="text-base font-semibold text-gray-900">
              The AI {meta.sentence}.
            </p>
            {review.summary && (
              <p className="text-sm text-gray-600 mt-1">{review.summary}</p>
            )}
            {percent && (
              <div className="mt-2 flex items-center gap-2">
                <div
                  role="meter"
                  aria-valuenow={Math.round((review.confidence || 0) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="AI confidence"
                  className="h-1.5 w-28 rounded-full bg-gray-200 overflow-hidden"
                >
                  <div
                    className="h-full bg-optio-purple"
                    style={{ width: `${Math.round((review.confidence || 0) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">{percent} confident</span>
              </div>
            )}
          </div>

          {review.xp && (
            <div className="rounded-lg bg-white border border-gray-200 p-3">
              {review.xp.changed ? (
                <>
                  <p className="text-sm text-gray-800">
                    <span className="text-gray-500">Claimed {review.xp.requested ?? claimedXp} XP.</span>{' '}
                    Suggests <strong>{review.xp.recommended} XP</strong>.
                  </p>
                  {review.xp.rationale && (
                    <p className="text-xs text-gray-500 mt-0.5">{review.xp.rationale}</p>
                  )}
                  {!canApplyXp && (
                    <p className="mt-1 text-xs text-gray-400">Optio sets the final XP.</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-600">
                  {review.xp.requested ?? claimedXp} XP fits this work.
                </p>
              )}
            </div>
          )}

          {note && (
            <div className="rounded-lg bg-white border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                {noteKind === 'grow_this' ? 'Note it would send back' : 'Note it would send'}
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{note}</p>
            </div>
          )}

          {(review.concerns || []).length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5">
              <p className="text-xs font-medium text-amber-900 mb-0.5">Worth a look</p>
              <ul className="space-y-0.5">
                {review.concerns.map((c, i) => (
                  <li key={i} className="text-xs text-amber-900">{c}</li>
                ))}
              </ul>
            </div>
          )}

          {canAccept ? (
            <button
              type="button"
              onClick={onAccept}
              className="btn-primary w-full min-h-[48px]"
            >
              {review.recommendation === 'approve'
                ? `Accept: approve at ${acceptedXp} XP`
                : 'Accept: send back with this note'}
              <Kbd>x</Kbd>
            </button>
          ) : review.recommendation === 'needs_human' ? (
            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              The AI wants a person to read this one. Decide below.
            </p>
          ) : null}

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
    </section>
  )
}


/**
 * The XP that will be awarded.
 *
 * Free for a superadmin, who is the final stamp; a number for anyone else,
 * because the final XP is Optio's call and letting a partner trim it on the way
 * through would make the second reviewer's figure a surprise. Commits on blur
 * rather than on every keystroke: rescaling the subject split around a
 * half-typed "1" would show a split nobody meant.
 */
const XpField = ({ claimedXp, xp, aiXp, aiRationale, editable, onChange }) => {
  const shown = xp ?? claimedXp
  const [draft, setDraft] = useState(String(shown ?? ''))

  const commit = () => {
    const n = parseInt(draft, 10)
    if (Number.isNaN(n)) { setDraft(String(shown ?? '')); return }
    const clamped = Math.max(MIN_XP, n)
    setDraft(String(clamped))
    onChange(clamped === claimedXp ? null : clamped)
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
        <label htmlFor="grader-xp" className="block text-sm font-medium text-gray-700">
          XP to award
        </label>
        <div className="flex items-center gap-2 text-xs">
          {editable && aiXp != null && xp !== aiXp && (
            <button
              type="button"
              onClick={() => onChange(aiXp, aiRationale)}
              className="font-medium text-optio-purple hover:text-optio-purple-dark min-h-[32px] md:min-h-0 touch-manipulation"
            >
              Apply {aiXp} XP
            </button>
          )}
          {editable && xp != null && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="font-medium text-gray-500 hover:text-gray-700 min-h-[32px] md:min-h-0 touch-manipulation"
            >
              Revert to {claimedXp} XP
            </button>
          )}
        </div>
      </div>
      {editable ? (
        <div className="flex items-center gap-3">
          <input
            id="grader-xp"
            type="number"
            min={MIN_XP}
            step="5"
            inputMode="numeric"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
            className="w-28 text-base md:text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple px-3 py-2"
          />
          {xp != null && xp !== claimedXp && (
            <span className="text-xs text-gray-500">
              <s className="text-gray-400">{claimedXp} XP</s>
              <span className="ml-1 text-optio-purple font-medium">
                {xp === aiXp ? 'AI-adjusted' : 'Adjusted'}
              </span>
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-700">
          {claimedXp} XP <span className="text-xs text-gray-400">· Optio sets the final XP</span>
        </p>
      )}
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


export default GraderDecision
