import React, { useEffect, useRef, useState } from 'react'
import { PageLoader } from '../../ui/Spinner'
import AiBadge from '../AiBadge'
import StatusPill from '../StatusPill'
import GraderTaskCard from './GraderTaskCard'
import GraderEvidence from './GraderEvidence'
import GraderDecision from './GraderDecision'
import useCreditDecision from '../useCreditDecision'
import { aiItemSummary, evidenceAnchorId, resolveEvidenceRef } from '../aiReview'

/**
 * The grader: one credit request, the whole screen.
 *
 * Covers the app chrome on purpose. A reviewer working a queue of forty does
 * not need the sidebar, and every pixel it took was a pixel of evidence that
 * had to scroll. Left is what to judge (task, definition of done, the work);
 * right is the judgment (the AI's, then the reviewer's). Both scroll on their
 * own so the decision never leaves the screen while the evidence is read.
 *
 * The page still owns the queue, the fetches and the keyboard shortcuts. This
 * is the one item, and prev/next are the only way it knows about the rest.
 */
const GraderView = ({
  item, detail, loading, studentContext, effectiveRole,
  index, total, onPrev, onNext, onExit, onShowShortcuts,
  onAdvance, onRefresh, onFeedbackChange, feedbackTextareaRef, decisionRef,
  onRerunAi, rerunAiLoading, onOpenStory,
}) => {
  const decision = useCreditDecision({
    item, detail, effectiveRole,
    onAdvance, onRefresh, onFeedbackChange, feedbackTextareaRef, decisionRef,
  })

  // Tagged with the completion it belongs to, so a highlight never carries
  // over to the next student without an effect to clear it.
  const [highlight, setHighlight] = useState({ id: null, blockId: null })
  const highlightedEvidence = highlight.id === item?.completion_id ? highlight.blockId : null
  const highlightTimer = useRef(null)
  useEffect(() => () => clearTimeout(highlightTimer.current), [])

  // The page underneath must not scroll while the grader is up: a trackpad
  // flick that reaches the queue behind a full-screen pane is disorienting.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  // Everything below is keyed on the item, so a new item starts at the top.
  const mainRef = useRef(null)
  const asideRef = useRef(null)
  useEffect(() => {
    mainRef.current?.scrollTo?.(0, 0)
    asideRef.current?.scrollTo?.(0, 0)
  }, [item?.completion_id])

  // `detail` lags `item` by one fetch. Until it catches up, the previous
  // student's evidence is what would render under this student's name.
  const ready = !loading && detail?.completion?.id === item?.completion_id
  const aiReview = decision.aiReview
  const evidenceBlocks = detail?.evidence_blocks || []
  const readableRefs = (aiReview?.evidence || [])
    .filter(e => e.status === 'read')
    .map(e => e.index)

  const jumpToEvidence = (refIndex) => {
    const blockId = resolveEvidenceRef(refIndex, aiReview, evidenceBlocks)
    if (!blockId) return
    const el = document.getElementById(evidenceAnchorId(blockId))
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    el?.focus?.({ preventScroll: true })
    setHighlight({ id: item?.completion_id, blockId })
    clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(
      () => setHighlight({ id: null, blockId: null }), 1600)
  }

  // The header prefers the row it was opened from: it is right immediately,
  // and the detail behind it may still belong to the previous student.
  const studentName = item?.student_name
    || (ready && `${detail.student?.first_name || ''} ${detail.student?.last_name || ''}`.trim())
    || (ready && detail.student?.display_name)
    || 'Student'
  const taskTitle = item?.task_title || (ready && detail.task?.title) || ''

  return (
    // Not role="dialog": the confirm dialogs that open over this are, and a
    // test (or a screen reader) asking for "the dialog" should get those.
    <section
      aria-label="Credit grader"
      className="fixed inset-0 z-50 flex flex-col bg-neutral-50"
    >
      <header className="shrink-0 flex items-center gap-2 md:gap-3 px-3 md:px-4 h-14 bg-white border-b border-gray-200">
        <button
          type="button"
          onClick={onExit}
          className="btn-quiet shrink-0 px-3"
          aria-label="Back to queue"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="hidden sm:inline">Queue</span>
        </button>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-gray-900">{studentName}</span>
          {taskTitle && (
            <>
              <span className="text-gray-300 hidden sm:inline" aria-hidden="true">·</span>
              <span className="truncate text-sm text-gray-600 hidden sm:inline">{taskTitle}</span>
            </>
          )}
          <StatusPill status={item?.diploma_status} size="xs" className="hidden md:inline-flex" />
          {decision.showAi && <AiBadge size="xs" {...aiItemSummary(item)} className="hidden md:inline-flex" />}
        </div>

        <div className="shrink-0 flex items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            disabled={index <= 0}
            className="btn-quiet px-2.5"
            aria-label="Previous item"
            title="Previous (k)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm text-gray-500 tabular-nums px-1 whitespace-nowrap" aria-live="polite">
            {index >= 0 ? index + 1 : '–'} / {total}
          </span>
          <button
            type="button"
            onClick={onNext}
            disabled={index >= total - 1}
            className="btn-quiet px-2.5"
            aria-label="Next item"
            title="Next (j)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {onShowShortcuts && (
            <button
              type="button"
              onClick={onShowShortcuts}
              className="btn-quiet px-2.5 text-gray-500 hidden md:inline-flex"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
            >
              ?
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_440px] xl:grid-cols-[minmax(0,1fr)_480px]">
        <main ref={mainRef} className="lg:min-h-0 lg:overflow-y-auto px-4 py-5 md:px-8 md:py-6">
          {ready ? (
            <div className="max-w-3xl space-y-8">
              <GraderTaskCard
                task={detail.task}
                quest={detail.quest}
                student={detail.student}
                completion={detail.completion}
                isOrgStudent={detail.is_org_student || item?.is_org_student || false}
                aiReview={aiReview}
                onJumpToEvidence={jumpToEvidence}
                readableRefs={readableRefs}
              />
              <GraderEvidence
                completionId={item?.completion_id}
                evidenceBlocks={evidenceBlocks}
                reviewRounds={detail.review_rounds}
                aiByRound={detail.ai_by_round}
                showAi={decision.showAi}
                highlightedEvidence={highlightedEvidence}
              />
            </div>
          ) : (
            <PageLoader label="Loading submission" />
          )}
        </main>

        <aside
          ref={asideRef}
          aria-label="Decision"
          className="lg:min-h-0 lg:overflow-y-auto bg-white border-t lg:border-t-0 lg:border-l border-gray-200"
        >
          {ready ? (
            <GraderDecision
              item={item}
              detail={detail}
              decision={decision}
              studentContext={studentContext}
              contextLoading={loading}
              onRerunAi={onRerunAi}
              rerunAiLoading={rerunAiLoading}
              onJumpToEvidence={jumpToEvidence}
              feedbackTextareaRef={feedbackTextareaRef}
              onOpenStory={onOpenStory}
            />
          ) : (
            <PageLoader label="Loading decision" className="min-h-[30vh]" />
          )}
        </aside>
      </div>
    </section>
  )
}

export default GraderView
