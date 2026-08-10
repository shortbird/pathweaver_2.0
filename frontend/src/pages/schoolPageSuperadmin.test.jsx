import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

/**
 * The superadmin school-page preview.
 *
 * A superadmin belongs to no school, so /school used to bounce them to their
 * dashboard. Instead they get an organization sidebar (the same shared
 * selection the SIS console uses, defaulting to iCreate) and see the selected
 * school's page exactly as a member would — every read scoped to that org.
 */

let authState = {}
let orgState = {}
let sisOrg = {}

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('./sis/useSisOrg', () => ({
  useSisOrg: () => sisOrg,
  withOrg: (path, id) =>
    (id ? `${path}${path.includes('?') ? '&' : '?'}organization_id=${encodeURIComponent(id)}` : path),
}))

const get = vi.fn()
vi.mock('../services/api', () => ({ default: { get: (...a) => get(...a) } }))
vi.mock('../components/announcements/AnnouncementBody', () => ({ default: () => null }))
vi.mock('../components/announcements/SchoolCommunity', () => ({
  default: () => null,
  FeedSection: () => null,
  hasCommunityContent: () => false,
}))
vi.mock('../components/announcements/CarpoolBoard', () => ({ default: () => null }))

import SchoolPage from './SchoolPage'

const ORGS = [
  { id: 'org-a', name: 'Aardvark Academy', slug: 'aardvark' },
  { id: 'org-i', name: 'iCreate', slug: 'icreate' },
]

const renderPage = () => render(
  <MemoryRouter initialEntries={['/school']}>
    <Routes>
      <Route path="/school" element={<SchoolPage />} />
      <Route path="/dashboard" element={<div data-testid="student-dashboard" />} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => {
  vi.clearAllMocks()
  get.mockImplementation((url) => {
    if (url.startsWith('/api/announcements/archive')) {
      return Promise.resolve({ data: { success: true, announcements: [], total: 0, organization_name: 'iCreate' } })
    }
    if (url.startsWith('/api/sis/school/context')) {
      return Promise.resolve({ data: { success: true, orgs: [{ organization_id: 'org-i', organization_name: 'iCreate', is_guardian: false, logo_url: null }], is_guardian: false } })
    }
    if (url.startsWith('/api/sis/community/feed')) {
      return Promise.resolve({ data: { success: true, feed: null } })
    }
    return Promise.resolve({ data: {} })
  })
  authState = { user: { id: 'sa-1', role: 'superadmin' }, effectiveRole: 'superadmin' }
  orgState = { school: null, loading: false }
  sisOrg = { orgId: 'org-i', setOrgId: vi.fn(), orgs: ORGS, isSuperadmin: true, loading: false }
})

describe('the superadmin school-page preview', () => {
  it('renders the selected school instead of redirecting, with an org sidebar', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'iCreate' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aardvark Academy' })).toBeInTheDocument()
    expect(screen.queryByTestId('student-dashboard')).not.toBeInTheDocument()
  })

  it('scopes every read to the selected org', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'iCreate' })
    const urls = get.mock.calls.map((c) => c[0])
    expect(urls).toContain('/api/sis/school/context?organization_id=org-i')
    expect(urls).toContain('/api/sis/community/feed?organization_id=org-i')
    const archiveCall = get.mock.calls.find((c) => c[0].startsWith('/api/announcements/archive'))
    expect(archiveCall[1].params.organization_id).toBe('org-i')
  })

  it('switches org through the sidebar', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Aardvark Academy' }))
    expect(sisOrg.setOrgId).toHaveBeenCalledWith('org-a')
  })

  it('marks the selected org', async () => {
    renderPage()
    const selected = await screen.findByRole('button', { name: 'iCreate' })
    expect(selected).toHaveAttribute('aria-current', 'true')
  })

  it('holds with a loader until the org list resolves a selection', () => {
    sisOrg = { orgId: null, setOrgId: vi.fn(), orgs: [], isSuperadmin: true, loading: true }
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('does not offer the sidebar to a school member', async () => {
    authState = { user: { id: 'u1' }, effectiveRole: 'parent' }
    orgState = { school: { id: 'org-1', name: 'iCreate' }, loading: false }
    sisOrg = { orgId: null, setOrgId: vi.fn(), orgs: [], isSuperadmin: false, loading: false }
    renderPage()
    await screen.findByRole('heading', { name: 'iCreate' })
    expect(screen.queryByText('Organizations')).not.toBeInTheDocument()
    // A member's reads stay membership-resolved — no org param.
    const urls = get.mock.calls.map((c) => c[0])
    expect(urls).toContain('/api/sis/school/context')
    expect(urls).toContain('/api/sis/community/feed')
  })
})
