import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import api from '../../../services/api'
import RegisterFunnelPage from '../../RegisterFunnelPage'

/**
 * Coming back from Stripe on /enroll/resume (Sadie Davis, 2026-09-10).
 *
 * A signed-in parent pays from /enroll/resume, so Stripe sends her back to
 * /enroll/resume?payment=return. That path rehydrates the registration from
 * the server, and the return handler used to bail as soon as `reg` was set --
 * it only knew the /enroll/<code> shape, where a reload starts with no `reg`
 * and sessionStorage holds the identity. The fee step came back saying "Pay
 * $125" and she paid three times in ninety seconds (Jacob Zonts, twice, on
 * 2026-08-28). The return must verify the payment on BOTH paths, and a
 * checkout the server refuses with 409 + already_paid verifies instead of
 * charging again.
 */

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const REGISTRATION = {
  registration_id: 'reg-1',
  access_token: 'tok',
  status: 'fee',
  fee_cents: 12500,
  kids: [{ user_id: 'kid-1', first_name: 'Navy', last_name: 'Davis', name: 'Navy Davis', dob: '2014-02-21' }],
  paperwork: [],
  answers: {},
  emergency_contacts: [],
}

const CONFIG = {
  organization: { id: 'org-icreate', name: 'iCreate' },
  questions: [],
  paperwork: [],
  fee_mode: 'lesser',
  registration_fee_cents: 12500,
  per_student_fee_cents: 5000,
  payment_url: '',
  stripe_enabled: true,
  emergency_contacts: false,
  health_fields: false,
  registration: REGISTRATION,
}

vi.mock('../../../services/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: { ...actual.default, get: vi.fn(), post: vi.fn() },
  }
})

// The fee, itemized by the server (registration_pricing.quote); the page
// draws these lines and prices nothing itself.
const QUOTE = {
  cadence: 'once', fee: { amount_cents: 12500, deferred: false, waived: false },
  monthly: { total_cents: 0, plan: null }, due_today_cents: 12500,
  lines: [{ key: 'registration_fee', label: 'Registration fee', amount_cents: 12500, cadence: 'once', students: [], capped: false }],
}

const FEE_STATUS = {
  success: true, status: 'fee', fee_cents: 12500, monthly_cents: 0, kids: [],
  fee_deferred: false, stripe_enabled: true, requires_card: true, already_completed: false,
}
const CONFIRMED = { success: true, status: 'completed', scheduling_url: '', scheduling_emailed: false }

const posts = () => api.post.mock.calls.map(([url]) => url)

const renderResume = (search) => {
  window.history.replaceState({}, '', `/enroll/resume${search}`)
  return render(
    <MemoryRouter initialEntries={[`/enroll/resume${search}`]}>
      <Routes>
        <Route path="/enroll/resume" element={<RegisterFunnelPage />} />
        <Route path="/enroll/:code" element={<RegisterFunnelPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('returning from Stripe on /enroll/resume', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    sessionStorage.clear()
    api.get.mockImplementation((url) => {
      if (url === '/api/registration/my-registration') return Promise.resolve({ data: CONFIG })
      return Promise.reject(new Error(`unexpected GET ${url}`))
    })
    api.post.mockImplementation((url) => {
      if (url.endsWith('/fee-status')) return Promise.resolve({ data: FEE_STATUS })
      if (url.endsWith('/confirm-payment')) return Promise.resolve({ data: CONFIRMED })
      if (url.endsWith('/quote')) return Promise.resolve({ data: { success: true, quote: QUOTE } })
      return Promise.resolve({ data: {} })
    })
  })

  it('?payment=return verifies the payment instead of offering Pay again', async () => {
    renderResume('?payment=return')
    await waitFor(() => {
      expect(posts()).toContain('/api/registration/registrations/reg-1/confirm-payment')
    })
    // The query is consumed so a reload cannot re-fire the verification.
    expect(window.location.search).toBe('')
    // Verified: the funnel lands on the done step, not on a Pay button.
    await waitFor(() => {
      expect(screen.queryByText(/Pay \$125\.00 securely/)).toBeNull()
    })
  })

  it('a plain resume (no ?payment) does not verify', async () => {
    renderResume('')
    await screen.findByText(/Pay \$125\.00 securely/)
    expect(posts()).not.toContain('/api/registration/registrations/reg-1/confirm-payment')
  })

  it('?payment=canceled leaves the parent on the fee step without verifying', async () => {
    renderResume('?payment=canceled')
    await screen.findByText(/Pay \$125\.00 securely/)
    expect(posts()).not.toContain('/api/registration/registrations/reg-1/confirm-payment')
  })

  it('a 409 already_paid from /checkout verifies rather than charging again', async () => {
    api.post.mockImplementation((url) => {
      if (url.endsWith('/fee-status')) return Promise.resolve({ data: FEE_STATUS })
      if (url.endsWith('/confirm-payment')) return Promise.resolve({ data: CONFIRMED })
      if (url.endsWith('/checkout')) {
        return Promise.reject({ response: { status: 409, data: { already_paid: true, error: 'already paid' } } })
      }
      if (url.endsWith('/quote')) return Promise.resolve({ data: { success: true, quote: QUOTE } })
      return Promise.resolve({ data: {} })
    })
    renderResume('')
    fireEvent.click(await screen.findByText(/Pay \$125\.00 securely/))
    await waitFor(() => {
      expect(posts()).toContain('/api/registration/registrations/reg-1/confirm-payment')
    })
  })
})
