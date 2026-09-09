import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

/**
 * Who gets a school page at all.
 *
 * The page is a school's own — its announcements and its community board —
 * titled with the school's name. Someone in no school has nothing it could
 * show, so they never see it: no nav item, and the route itself sends them home
 * rather than rendering an empty shell.
 *
 * The subtlety is who counts as "in a school". Most parents are platform users
 * with no organization_id of their own; they belong through their child, which
 * is why this reads `school` (resolved by /me through membership) and not
 * `organization`.
 */

let orgState = { school: { id: 'org-1', name: 'iCreate', homepage: true }, organization: null, loading: false }
vi.mock('../contexts/OrganizationContext', () => ({
  useOrganization: () => orgState,
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, effectiveRole: 'student' }),
}))
vi.mock('../services/api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { success: true, announcements: [], total: 0 } })) },
}))
import SchoolPage from './SchoolPage'

// "Home" is the member's own app home (roleHomePath), never "/" — the marketing
// homepage told signed-in members they had been logged out.
const renderAt = (path = '/school') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/dashboard" element={<div>Dashboard</div>} />
      <Route path="/school" element={<SchoolPage />} />
      <Route path="/announcements" element={<SchoolPage />} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => {
  vi.clearAllMocks()
  orgState = { school: { id: 'org-1', name: 'iCreate', homepage: true }, organization: null, loading: false }
})

describe('who the school page is for', () => {
  it('shows a member their school by name', async () => {
    renderAt()
    expect(await screen.findByRole('heading', { name: 'iCreate' })).toBeInTheDocument()
  })

  it('sends someone with no school home', () => {
    orgState = { school: null, organization: null, loading: false }
    renderAt()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('sends a member home when their school did not opt into this page', () => {
    // Belonging to a school is not the same as that school running its
    // families through /school — Hearthwood front-doors them on its own
    // program page. The sidebar hides the item on the same flag; this covers
    // a typed URL or a stale bookmark.
    orgState = { school: { id: 'org-1', name: 'Hearthwood Academy' }, organization: null, loading: false }
    renderAt()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('waits for the profile before deciding', () => {
    // Redirecting while /me is still in flight would bounce every member of a
    // school on a hard refresh.
    orgState = { school: null, organization: null, loading: true }
    renderAt()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('still answers on the old /announcements link', async () => {
    // Emails and notifications sent before the rename point there.
    renderAt('/announcements')
    expect(await screen.findByRole('heading', { name: 'iCreate' })).toBeInTheDocument()
  })
})
