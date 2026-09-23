import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import RegisterFunnelPage from '../../RegisterFunnelPage'

/**
 * /enroll/resume rehydrating from partial data (Sentry ae186726, optio-web,
 * Safari): "TypeError: undefined is not an object (evaluating 'p.name.trim')".
 *
 * Mobile Safari throws the tab away mid-form, so the funnel mirrors unsaved
 * form state to localStorage and restores it on resume. Kids were restored
 * over emptyKid() defaults; emergency contacts were restored as-is, so a
 * draft contact with only a phone had no `name`, and submitDetails called
 * `c.name.trim()` on undefined. Restored contacts must carry every field, and
 * submitDetails must not assume they do.
 *
 * Same family of bug, found while fixing it: the server prefill stored each
 * signed paperwork item as a bare string, but PaperworkStep/SignatureCapture
 * keep `{name, agreed}` per item. A resumed parent who clicked back to the
 * Paperwork step crashed on `state.name.trim()`.
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

describe('/enroll/resume restores partial data without crashing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('a draft contact with no name submits the details step without throwing (ae186726)', async () => {
    localStorage.setItem('icreate_draft_reg-draft', JSON.stringify({ v: 1, contacts: [{ phone: '555' }] }))
    serve(baseConfig(baseRegistration()))
    renderResume()

    // The restored phone is on screen, and the name box is an empty string.
    const phone = await screen.findByDisplayValue('555')
    expect(phone).toBeTruthy()
    expect(screen.getByPlaceholderText('Full name').value).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    // Old code threw "p.name.trim" inside submitDetails and never got here.
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Emergency contact #1 needs a name and phone')
    })
    expect(api.post).not.toHaveBeenCalledWith(
      '/api/registration/registrations/reg-draft/details', expect.anything(),
    )
  })

  it('a draft contact with null fields submits once the parent adds a name', async () => {
    localStorage.setItem('icreate_draft_reg-draft', JSON.stringify({
      v: 1, contacts: [{ name: null, phone: '555', email: null, relationship: null }],
    }))
    serve(baseConfig(baseRegistration()))
    renderResume()

    fireEvent.change(await screen.findByPlaceholderText('Full name'), { target: { value: 'Pat Davis' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/registration/registrations/reg-draft/details', {
        access_token: 'tok',
        emergency_contacts: [{ name: 'Pat Davis', relationship: '', phone: '555', email: '' }],
        answers: {},
      })
    })
  })

  it('a signed paperwork item reopens as {name, agreed} and the step renders', async () => {
    const paperwork = [{ key: 'waiver', label: 'Liability waiver', body: 'Terms.' }]
    const reg = baseRegistration({
      status: 'fee',
      fee_cents: 12500,
      paperwork: [{ key: 'waiver', signed_name: 'Pat Davis' }],
    })
    serve(baseConfig(reg, { paperwork, emergency_contacts: false, registration_fee_cents: 12500 }))
    renderResume()

    // Back to the completed Paperwork step from the stepper.
    const paperworkNav = await screen.findAllByText('Paperwork')
    const clickable = paperworkNav.map((el) => el.closest('button')).find((b) => b && !b.disabled)
    fireEvent.click(clickable)

    // Old code stored the bare string 'Pat Davis' and crashed on `.name.trim()`.
    expect(await screen.findByDisplayValue('Pat Davis')).toBeTruthy()
  })
})
