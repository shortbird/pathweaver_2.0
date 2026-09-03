import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * /carpool — the carpool board's own door, reached from the sidebar
 * (2026-08-23: on /school the board sat below the feed, "all the way at the
 * bottom so it won't be seen"). Same board as /school's; this page is a
 * second door, not a second board.
 */

let authState = { user: { id: 'u1' }, effectiveRole: 'parent' }
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ school: { id: 'org-1', name: 'iCreate', homepage: true }, loading: false }),
  OrganizationContext: { _currentValue: null },
}))
let sisOrg = { orgId: null, setOrgId: vi.fn(), orgs: [], loading: false }
vi.mock('./sis/useSisOrg', () => ({ useSisOrg: () => sisOrg }))
const get = vi.fn()
vi.mock('../services/api', () => ({ default: { get: (...a) => get(...a), post: vi.fn(), delete: vi.fn() } }))

import CarpoolPage from './CarpoolPage'

const POST = {
  id: 'c1', type: 'offer', message: 'Two seats from Lehi, Tue & Thu mornings.',
  area: 'Lehi', days: 'Tue & Thu', author_name: 'Dana C.',
  created_at: '2026-08-05T10:00:00Z', mine: false,
}

const feedResponse = (overrides = {}) => ({
  data: {
    success: true, organization_name: 'iCreate',
    can_post_carpool: true, can_moderate: false,
    feed: { announcements: [], lost_found: [], recognition: [], events: [], carpool: [POST] },
    ...overrides,
  },
})

const renderPage = () => render(<MemoryRouter><CarpoolPage /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  authState = { user: { id: 'u1' }, effectiveRole: 'parent' }
  sisOrg = { orgId: null, setOrgId: vi.fn(), orgs: [], loading: false }
  get.mockResolvedValue(feedResponse())
})

describe('the carpool page', () => {
  it('shows the board open, posts and all — no section to expand', async () => {
    renderPage()
    expect(await screen.findByText('Two seats from Lehi, Tue & Thu mornings.')).toBeInTheDocument()
    expect(screen.getByText('Dana C.')).toBeInTheDocument()
  })

  it('carries the way back to the school page', async () => {
    renderPage()
    await screen.findByText('Two seats from Lehi, Tue & Thu mornings.')
    expect(screen.getByRole('link', { name: /my school|icreate/i })).toHaveAttribute('href', '/school')
  })

  it('explains itself to someone with no board', async () => {
    get.mockRejectedValue(new Error('403'))
    renderPage()
    expect(await screen.findByText(/isn’t available for your account yet/)).toBeInTheDocument()
  })

  it('scopes the read to the previewed org for a superadmin', async () => {
    authState = { user: { id: 'sa' }, effectiveRole: 'superadmin' }
    sisOrg = { orgId: 'org-i', setOrgId: vi.fn(), orgs: [], loading: false }
    renderPage()
    await screen.findByText('Two seats from Lehi, Tue & Thu mornings.')
    expect(get).toHaveBeenCalledWith('/api/sis/community/feed', {
      params: { organization_id: 'org-i', view_as: 'parent' },
    })
  })
})
