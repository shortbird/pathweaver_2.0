/**
 * Extracted from sis/ClassesPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

const Chip = ({ children, className = '' }) => (
  <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 shadow-sm ${className}`}>{children}</span>
)

// Quest descriptions are stored as HTML; render them as plain text here.

export default Chip
