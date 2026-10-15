import React, { useEffect, useRef, useState } from 'react'
import { PageLoader } from '../../ui/Spinner'
import AiBadge from '../AiBadge'
import StatusPill from '../StatusPill'
import GraderTaskCard from './GraderTaskCard'
import GraderEvidence from './GraderEvidence'
import GraderDecision from './GraderDecision'
import GraderFrame from './GraderFrame'
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
  onRerunAi, rerunAiLoading, onOpenStory, onOpenStudent,
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
  // A superadmin's queue mixes every org. The name alone does not say whose
  // standard applies, so the school sits beside it, labelled, on every screen
  // size. A platform student has no school and is labelled as such.
  const orgName = item?.organization_name
    || (ready && detail.student?.organization_name)
    || ''
  const isPlatformStudent = item?.is_org_student === false && !orgName
  const taskTitle = item?.task_title || (ready && detail.task?.title) || ''

  return (
    <GraderFrame
      label="Credit grader"
      itemKey={item?.completion_id}
      index={index}
      total={total}
      onPrev={onPrev}
      onNext={onNext}
      onExit={onExit}
      onShowShortcuts={onShowShortcuts}
      heading={(
        <>
          {onOpenStudent && item?.student_id ? (
            <button
              type="button"
              // The draft travels with the click so it is waiting on return.
              onClick={() => onOpenStudent(item, decision.feedback)}
              className="min-w-0 truncate text-sm font-semibold text-gray-900 hover:text-optio-purple hover:underline underline-offset-2"
              title={`Open ${studentName}'s profile`}
            >
              {studentName}
            </button>
          ) : (
            <span className="truncate text-sm font-semibold text-gray-900">{studentName}</span>
          )}
          {orgName && (
            <span
              className="shrink-0 max-w-[10rem] sm:max-w-[16rem] truncate rounded-full bg-optio-purple/10 px-2 py-0.5 text-xs font-medium text-optio-purple"
              title={`Organization: ${orgName}`}
            >
              <span className="sr-only">School: </span>
              {orgName}
            </span>
          )}
          {isPlatformStudent && (
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              No school
            </span>
          )}
          {taskTitle && (
            <>
              <span className="text-gray-300 hidden sm:inline" aria-hidden="true">·</span>
              <span className="truncate text-sm text-gray-600 hidden sm:inline">{taskTitle}</span>
            </>
          )}
          <StatusPill status={item?.diploma_status} size="xs" className="hidden md:inline-flex" />
          {decision.showAi && <AiBadge size="xs" {...aiItemSummary(item)} className="hidden md:inline-flex" />}
        </>
      )}
      main={ready ? (
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
      aside={ready ? (
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
    />
  )
}

export default GraderView
