import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PaidInFull, StripePlan } from './AcademyBillingPanel'
import api from '../../services/api'

vi.mock('../../services/api', () => ({ default: { post: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn() } }))

const PLAN = {
  status: 'active', monthly_cents: 10000, next_charge_on: '2026-11-12',
  payment_method: { type: 'card', brand: 'visa', last4: '4242' },
  receipts: [{ id: 'in_1', number: 'A-1', date: '2026-10-12', amount_cents: 10000,
    receipt_url: 'https://pay.stripe.com/r/1', pdf_url: 'https://pdf/1' }],
}

describe('Academy billing panel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('says an OpenEd family is paid in full', () => {
    render(<PaidInFull funder="OpenEd" />)
    expect(screen.getByText('Paid in full for this school year')).toBeInTheDocument()
    expect(screen.getByText(/OpenEd pays/)).toBeInTheDocument()
  })

  it('shows the monthly amount, next charge, card and receipt links', () => {
    render(<StripePlan organizationId="org-1" plan={PLAN} />)
    expect(screen.getAllByText('$100.00')).toHaveLength(2)
    expect(screen.getByText(/Next charge on November 12, 2026/)).toBeInTheDocument()
    expect(screen.getByText(/Visa ending in 4242/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', 'https://pay.stripe.com/r/1')
  })

  it('opens the Stripe portal for the payment method', async () => {
    api.post.mockResolvedValue({ data: { url: 'https://billing.stripe.com/s' } })
    delete window.location
    window.location = { href: 'https://app.optioeducation.com/family/billing' }
    render(<StripePlan organizationId="org-1" plan={PLAN} />)
    fireEvent.click(screen.getByRole('button', { name: /manage payment method/i }))
    await waitFor(() => expect(window.location.href).toBe('https://billing.stripe.com/s'))
    expect(api.post).toHaveBeenCalledWith('/api/sis/parent/billing/manage-payment',
      { organization_id: 'org-1', return_url: 'https://app.optioeducation.com/family/billing' })
  })

  it('says so when Stripe could not be read', () => {
    render(<StripePlan organizationId="org-1" plan={{ error: 'Could not load your payments from Stripe right now.' }} />)
    expect(screen.getByText(/Could not load your payments/)).toBeInTheDocument()
  })
})
