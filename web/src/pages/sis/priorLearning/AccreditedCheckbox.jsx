import React from 'react'

/**
 * Whether a school's credit came on an accredited school's official
 * transcript. It decides the price (shared/data/pricing.json): accredited
 * credit transfers free, the rest costs the student's credit price. Unticked
 * by default -- an office that forgets shows a fee it can correct before the
 * report goes out, where the other default would waive one silently.
 */
const AccreditedCheckbox = ({ id, checked, onChange, disabled }) => (
  <label htmlFor={id} className="flex items-start gap-2 text-sm text-gray-700">
    <input id={id} type="checkbox" className="mt-0.5" checked={checked} disabled={disabled}
           onChange={(e) => onChange(e.target.checked)} />
    <span>
      Official transcript from an accredited school
      <span className="block text-xs text-gray-500">Accredited credit transfers free.</span>
    </span>
  </label>
)

export default AccreditedCheckbox
