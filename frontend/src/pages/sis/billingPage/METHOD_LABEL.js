/**
 * Extracted from sis/BillingPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import PAYMENT_METHODS from './PAYMENT_METHODS'

const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS)

// A negative payment record is a refund — label it as one wherever payments list.

export default METHOD_LABEL
