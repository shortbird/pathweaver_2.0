import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui, path = '/registration') =>
  rtlRender(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, loading: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
let authState = { user: { id: 'admin-1', role: 'org_admin' } }
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState,
  AuthContext: { Provider: ({ children }) => children },
}))

const { api, state } = vi.hoisted(() => {
  const state = { flags: {}, putBodies: [] }
  const REG_LINK = {
    id: 'inv-1', role: 'parent', invitation_code: 'test-org-2026',
    email: 'link-invite-abc@pending.optio.local',
  }
  const apiData = (url) => {
    if (url.includes('/invitations?status=pending')) return { data: { invitations: [REG_LINK] } }
    if (url.includes('/api/registration/config/')) return { data: { stripe_enabled: false } }
    if (url.includes('/api/sis/resources')) return { data: { resources: [] } }
    if (url.includes('/age-exception-requests')) return { data: { requests: [] } }
    if (url.includes('/enrollment-waitlist')) return { data: { entries: [] } }
    if (url.includes('/family-directives')) return { data: { directives: [] } }
    if (url.includes('/api/admin/organizations/')) {
      return { data: { organization: { id: 'org-1', name: 'Test School', feature_flags: state.flags } } }
    }
    return { data: {} }
  }
  return {
    state,
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: {} })),
      put: vi.fn((url, body) => { state.putBodies.push(body); return Promise.resolve({ data: {} }) }),
      delete: vi.fn(() => Promise.resolve({ data: {} })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import RegistrationPage from './RegistrationPage'

// A config carrying fields the editor does not surface everywhere (body,
// per_student) — saving must round-trip them, not strip them.
const CFG = {
  enabled: true, fee_mode: 'flat',
  registration_fee_cents: 2500, per_student_fee_cents: 0,
  payment_url: '', scheduling_url: '',
  paperwork: [{ key: 'handbook', label: 'Family Handbook', doc_url: '', body: 'Please read the handbook.' }],
  questions: [
    { key: 'how_heard', label: 'How did you hear about us?', type: 'text', options: [], required: true },
    { key: 'grade', label: 'Grade level', type: 'select', options: ['9th', '10th'], required: true, per_student: true },
  ],
}

beforeEach(() => {
  state.flags = {}
  state.putBodies = []
  authState = { user: { id: 'admin-1', role: 'org_admin' } }
  vi.clearAllMocks()
})

// What the backend hands a campus coordinator: the same config with every
// money field redacted out of it (utils/org_finance_flags.py).
const COORDINATOR_CFG = (() => {
  const { fee_mode, registration_fee_cents, per_student_fee_cents, payment_url, ...rest } = CFG
  return rest
})()

const asCoordinator = () => {
  authState = { user: { id: 'kate', role: 'org_managed', org_roles: ['campus_coordinator'] } }
}

describe('Registration setup tab (the editable funnel)', () => {
  it('is the default tab and renders the funnel as families see it', async () => {
    state.flags = { registration: CFG, sis_settings: {} }
    render(<RegistrationPage />)
    // The family-facing account step renders by default.
    expect(await screen.findByText('Your account')).toBeInTheDocument()
    expect(screen.getByText('Family Registration')).toBeInTheDocument()
    // The standing link is shown, pointing at the org-neutral funnel path.
    expect((await screen.findByDisplayValue(/\/enroll\/test-org-2026/))).toBeInTheDocument()
  })

  it('reads the legacy icreate_registration key when the new key is absent', async () => {
    state.flags = { icreate_registration: CFG, sis_settings: {} }
    render(<RegistrationPage />)
    expect(await screen.findByText('Your account')).toBeInTheDocument()
  })

  it('renders configured questions exactly as families see them, editable in place', async () => {
    state.flags = { registration: CFG, sis_settings: {} }
    render(<RegistrationPage />)
    await screen.findByText('Your account')
    fireEvent.click(screen.getByText('Contacts & questions'))
    expect(await screen.findByText('How did you hear about us?')).toBeInTheDocument()
    // Per-student questions render under the per-child grouping.
    expect(screen.getByText('Grade level')).toBeInTheDocument()
    expect(screen.getByText(/repeat for each child/)).toBeInTheDocument()
  })

  it('saves to BOTH flag keys and preserves body/per_student through the round-trip', async () => {
    state.flags = { registration: CFG, sis_settings: { post_registration_flow: 'goals' } }
    render(<RegistrationPage />)
    await screen.findByText('Your account')
    fireEvent.click(screen.getByText('Save registration settings'))
    await waitFor(() => expect(api.put).toHaveBeenCalled())

    const body = state.putBodies[0]
    const saved = body.feature_flags.registration
    expect(body.feature_flags.icreate_registration).toEqual(saved) // legacy mirror
    expect(saved.paperwork[0].body).toBe('Please read the handbook.')
    expect(saved.questions.find((q) => q.key === 'grade').per_student).toBe(true)
    expect(saved.questions.find((q) => q.key === 'how_heard').per_student).toBe(false)
    // The never-echoed Stripe key must not be touched on an ordinary save.
    expect('stripe_secret_key' in saved).toBe(false)
    // The org's post-registration flow survives.
    expect(body.feature_flags.sis_settings.post_registration_flow).toBe('goals')
  })

  it('mirrors the funnel for a zero-fee, no-contacts, no-health org (Optio Academy shape)', async () => {
    state.flags = {
      registration: { ...CFG, registration_fee_cents: 0, emergency_contacts: false, health_fields: false },
      sis_settings: { post_registration_flow: 'goals' },
    }
    render(<RegistrationPage />)
    await screen.findByText('Your account')
    // No fee step in the stepper (families skip it), contacts-off label instead.
    expect(screen.queryByText('Registration fee')).not.toBeInTheDocument()
    expect(screen.getByText('A few questions')).toBeInTheDocument()
    // The family step's child card hides allergies/medications.
    fireEvent.click(screen.getByText('Your family'))
    expect(await screen.findByText('Children')).toBeInTheDocument()
    expect(screen.queryByText('Allergies')).not.toBeInTheDocument()
    expect(screen.queryByText('Required medications')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('A few questions'))
    expect(await screen.findByText(/Emergency contacts are turned off/)).toBeInTheDocument()
    // The paperwork step offers to add a fee back.
    fireEvent.click(screen.getByText('Paperwork'))
    expect(await screen.findByText(/No registration fee/)).toBeInTheDocument()
  })

  it('shows the health fields on the family step by default', async () => {
    state.flags = { registration: CFG, sis_settings: {} }
    render(<RegistrationPage />)
    await screen.findByText('Your account')
    fireEvent.click(screen.getByText('Your family'))
    expect(await screen.findByText('Allergies')).toBeInTheDocument()
    expect(screen.getByText('Required medications')).toBeInTheDocument()
  })

  it('saves the emergency-contacts opt-out', async () => {
    state.flags = { registration: { ...CFG, emergency_contacts: false }, sis_settings: {} }
    render(<RegistrationPage />)
    await screen.findByText('Your account')
    fireEvent.click(screen.getByText('Save registration settings'))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(state.putBodies[0].feature_flags.registration.emergency_contacts).toBe(false)
  })

  it('offers to enable registration for an org without the funnel', async () => {
    state.flags = { sis_settings: {} }
    render(<RegistrationPage />)
    expect(await screen.findByText('Family registration is not set up')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Set up family registration'))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const body = state.putBodies[0]
    expect(body.feature_flags.registration.enabled).toBe(true)
    expect(body.feature_flags.icreate_registration.enabled).toBe(true)
  })
})

// iCreate, 2026-08-01: coordinators run the campus, "we don't want the cc's to
// have access to all the financial stuff". The funnel is theirs; the fee that
// funnel charges is not — and the amounts never reach this component anyway,
// so a fee editor here would be an empty form that saves a zero.
describe('Registration setup tab for a campus coordinator', () => {
  it('gives them the funnel without the fee editor', async () => {
    asCoordinator()
    state.flags = { registration: COORDINATOR_CFG, sis_settings: {} }
    render(<RegistrationPage />)

    expect(await screen.findByText('Your account')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Registration fee'))
    expect(await screen.findByText(/set by an organization admin/)).toBeInTheDocument()
    expect(screen.queryByText('Edit fees & payment')).not.toBeInTheDocument()
    expect(screen.queryByText(/Stripe secret key/)).not.toBeInTheDocument()
  })

  it('never sends a fee or a Stripe key when they save', async () => {
    asCoordinator()
    state.flags = { registration: COORDINATOR_CFG, sis_settings: {} }
    render(<RegistrationPage />)
    await screen.findByText('Your account')
    fireEvent.click(screen.getByText('Save registration settings'))
    await waitFor(() => expect(api.put).toHaveBeenCalled())

    const saved = state.putBodies[0].feature_flags.registration
    for (const key of ['fee_mode', 'registration_fee_cents', 'per_student_fee_cents',
      'payment_url', 'stripe_secret_key']) {
      expect(key in saved).toBe(false)
    }
    // The parts that ARE theirs still save.
    expect(saved.paperwork[0].label).toBe('Family Handbook')
    expect(saved.questions).toHaveLength(2)
  })

  it('still lets an org admin edit the fees', async () => {
    state.flags = { registration: CFG, sis_settings: {} }
    render(<RegistrationPage />)
    await screen.findByText('Your account')
    fireEvent.click(screen.getByText('Registration fee'))
    expect(await screen.findByText('Edit fees & payment')).toBeInTheDocument()
  })
})

describe('Credit partner switches (Optio Academy credit)', () => {
  const openRecordsEditor = async () => {
    await screen.findByText('Your account')
    fireEvent.click(screen.getByText('Contacts & questions'))
    // The switches live on the always-present details step, so a funnel that
    // does not have the School records step yet can still turn it on.
    const zone = await screen.findByText('Optio Academy credit')
    fireEvent.click(zone.closest('div').parentElement.querySelector('button'))
  }

  it('hides the School records step until the org collects records', async () => {
    state.flags = { registration: CFG, sis_settings: {} }
    render(<RegistrationPage />)
    await screen.findByText('Your account')
    expect(screen.queryByText('School records')).not.toBeInTheDocument()
  })

  it('shows the School records step for a credit partner', async () => {
    state.flags = { registration: { ...CFG, records_destination: true }, sis_settings: {} }
    render(<RegistrationPage />)
    await screen.findByText('Your account')
    fireEvent.click(await screen.findByText('School records'))
    expect(await screen.findByText('Where should the school records go?')).toBeInTheDocument()
  })

  it('states plainly that neither switch is on', async () => {
    state.flags = { registration: CFG, sis_settings: {} }
    render(<RegistrationPage />)
    await screen.findByText('Your account')
    fireEvent.click(screen.getByText('Contacts & questions'))
    expect(await screen.findByText(/not asked where transcripts should be sent/)).toBeInTheDocument()
    expect(screen.getByText(/does not enroll anyone in Optio Academy/)).toBeInTheDocument()
  })

  it('saves both switches off by default rather than omitting them', async () => {
    state.flags = { registration: CFG, sis_settings: {} }
    render(<RegistrationPage />)
    await screen.findByText('Your account')
    fireEvent.click(screen.getByText('Save registration settings'))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const saved = state.putBodies[0].feature_flags.registration
    expect(saved.records_destination).toBe(false)
    expect(saved.academy_enrollment).toBe(false)
  })

  it('round-trips both switches when they are on', async () => {
    state.flags = {
      registration: { ...CFG, records_destination: true, academy_enrollment: true },
      sis_settings: {},
    }
    render(<RegistrationPage />)
    await screen.findByText('Your account')
    fireEvent.click(screen.getByText('Save registration settings'))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const saved = state.putBodies[0].feature_flags.registration
    expect(saved.records_destination).toBe(true)
    expect(saved.academy_enrollment).toBe(true)
  })

  it('turning the records switch on adds the step to the funnel', async () => {
    state.flags = { registration: CFG, sis_settings: {} }
    render(<RegistrationPage />)
    await openRecordsEditor()
    const box = await screen.findByLabelText(/where their student/i)
    fireEvent.click(box)
    expect(await screen.findByText('School records')).toBeInTheDocument()
  })
})
