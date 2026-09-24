/**
 * iCreate, ticket 03226ede (2026-09-24): "On receipts, can you add method of
 * payment (card/check) and last four digits of card number if paid by card so
 * that people can turn those in for reimbursements to various entities?"
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import payLabel, { methodLabel } from './payLabel'
import METHOD_LABEL from './METHOD_LABEL'
import PAYMENT_METHODS from './PAYMENT_METHODS'
import ReceiptModal from './ReceiptModal'

describe('methodLabel', () => {
  it('names the card and its last four', () => {
    expect(methodLabel({ method: 'card', card_brand: 'visa', card_last4: '4242' }))
      .toBe('Card (Visa ending 4242)')
    expect(methodLabel({ method: 'card', card_brand: 'amex', card_last4: '0005' }))
      .toBe('Card (Amex ending 0005)')
  })

  it('capitalises a brand it has no special name for', () => {
    expect(methodLabel({ method: 'card', card_brand: 'jcb', card_last4: '0000' }))
      .toBe('Card (Jcb ending 0000)')
  })

  it('prints plain Card when the card details were never stored', () => {
    // Older payments the backfill could not read, and any Stripe hiccup.
    expect(methodLabel({ method: 'card' })).toBe('Card')
    expect(methodLabel({ method: 'card', card_brand: 'visa', card_last4: null })).toBe('Card')
  })

  it('leaves every other method as it was', () => {
    expect(methodLabel({ method: 'check' })).toBe('Check')
    expect(methodLabel({ method: 'zelle', card_last4: '4242' })).toBe('Zelle')
    expect(methodLabel({ method: null })).toBe('Payment')
  })

  it('keeps the refund prefix in front of a card refund', () => {
    expect(payLabel({ method: 'card', card_brand: 'visa', card_last4: '4242', amount_cents: -500 }))
      .toBe('Refund — Card (Visa ending 4242)')
  })

  it('labels card without offering it as a method the office can record by hand', () => {
    expect(METHOD_LABEL.card).toBe('Card')
    expect(PAYMENT_METHODS.map(([k]) => k)).not.toContain('card')
  })
})

describe('the office receipt', () => {
  it('prints the card and last four beside the check on the same invoice', () => {
    const row = {
      family_name: 'Barker Family', description: 'Tuition', amount_paid_cents: 8000,
      payments: [
        { id: 'p1', method: 'card', card_brand: 'visa', card_last4: '4242', amount_cents: 5000,
          recorded_at: '2026-09-02T10:00:00Z' },
        { id: 'p2', method: 'check', amount_cents: 3000, recorded_at: '2026-09-01T10:00:00Z',
          external_ref: '1041' },
      ],
    }
    render(<ReceiptModal row={row} onClose={() => {}} onPrint={() => {}} />)
    expect(screen.getByText(/^Card \(Visa ending 4242\) · 2026-09-02$/)).toBeInTheDocument()
    expect(screen.getByText(/^Check · 2026-09-01 · 1041$/)).toBeInTheDocument()
  })
})
