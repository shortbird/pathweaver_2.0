import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

/**
 * QF-02 guard: every step of the registration funnel still renders after the
 * page was split into per-step components.
 *
 * A page split is only behaviour-preserving if each piece still gets the props
 * it reads, and a missed prop is invisible until somebody reaches that step --
 * which for this page means a parent, mid-registration, on the step that
 * collects their child's date of birth. So this walks all seven, using the
 * funnel's own `?preview=1` mode: free navigation between steps, and no writes.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const CONFIG = {
  organization: { id: 'org-1', name: 'Test Academy' },
  questions: [
    { key: 'payment', label: 'How are you paying?', type: 'select', required: true,
      options: ['Self-Pay', 'Utah Fits All'] },
    { key: 'goals', label: "This child's goals", type: 'text', per_student: true },
  ],
  paperwork: [{ key: 'handbook', label: 'Family Handbook', body: 'Be kind.' }],
  registration_fee_cents: 5000,
  stripe_enabled: true,
  records_destination: true,
  emergency_contacts: true,
  post_registration_flow: 'schedule',
}

vi.mock('../../../services/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: {
      ...actual.default,
      get: vi.fn(() => Promise.resolve({ data: CONFIG })),
      post: vi.fn(() => Promise.resolve({ data: {} })),
    },
  }
})

import RegisterFunnelPage from '../../RegisterFunnelPage'

const renderFunnel = () => {
  window.history.replaceState({}, '', '/register/icreate/TESTCODE?preview=1')
  return render(
    <MemoryRouter initialEntries={['/register/icreate/TESTCODE']}>
      <Routes>
        <Route path="/register/icreate/:code" element={<RegisterFunnelPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// The stepper is the only way between steps without submitting anything.
const goToStep = async (label) => {
  const buttons = await screen.findAllByText(label)
  fireEvent.click(buttons[0].closest('button') || buttons[0])
}

describe('registration funnel steps render after the split', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens on the account step', async () => {
    renderFunnel()
    expect(await screen.findByText('Your account')).toBeInTheDocument()
    // Twice: the create/sign-in toggle, and the submit button under it.
    expect(screen.getAllByText('Create account')).toHaveLength(2)
  })

  it('renders the family step, including a child card and the fee estimate', async () => {
    renderFunnel()
    await screen.findByText('Your account')
    await goToStep('Your family')
    expect(await screen.findByText('Contact & address')).toBeInTheDocument()
    expect(screen.getByText('Children')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('MM/DD/YYYY')).toBeInTheDocument()
  })

  it('renders the details step with the org questions', async () => {
    renderFunnel()
    await screen.findByText('Your account')
    await goToStep('Contacts & questions')
    expect(await screen.findByText('Emergency contacts')).toBeInTheDocument()
    expect(screen.getByText('How are you paying?')).toBeInTheDocument()
  })

  it('renders the school records step', async () => {
    renderFunnel()
    await screen.findByText('Your account')
    await goToStep('School records')
    expect(await screen.findByText(/Where should the school records go/)).toBeInTheDocument()
  })

  it('renders the paperwork step with the configured item', async () => {
    renderFunnel()
    await screen.findByText('Your account')
    await goToStep('Paperwork')
    expect(await screen.findByText('Family Handbook')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Type your full name to sign')).toBeInTheDocument()
  })

  it('renders the fee step', async () => {
    renderFunnel()
    await screen.findByText('Your account')
    await goToStep('Registration fee')
    // The amount is the point of the assertion: it proves feeCents and
    // config.stripe_enabled both reached FeeStep, not just that a shell rendered.
    expect(await screen.findByText('$50.00')).toBeInTheDocument()
    expect(screen.getByText('Pay $50.00 securely')).toBeInTheDocument()
  })

  it('renders the finish step', async () => {
    renderFunnel()
    await screen.findByText('Your account')
    await goToStep('Next steps')
    expect(await screen.findByText('Your account is ready')).toBeInTheDocument()
  })
})
