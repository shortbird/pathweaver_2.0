import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
  it('renders the selected school instead of redirecting, with a compact org dropdown', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'iCreate' })).toBeInTheDocument()
    const picker = screen.getByRole('combobox', { name: 'Previewing organization' })
    expect(picker).toHaveValue('org-i')
    expect(screen.getByRole('option', { name: 'Aardvark Academy' })).toBeInTheDocument()
    expect(screen.queryByTestId('student-dashboard')).not.toBeInTheDocument()
  })

  it('scopes every read to the selected org, viewed as a parent by default', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'iCreate' })
    const paramsFor = (path) => get.mock.calls.find((c) => c[0] === path)?.[1]?.params
    expect(paramsFor('/api/sis/school/context')).toMatchObject({ organization_id: 'org-i', view_as: 'parent' })
    expect(paramsFor('/api/sis/community/feed')).toMatchObject({ organization_id: 'org-i', view_as: 'parent' })
    expect(paramsFor('/api/announcements/archive')).toMatchObject({ organization_id: 'org-i', view_as: 'parent' })
  })

  it('offers the three role views and re-reads everything as the chosen one', async () => {
    renderPage()
    const rolePicker = await screen.findByRole('combobox', { name: 'Viewing as' })
    expect(screen.getByRole('option', { name: 'View as parent' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'View as student' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'View as admin' })).toBeInTheDocument()
    fireEvent.change(rolePicker, { target: { value: 'student' } })
    await waitFor(() => {
      const call = get.mock.calls.filter((c) => c[0] === '/api/sis/school/context').at(-1)
      expect(call[1].params.view_as).toBe('student')
    })
    fireEvent.change(rolePicker, { target: { value: 'admin' } })
    await waitFor(() => {
      const call = get.mock.calls.filter((c) => c[0] === '/api/sis/school/context').at(-1)
      expect(call[1].params.view_as).toBe('admin')
    })
  })

  it('switches org through the dropdown', async () => {
    renderPage()
    const picker = await screen.findByRole('combobox', { name: 'Previewing organization' })
    fireEvent.change(picker, { target: { value: 'org-a' } })
    expect(sisOrg.setOrgId).toHaveBeenCalledWith('org-a')
  })

  it('holds with a loader until the org list resolves a selection', () => {
    sisOrg = { orgId: null, setOrgId: vi.fn(), orgs: [], isSuperadmin: true, loading: true }
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('does not offer the dropdown to a school member', async () => {
    authState = { user: { id: 'u1' }, effectiveRole: 'parent' }
    orgState = { school: { id: 'org-1', name: 'iCreate' }, loading: false }
    sisOrg = { orgId: null, setOrgId: vi.fn(), orgs: [], isSuperadmin: false, loading: false }
    renderPage()
    await screen.findByRole('heading', { name: 'iCreate' })
    expect(screen.queryByRole('combobox', { name: 'Previewing organization' })).not.toBeInTheDocument()
    // A member's reads stay membership-resolved — no org param.
    const urls = get.mock.calls.map((c) => c[0])
    expect(urls).toContain('/api/sis/school/context')
    expect(urls).toContain('/api/sis/community/feed')
  })
})
