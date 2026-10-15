import React from 'react'

/**
 * The dark bar that floats over a review queue while rows are selected: the
 * count, the actions, and Deselect. It is the credit queue's bulk bar
 * (BulkActionBar) without the credit actions, so the SIS Submissions queue
 * puts its own Accept on the same bar.
 */
const FloatingActionBar = ({ count, onDeselectAll, children }) => (
  <div
    role="region"
    aria-label="Bulk actions"
    className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-xl flex items-center gap-4 z-50"
  >
    <span className="text-sm font-medium">{count} selected</span>
    {children}
    <button
      type="button"
      onClick={onDeselectAll}
      className="px-3 py-1.5 text-sm bg-gray-700 rounded-lg hover:bg-gray-600"
    >
      Deselect
    </button>
  </div>
)

export default FloatingActionBar
