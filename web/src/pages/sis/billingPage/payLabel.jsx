/**
 * Extracted from sis/BillingPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import METHOD_LABEL from './METHOD_LABEL'

const BRAND = { amex: 'Amex', mastercard: 'Mastercard', visa: 'Visa', discover: 'Discover' }

/**
 * How a payment was made, as a receipt prints it: "Check", or for a card
 * "Card (Visa ending 4242)".
 *
 * iCreate, ticket 03226ede (2026-09-24): "On receipts, can you add method of
 * payment (card/check) and last four digits of card number if paid by card so
 * that people can turn those in for reimbursements?" A card payment without
 * stored details (one the backfill could not read) prints plain "Card".
 */
export const methodLabel = (pmt) => {
  const base = METHOD_LABEL[pmt.method] || pmt.method || 'Payment'
  if (pmt.method !== 'card' || !pmt.card_last4) return base
  const raw = String(pmt.card_brand || '').toLowerCase()
  const brand = BRAND[raw] || (raw ? raw[0].toUpperCase() + raw.slice(1) : 'Card')
  return `${base} (${brand} ending ${pmt.card_last4})`
}

const payLabel = (pmt) => `${(pmt.amount_cents || 0) < 0 ? 'Refund — ' : ''}${methodLabel(pmt)}`

export default payLabel
