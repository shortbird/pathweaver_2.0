import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { withConfirm } from '../../tests/confirmTestUtils'

// The prepaid / no-charge list is on the Registration page's Queues tab.
const render = (ui) => rtlRender(<MemoryRouter initialEntries={['/registration?tab=queues']}>{withConfirm(ui)}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, loading: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin-1', role: 'org_admin' } }) }))

const { api, state } = vi.hoisted(() => {
  const state = { directives: [] }
  const apiData = (url) => {
    if (url.includes('/enrollment-waitlist')) return { data: { entries: [] } }
    if (url.includes('/age-exception-requests')) return { data: { requests: [] } }
    if (url.includes('/family-directives')) return { data: { directives: state.directives } }
    if (url.includes('/api/admin/organizations/')) {
      return { data: { organization: { id: 'org-1', name: 'Optio Academy', feature_flags: {} } } }
    }
    return { data: {} }
  }
  return {
    state,
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: { saved: 1, skipped: [] } })),
      put: vi.fn(() => Promise.resolve({ data: {} })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import RegistrationPage from './RegistrationPage'

const directivePosts = () => api.post.mock.calls.filter(([url]) => url.includes('/family-directives'))

beforeEach(() => {
  state.directives = []
  vi.clearAllMocks()
})

describe('FamilyDirectivesCard no charge', () => {
  it('marks pasted emails as no charge', async () => {
    render(<RegistrationPage />)
    const box = await screen.findByPlaceholderText(/parent1@example.com/)
    fireEvent.change(box, { target: { value: 'Free@Example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'No charge' }))
    await waitFor(() => expect(directivePosts()).toHaveLength(1))
    expect(directivePosts()[0][1]).toEqual({ directives: [{ email: 'free@example.com', no_charge: true }] })
  })

  it('shows a no-charge family and lets staff undo it', async () => {
    state.directives = [{ id: 'd1', email: 'free@example.com', no_charge: true, fee_prepaid: false }]
    render(<RegistrationPage />)
    expect(await screen.findByText('No charge', { selector: 'span' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(directivePosts()).toHaveLength(1))
    const sent = directivePosts()[0][1].directives[0]
    expect(sent.email).toBe('free@example.com')
    expect(sent.no_charge).toBe(false)
  })
})
