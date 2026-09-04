/**
 * Extracted from sis/BillingPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import METHOD_LABEL from './METHOD_LABEL'

const payLabel = (pmt) => `${(pmt.amount_cents || 0) < 0 ? 'Refund — ' : ''}${METHOD_LABEL[pmt.method] || pmt.method || 'Payment'}`

export default payLabel
