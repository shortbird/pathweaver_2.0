import React, { useEffect, useRef } from 'react'

/**
 * The grader's frame: one item, the whole screen, the work on the left and
 * the decision on the right. Shared by the credit grader (GraderView) and the
 * SIS Submissions review (pages/sis/classesPage/SubmissionGrader), so the two
 * review screens look and move alike (Tanner, 2026-10-15).
 *
 * Covers the app chrome on purpose. A reviewer working a queue of forty does
 * not need the sidebar, and every pixel it took was a pixel of evidence that
 * had to scroll. Both columns scroll on their own so the decision never
 * leaves the screen while the evidence is read.
 *
 * The frame knows nothing about what is decided. `heading` is the middle of
 * the top bar (who and what); `main` and `aside` are the two columns.
 */
const GraderFrame = ({
  label, itemKey, heading, main, aside,
  index, total, onPrev, onNext, onExit, onShowShortcuts,
}) => {
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
  }, [itemKey])

  return (
    // Not role="dialog": the confirm dialogs that open over this are, and a
    // test (or a screen reader) asking for "the dialog" should get those.
    <section
      aria-label={label}
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
          {heading}
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
          {main}
        </main>

        <aside
          ref={asideRef}
          aria-label="Decision"
          className="lg:min-h-0 lg:overflow-y-auto bg-white border-t lg:border-t-0 lg:border-l border-gray-200"
        >
          {aside}
        </aside>
      </div>
    </section>
  )
}

export default GraderFrame
