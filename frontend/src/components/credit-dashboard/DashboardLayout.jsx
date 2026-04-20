import React from 'react'

/**
 * Credit-dashboard layout.
 *
 * Desktop: a three-panel split (list | detail | optional context), sized
 * for at least an iPad. Widescreens get more detail space; list and context
 * stay fixed.
 *
 * Mobile (isMobile=true): one panel at a time. Until the reviewer taps an
 * item the list fills the viewport. Once `hasSelection` is true we swap to
 * the detail view and drop in a ← Back to list affordance at the top.
 *
 * The page owns viewport detection and selection state; this component is
 * pure presentation so it can be exercised with a Vitest `render` — no
 * jsdom matchMedia gymnastics required.
 */
const DashboardLayout = ({ children, isMobile = false, hasSelection = false, onBackToList }) => {
  const [list, detail, context] = React.Children.toArray(children)

  if (isMobile) {
    if (!hasSelection) {
      return (
        <div className="flex flex-1 flex-col overflow-hidden bg-gray-100 p-2">
          <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow-sm">
            {list}
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-1 flex-col overflow-hidden bg-gray-100 p-2">
        <button
          type="button"
          onClick={onBackToList}
          className="flex items-center gap-2 px-3 py-3 mb-2 bg-white rounded-lg shadow-sm text-sm font-medium text-optio-purple min-h-[44px] touch-manipulation"
          aria-label="Back to list"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to list
        </button>
        <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow-sm">
          {detail}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden bg-gray-100 gap-3 p-3">
      {/* Left panel - item list */}
      <div className="w-[300px] min-w-[300px] overflow-y-auto bg-white rounded-lg shadow-sm">
        {list}
      </div>

      {/* Center panel - detail */}
      <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow-sm">
        {detail}
      </div>

      {/* Right panel - student context */}
      {context && (
        <div className="w-[300px] min-w-[300px] overflow-y-auto bg-white rounded-lg shadow-sm">
          {context}
        </div>
      )}
    </div>
  )
}

export default DashboardLayout
