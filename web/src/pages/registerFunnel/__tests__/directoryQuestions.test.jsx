import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import api from '../../../services/api'
import RegisterFunnelPage from '../../RegisterFunnelPage'

/**
 * The details step asks about the family directory and carpooling.
 *
 * Tanner, 2026-09-24: "add a carpool question to the icreate registration
 * funnel, along with the directory opt-out. directory should be opt-in by
 * default." Carpool interest had one way in -- a checkbox only a family
 * already in the directory ever saw -- so the office's carpool report (ticket
 * 1a54e05a) showed almost nobody. The box a family sees is the value sent,
 * a returning family starts from its earlier choice, and a school without the
 * directory is not asked.
 */

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('../../../services/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: { ...actual.default, get: vi.fn(), post: vi.fn() },
  }
})

const baseRegistration = (overrides) => ({
  registration_id: 'reg-draft',
  access_token: 'tok',
  status: 'details',
  fee_cents: 0,
  kids: [{ user_id: 'kid-1', first_name: 'Navy', last_name: 'Davis', name: 'Navy Davis', dob: '2014-02-21' }],
  paperwork: [],
  answers: {},
  emergency_contacts: [],
  ...overrides,
})

const baseConfig = (registration, overrides) => ({
  organization: { id: 'org-icreate', name: 'iCreate' },
  questions: [],
  paperwork: [],
  fee_mode: 'lesser',
  registration_fee_cents: 0,
  per_student_fee_cents: 0,
  payment_url: '',
  stripe_enabled: false,
  emergency_contacts: true,
  health_fields: false,
  registration,
  ...overrides,
})

const serve = (config) => {
  api.get.mockImplementation((url) => {
    if (url === '/api/registration/my-registration') return Promise.resolve({ data: config })
    return Promise.resolve({ data: {} })
  })
  api.post.mockImplementation(() => Promise.resolve({ data: {} }))
}

const renderResume = () => render(
  <MemoryRouter initialEntries={['/enroll/resume']}>
    <Routes>
      <Route path="/enroll/resume" element={<RegisterFunnelPage />} />
    </Routes>
  </MemoryRouter>,
)

const DETAILS = '/api/registration/registrations/reg-draft/details'
const CONTACT = { name: 'Pat Davis', relationship: 'Aunt', phone: '555', email: '' }

const start = async ({ household = null, directory_questions = true } = {}) => {
  serve(baseConfig(baseRegistration({ emergency_contacts: [CONTACT], household }), { directory_questions }))
  renderResume()
  await screen.findByDisplayValue('Pat Davis')
}

const sentAnswers = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(DETAILS, expect.anything()))
  return api.post.mock.calls.find(([url]) => url === DETAILS)[1].answers
}

describe('the family directory questions on the details step', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(() => localStorage.clear())

  it('lists the family by default and leaves carpooling unticked', async () => {
    await start()
    expect(screen.getByText('Family directory')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /List our family in the directory/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /open to carpooling/ })).not.toBeChecked()
    expect(await sentAnswers()).toEqual({ directory_listed: true, carpool_interest: false })
  })

  it('sends what the family ticks: out of the directory, open to carpooling', async () => {
    await start()
    fireEvent.click(screen.getByRole('checkbox', { name: /List our family in the directory/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /open to carpooling/ }))
    expect(await sentAnswers()).toEqual({ directory_listed: false, carpool_interest: true })
  })

  it('starts a returning family from its earlier choice, so an opt-out stays out', async () => {
    await start({ household: { directory_opted_out: true, carpool_interest: true } })
    expect(screen.getByRole('checkbox', { name: /List our family in the directory/ })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /open to carpooling/ })).toBeChecked()
    expect(await sentAnswers()).toEqual({ directory_listed: false, carpool_interest: true })
  })

  it('does not ask where the school has no directory', async () => {
    await start({ directory_questions: false })
    expect(screen.queryByText('Family directory')).not.toBeInTheDocument()
    expect(await sentAnswers()).toEqual({})
  })
})
