/**
 * CoachMark Component
 *
 * Tooltip-style popover for guided walkthrough.
 * Two modes:
 * - Centered card (no targetSelector): modal-style overlay card
 * - Coach mark (with targetSelector): positioned near a DOM element with cutout
 */

import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const CoachMark = ({
  targetSelector,
  title,
  content,
  stepNumber,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  isActive,
}) => {
  const [targetRect, setTargetRect] = useState(null)
  const cardRef = useRef(null)

  useEffect(() => {
    if (!isActive || !targetSelector) {
      setTargetRect(null)
      return
    }

    let hasScrolled = false

    const updateRect = () => {
      const el = document.querySelector(targetSelector)
      if (el) {
        setTargetRect(el.getBoundingClientRect())
      } else {
        setTargetRect(null)
      }
    }

    const findAndScroll = () => {
      const el = document.querySelector(targetSelector)
      if (el) {
        const rect = el.getBoundingClientRect()
        setTargetRect(rect)
        // Scroll so target is in upper third, leaving room for card below
        if (!hasScrolled) {
          hasScrolled = true
          const cardHeight = 220
          const desiredTop = window.innerHeight * 0.2
          const scrollNeeded = rect.top - desiredTop
          if (rect.bottom + cardHeight > window.innerHeight || rect.top < 0) {
            window.scrollBy({ top: scrollNeeded, behavior: 'smooth' })
            // Update rect after scroll settles
            setTimeout(updateRect, 400)
          }
        }
      } else {
        setTargetRect(null)
      }
    }

    // Delay to let DOM settle (e.g., after auto-expanding a quest)
    const timeout = setTimeout(findAndScroll, 300)
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)

    return () => {
      clearTimeout(timeout)
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [isActive, targetSelector])

  if (!isActive) return null

  const isCentered = !targetSelector

  // Don't render until target is found (prevents flash at wrong position)
  if (!isCentered && !targetRect) return null

  // Calculate card position relative to target
  let cardStyle = {}
  if (targetRect && !isCentered) {
    const gap = 20
    const highlightPad = 4
    const cardWidth = 340
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // Position below the highlight ring
    let top = targetRect.bottom + highlightPad + gap
    let left = targetRect.left + targetRect.width / 2 - cardWidth / 2

    // Clamp left
    left = Math.max(12, Math.min(left, viewportWidth - cardWidth - 12))

    // If card would go below viewport, position above the highlight ring
    if (top + 200 > viewportHeight) {
      top = targetRect.top - highlightPad - gap - 200
    }

    cardStyle = {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${cardWidth}px`,
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: 'auto' }}>
        {/* Overlay */}
        <svg
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'none' }}
        >
          <defs>
            <mask id="coach-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {targetRect && (
                <rect
                  x={targetRect.left - 4}
                  y={targetRect.top - 4}
                  width={targetRect.width + 8}
                  height={targetRect.height + 8}
                  rx="8"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.5)"
            mask="url(#coach-mask)"
          />
        </svg>

        {/* Clickable overlay (skip on click outside) */}
        <div
          className="absolute inset-0"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              // Don't skip on overlay click, just consume it
            }
          }}
          style={{ pointerEvents: 'auto' }}
        />

        {/* Target highlight ring */}
        {targetRect && (
          <div
            className="absolute border-2 border-white rounded-lg pointer-events-none"
            style={{
              top: targetRect.top - 4,
              left: targetRect.left - 4,
              width: targetRect.width + 8,
              height: targetRect.height + 8,
            }}
          />
        )}

        {/* Card */}
        <motion.div
          ref={cardRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={`bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden ${
            isCentered ? 'fixed inset-0 m-auto w-[90vw] max-w-md h-fit' : ''
          }`}
          style={isCentered ? {} : cardStyle}
        >
          {/* Purple accent bar */}
          <div className="h-1 bg-gradient-to-r from-optio-purple to-optio-pink" />

          <div className="p-5">
            {/* Step counter */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-optio-purple">
                Step {stepNumber + 1} of {totalSteps}
              </span>
              <button
                onClick={onSkip}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Skip tour
              </button>
            </div>

            {/* Title */}
            <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>

            {/* Content */}
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              {content}
            </p>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === stepNumber
                        ? 'bg-optio-purple'
                        : i < stepNumber
                          ? 'bg-optio-purple/40'
                          : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                {stepNumber > 0 && (
                  <button
                    onClick={onPrev}
                    className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={onNext}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-optio-purple rounded-lg hover:bg-optio-purple/90 transition-colors"
                >
                  {stepNumber === totalSteps - 1 ? 'Got it!' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

export default CoachMark
