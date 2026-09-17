import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
// vi.mock is hoisted above every import by vitest, so the page can be imported
// here and still see the mocked api.
import RegisterFunnelPage from '../../RegisterFunnelPage'

/**
 * The payment step for an org on a monthly plan (Optio Academy, 2026-09-14):
 * no registration fee, $50 per student each month capped at $150 per family,
 * and an Optio teacher as a $500/month add-on that INCLUDES the program fee.
 *
 * Walked through the funnel's own ?preview=1 mode (free navigation, no
 * writes), the same way funnelStepsRender does. The assertions are the
 * arithmetic a family sees: $50 before the teacher is ticked, $500 after --
 * never $550 -- and the stepper calling the step what it now is.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const CONFIG = {
  organization: { id: 'org-academy', name: 'Optio Academy' },
  questions: [],
  paperwork: [{ key: 'agreement', label: 'Participant and Parent Agreement', body: 'Be kind.' }],
  fee_mode: 'flat',
  registration_fee_cents: 0,
  per_student_fee_cents: 0,
  payment_url: '',
  stripe_enabled: true,
  emergency_contacts: false,
  health_fields: false,
  post_registration_flow: 'goals',
  monthly: {
    per_student_cents: 5000,
    family_cap_cents: 15000,
    add_ons: [{
      key: 'teacher_support', label: 'Optio teacher support',
      description: 'A weekly meeting with an Optio teacher.',
      amount_cents: 50000, includes_program_fee: true,
    }],
  },
}

// The server's quote for the sample family (services/registration_pricing
// .quote): the base month, or the teacher's month once ticked. The browser
// does no arithmetic of its own any more -- it asks POST /api/registration/quote
// and draws the answer, so the test hands it the two answers.
const LINE = (key, label, amount_cents, students, cadence = 'month') => ({ key, label, amount_cents, students, capped: false, cadence })
const BASE_QUOTE = {
  cadence: 'monthly', lines: [LINE('program_fee', 'Program fee', 5000, ['Casey'])],
  fee: { amount_cents: 0, deferred: false, waived: false },
  monthly: { total_cents: 5000, plan: CONFIG.monthly }, due_today_cents: 5000,
}
const TEACHER_QUOTE = {
  ...BASE_QUOTE, lines: [LINE('teacher_support', 'Optio teacher support', 50000, ['Casey'])],
  monthly: { total_cents: 50000, plan: CONFIG.monthly }, due_today_cents: 50000,
}
const quoteFor = (body) => ((body?.kids || []).some((k) => (k.add_ons || []).includes('teacher_support'))
  ? TEACHER_QUOTE : BASE_QUOTE)

vi.mock('../../../services/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: {
      ...actual.default,
      get: vi.fn(() => Promise.resolve({ data: CONFIG })),
      post: vi.fn((url, body) => Promise.resolve(
        url === '/api/registration/quote' ? { data: { success: true, quote: quoteFor(body) } } : { data: {} })),
    },
  }
})

const renderFunnel = () => {
  window.history.replaceState({}, '', '/enroll/ACADEMY?preview=1')
  return render(
    <MemoryRouter initialEntries={['/enroll/ACADEMY']}>
      <Routes>
        <Route path="/enroll/:code" element={<RegisterFunnelPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const goToStep = async (label) => {
  const buttons = await screen.findAllByText(label)
  fireEvent.click(buttons[0].closest('button') || buttons[0])
}

describe('monthly payment step', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls the step "Monthly payment" in the stepper and never "Registration fee"', async () => {
    renderFunnel()
    await screen.findByText('Your account')
    expect(screen.getAllByText('Monthly payment').length).toBeGreaterThan(0)
    expect(screen.queryByText('Registration fee')).not.toBeInTheDocument()
  })

  it('prices the sample family at $50/month and offers the teacher as an add-on', async () => {
    renderFunnel()
    await screen.findByText('Your account')
    await goToStep('Monthly payment')
    expect(await screen.findByText('$50 per student each month, capped at $150 per family.')).toBeInTheDocument()
    // The sample kid's card: name, base price, the add-on with its price.
    expect(screen.getByText('Casey')).toBeInTheDocument()
    expect(screen.getByText('$50/month')).toBeInTheDocument()
    expect(screen.getByText('Add Optio teacher support')).toBeInTheDocument()
    expect(screen.getByText('$500/month')).toBeInTheDocument()
    expect(await screen.findByText('Total each month')).toBeInTheDocument()
    expect(await screen.findByText('Set up $50.00/month')).toBeInTheDocument()
  })

  it('a teacher replaces the program fee: $500, not $550', async () => {
    renderFunnel()
    await screen.findByText('Your account')
    await goToStep('Monthly payment')
    await screen.findByText('Add Optio teacher support')
    fireEvent.click(screen.getByRole('checkbox'))
    expect(await screen.findByText('Set up $500.00/month')).toBeInTheDocument()
    expect(screen.queryByText('Set up $550.00/month')).not.toBeInTheDocument()
    expect(screen.getByText('Program fee included below')).toBeInTheDocument()
    expect(screen.getByText('Includes the $50 program fee for Casey.')).toBeInTheDocument()
    // Untick: back to the base price.
    fireEvent.click(screen.getByRole('checkbox'))
    expect(await screen.findByText('Set up $50.00/month')).toBeInTheDocument()
  })
})
