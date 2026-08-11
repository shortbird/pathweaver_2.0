import React from 'react'

/**
 * The one loading spinner (docs/design/DESIGN_SYSTEM.md §8).
 * Replaces the ~5 hand-rolled variants (border-4, border-t-transparent,
 * border-primary, gray) that accumulated across pages.
 */
const SIZES = {
  sm: 'h-5 w-5',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
}

export function Spinner({ size = 'md', className = '' }) {
  return (
    <div
      className={`animate-spin rounded-full border-b-2 border-optio-purple ${SIZES[size] || SIZES.md} ${className}`}
    />
  )
}

/** Whole-page loading state; role=status so screen readers announce the wait. */
export function PageLoader({ label = 'Loading', className = 'min-h-[40vh]' }) {
  return (
    <div role="status" aria-label={label} className={`flex items-center justify-center ${className}`}>
      <Spinner size="lg" />
    </div>
  )
}

/** White spinner for inside gradient/dark buttons. */
export function ButtonSpinner({ className = '' }) {
  return <Spinner size="sm" className={`border-white ${className}`} />
}

export default Spinner
