/**
 * Extracted from sis/BillingPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import PAYMENT_METHODS from './PAYMENT_METHODS'

// Card is labelled here but is not in PAYMENT_METHODS: that list is what the
// office can record by hand, and only Stripe records a card payment.
const METHOD_LABEL = { ...Object.fromEntries(PAYMENT_METHODS), card: 'Card' }

// A negative payment record is a refund — label it as one wherever payments list.

export default METHOD_LABEL
