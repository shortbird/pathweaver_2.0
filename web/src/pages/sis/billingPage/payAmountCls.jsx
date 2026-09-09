/**
 * Extracted from sis/BillingPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

const payAmountCls = (pmt) => ((pmt.amount_cents || 0) < 0 ? 'text-red-700' : 'text-green-700')

// What a charge is for. 'unclassified' covers every line written before the
// kind column existed, plus manual charges — labelled honestly rather than
// guessed at from the description text.

export default payAmountCls
