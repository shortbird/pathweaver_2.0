/**
 * Extracted from pages/ScheduleBuilderPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import CheckIcon from './CheckIcon'

const UfaRow = ({ met, children }) => (
  <div className="flex items-start gap-2.5">
    {met ? (
      <CheckIcon className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
    ) : (
      <span className="w-5 h-5 shrink-0 mt-0.5 rounded-full border-2 border-amber-400 inline-block" aria-hidden="true" />
    )}
    <div className="text-sm text-gray-700 min-w-0">{children}</div>
  </div>
)

export default UfaRow
