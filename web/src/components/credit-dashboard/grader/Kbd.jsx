import React from 'react'

/**
 * The keyboard hint on a decision button ("Approve  a"). Shared by the credit
 * grader and the SIS Submissions review, whose buttons answer the same keys.
 */
const Kbd = ({ children }) => (
  <kbd
    aria-hidden="true"
    className="hidden md:inline-flex items-center justify-center ml-2 min-w-[20px] h-5 px-1 text-[10px] font-mono rounded border border-current opacity-60"
  >
    {children}
  </kbd>
)

export default Kbd
