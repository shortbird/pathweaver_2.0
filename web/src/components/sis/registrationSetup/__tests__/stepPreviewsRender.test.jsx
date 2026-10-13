import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import api from '../../../../services/api'

/**
 * QF-02 guard: every step of the Registration setup editor still renders after
 * the tab was split into per-step preview components.
 *
 * This editor is the only place an org can change what its registration funnel
 * asks families, and each step carries its own Edit affordances. A prop dropped
 * in the split takes out one step's editor and nothing else, so walking all
 * seven is the only way to see it.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'superadmin' } }),
}))
vi.mock('../../../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(async () => true) }))

const REG_CONFIG = {
  paperwork: [{ key: 'handbook', label: 'Family Handbook', body: 'Be kind.' }],
  questions: [{ key: 'payment', label: 'How are you paying?', type: 'select',
    required: true, options: ['Self-Pay', 'Utah Fits All'] }],
  registration_fee_cents: 5000,
  emergency_contacts: true,
  records_destination: true,
  academy_enrollment: true,
  health_fields: true,
  scheduling_url: 'https://book.example.com',
  post_registration_flow: 'schedule',
}

const ORG_DATA = {
  organization: {
    id: 'org-1', name: 'Test Academy',
    feature_flags: { registration: REG_CONFIG, sis_settings: {} },
  },
}

vi.mock('../../../../services/api', async (importOriginal) => {
  const actual = await importOriginal()
  const get = vi.fn((url) => {
    if (url.includes('/invitations')) {
      return Promise.resolve({ data: { invitations: [
        { invitation_code: 'ABC123', role: 'parent', is_link: true, status: 'pending' },
      ] } })
    }
    if (url.includes('/api/sis/resources')) return Promise.resolve({ data: { resources: [] } })
    if (url.includes('/api/registration/config/')) return Promise.resolve({ data: REG_CONFIG })
    return Promise.resolve({ data: {} })
  })
  return {
    ...actual,
    default: {
      ...actual.default, get,
      // The draft's fee, quoted by the server (POST /api/registration/quote-preview).
      post: vi.fn((url) => Promise.resolve(url === '/api/registration/quote-preview'
        ? { data: { success: true, quote: {
          cadence: 'once', fee: { amount_cents: 5000, deferred: false, waived: false },
          monthly: { total_cents: 0, plan: null }, due_today_cents: 5000,
          lines: [{ key: 'registration_fee', label: 'Registration fee', amount_cents: 5000, cadence: 'once', students: [], capped: false }],
        } } }
        : { data: {} })),
      put: vi.fn(() => Promise.resolve({ data: {} })),
    },
  }
})

import RegistrationSetupTab from '../../RegistrationSetupTab'

const renderTab = () => render(
  <RegistrationSetupTab orgId="org-1" orgData={ORG_DATA} onUpdate={vi.fn()} />,
)

// The stepper is how staff move between steps; freeNav is always on here.
const goToStep = (label) => {
  const hit = screen.getAllByText(label)[0]
  fireEvent.click(hit.closest('button') || hit)
}

describe('registration setup step previews render after the split', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens on the account step', async () => {
    renderTab()
    expect(await screen.findByText('Your account')).toBeInTheDocument()
  })

  it('renders the family step with its editable zones', async () => {
    renderTab()
    await screen.findByText('Your account')
    goToStep('Your family')
    expect(await screen.findByText('Contact & address')).toBeInTheDocument()
    expect(screen.getByText('Children')).toBeInTheDocument()
  })

  it('renders the details step with the org question', async () => {
    renderTab()
    await screen.findByText('Your account')
    goToStep('Contacts & questions')
    expect(await screen.findByText('Emergency contacts')).toBeInTheDocument()
    expect(screen.getByText('How are you paying?')).toBeInTheDocument()
  })

  it('renders the school records step', async () => {
    renderTab()
    await screen.findByText('Your account')
    goToStep('School records')
    expect(await screen.findByText(/Where should the school records go/)).toBeInTheDocument()
  })

  it('renders the paperwork step with the configured item', async () => {
    renderTab()
    await screen.findByText('Your account')
    goToStep('Paperwork')
    expect(await screen.findByText('Family Handbook')).toBeInTheDocument()
    expect(screen.getByText('+ Add paperwork item')).toBeInTheDocument()
  })

  it('renders the fee step with the configured amount', async () => {
    renderTab()
    await screen.findByText('Your account')
    // The fee step exists once the server's quote says a fee applies.
    await screen.findByText('Registration fee')
    goToStep('Registration fee')
    expect(await screen.findByText('Edit fees & payment')).toBeInTheDocument()
    expect((await screen.findAllByText('$50.00')).length).toBeGreaterThan(0)
  })

  it('renders the finish step and its editor', async () => {
    renderTab()
    await screen.findByText('Your account')
    goToStep('Next steps')
    expect(await screen.findByText('Your account is ready')).toBeInTheDocument()
  })
})

describe('switching from the setup screen to the editor', () => {
  beforeEach(() => vi.clearAllMocks())

  const NOT_SET_UP = { organization: { id: 'org-1', name: 'Test Academy', feature_flags: { sis_settings: {} } } }

  /**
   * Sentry OPTIO-WEB-3C (2026-10-13, Apogee NoCo on /registration): "Rendered
   * more hooks than during the previous render". The "not set up" screen
   * returned before three hooks ran, so the render after "Set up family
   * registration" (cfg appears) called more hooks and the page crashed.
   */
  it('renders the editor when registration turns on, without a hooks crash', async () => {
    const { rerender } = render(
      <RegistrationSetupTab orgId="org-1" orgData={NOT_SET_UP} onUpdate={vi.fn()} />,
    )
    expect(screen.getByText('Family registration is not set up')).toBeInTheDocument()
    rerender(<RegistrationSetupTab orgId="org-1" orgData={ORG_DATA} onUpdate={vi.fn()} />)
    expect(await screen.findByText('Your account')).toBeInTheDocument()
  })

  it('fetches the registration link once the editor appears', async () => {
    const { rerender } = render(
      <RegistrationSetupTab orgId="org-1" orgData={NOT_SET_UP} onUpdate={vi.fn()} />,
    )
    expect(api.get.mock.calls.some(([url]) => url.includes('/invitations'))).toBe(false)
    rerender(<RegistrationSetupTab orgId="org-1" orgData={ORG_DATA} onUpdate={vi.fn()} />)
    await screen.findByText('Your account')
    await vi.waitFor(() => expect(api.get.mock.calls.some(([url]) => url.includes('/invitations'))).toBe(true))
  })

  it('asks for no price quote while registration is off', async () => {
    render(<RegistrationSetupTab orgId="org-1" orgData={NOT_SET_UP} onUpdate={vi.fn()} />)
    await new Promise((r) => setTimeout(r, 50))
    expect(api.post.mock.calls.some(([url]) => url === '/api/registration/quote-preview')).toBe(false)
  })
})
