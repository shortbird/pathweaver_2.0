import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * A student's own school pages in the main sidebar (ticket bfe06a17, Apogee
 * Cache Valley: "I added Afton as a points helper today but the points bar is
 * not showing up on her student account").
 *
 * /points (and /weekly-goals) answer a student with their own record, and a
 * points helper gets the Give points tab there. But a student reached them only
 * through the school door, and a student gets that door only at a school whose
 * page is its front door. Apogee has none, so Afton had no way in. Now every
 * student at a school running the module gets the link; a guardian's sidebar
 * is unchanged (their school door already opens on the family tabs).
 */

let authState = { user: null, logout: vi.fn(), isAuthenticated: true }
let orgState = { organization: null, school: null }
let schoolOrgs = null

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('../../hooks/api/useSchoolContext', () => ({
  useSchoolContext: () => ({ orgs: schoolOrgs, isGuardian: false, loading: false }),
}))
vi.mock('../../services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { courses: [], classes: [] } }) },
}))
vi.mock('../../services/masqueradeService', () => ({
  getMasqueradeState: () => null,
  exitMasquerade: vi.fn(),
}))
vi.mock('../admin/MasqueradeBanner', () => ({ default: () => null }))

import Sidebar from './Sidebar'

function renderSidebar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Sidebar isOpen isPinned onClose={vi.fn()} onTogglePin={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// An org-managed student at a SIS school with no school homepage -- Afton's
// shape. `modules` is the school context's family-surface list.
const student = { id: 's1', role: 'org_managed', org_role: 'student', org_roles: ['student'], organization_id: 'org-1', email: 's@example.com' }
const parent = { id: 'p1', role: 'parent', email: 'p@example.com' }
const school = { id: 'org-1', name: 'Test School', homepage: false }
const schoolOrg = (modules, extra = {}) => ({
  organization_id: 'org-1', organization_name: 'Test School', is_guardian: false, modules, ...extra,
})
const hrefs = () => screen.queryAllByRole('link').map((l) => l.getAttribute('href'))

describe('Sidebar -- a student\'s own school pages (bfe06a17)', () => {
  beforeEach(() => {
    authState = { user: null, logout: vi.fn(), isAuthenticated: true }
    orgState = { organization: { id: 'org-1', feature_flags: { sis_enabled: true } }, school }
    schoolOrgs = null
  })

  it('gives a student a Points link where the school runs points', () => {
    authState.user = student
    schoolOrgs = [schoolOrg(['points'])]
    renderSidebar()
    expect(screen.getByRole('link', { name: 'Points' })).toHaveAttribute('href', '/points')
    expect(screen.queryByRole('link', { name: 'Weekly Goals' })).not.toBeInTheDocument()
  })

  it('gives a student no Points link where the school does not run points', () => {
    authState.user = student
    schoolOrgs = [schoolOrg(['calendar'])]
    renderSidebar()
    expect(screen.queryByRole('link', { name: 'Points' })).not.toBeInTheDocument()
    expect(hrefs()).not.toContain('/points')
  })

  it('gives a student a Weekly Goals link where the school runs weekly goals', () => {
    authState.user = student
    schoolOrgs = [schoolOrg(['weekly_goals'])]
    renderSidebar()
    expect(screen.getByRole('link', { name: 'Weekly Goals' })).toHaveAttribute('href', '/weekly-goals')
    expect(screen.queryByRole('link', { name: 'Points' })).not.toBeInTheDocument()
  })

  it('adds nothing while the school context has not answered', () => {
    authState.user = student
    schoolOrgs = null
    renderSidebar()
    expect(hrefs()).not.toContain('/points')
  })

  it('leaves a guardian\'s sidebar as it was: the school door, no Points link of its own', () => {
    // A guardian's school door opens on the family tabs, Points among them
    // (schoolCards.familyNavItemsFor); the new link is a student's only.
    authState.user = parent
    orgState = { organization: null, school }
    schoolOrgs = [schoolOrg(['points'], { is_guardian: true })]
    renderSidebar()
    expect(screen.queryByRole('link', { name: 'Points' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Test School' })).toHaveAttribute('href', '/points')
    expect(hrefs().filter((h) => h === '/points')).toHaveLength(1)
  })
})
