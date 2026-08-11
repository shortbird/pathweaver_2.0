import React from 'react'

/**
 * The one empty-state block (docs/design/DESIGN_SYSTEM.md §8). Promoted from
 * StudentFeedbackPage's empty state, the nicest of the ~20 ad-hoc versions.
 *
 * Renders inside a card by default; pass plain to drop the card chrome when
 * the empty state sits inside an existing card.
 */
export default function EmptyState({ icon: Icon, title, hint, action, plain = false, className = '' }) {
  const body = (
    <>
      {Icon && <Icon aria-hidden="true" className="mx-auto mb-4 w-16 h-16 text-gray-300" />}
      <p className="text-gray-500 font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-gray-400">{hint}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </>
  )
  if (plain) {
    return <div className={`text-center py-12 ${className}`}>{body}</div>
  }
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center ${className}`}>
      {body}
    </div>
  )
}
