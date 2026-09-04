/**
 * Extracted from sis/BillingPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

const money = (cents) => (cents == null ? '—' : `${cents < 0 ? '−' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`)

export default money
