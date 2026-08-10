import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let authState = { user: null, logout: vi.fn(), isAuthenticated: true }
let orgState = { organization: null }

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}))

vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => orgState,
}))

vi.mock('../../contexts/ActingAsContext', () => ({
  useActingAs: () => ({ actingAsDependent: null, clearActingAs: vi.fn() }),
}))

vi.mock('../../services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { courses: [] } }) },
}))

vi.mock('../../services/masqueradeService', () => ({
  getMasqueradeState: () => null,
  exitMasquerade: vi.fn(),
}))

vi.mock('../parent/ActingAsBanner', () => ({ default: () => null }))
vi.mock('../admin/MasqueradeBanner', () => ({ default: () => null }))

import Sidebar from './Sidebar'

function renderSidebar() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Sidebar isOpen isPinned onClose={vi.fn()} onTogglePin={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Sidebar — Credit Review link visibility', () => {
  beforeEach(() => {
    authState = { user: null, logout: vi.fn(), isAuthenticated: true }
    orgState = { organization: null }
  })

  it('shows Credit Review link for superadmin', () => {
    authState.user = {
      id: 'u1',
      role: 'superadmin',
      email: 't@example.com',
    }
    renderSidebar()
    const link = screen.getByRole('link', { name: /credit review/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/credit-dashboard')
  })

  it('does NOT show Credit Review link for org_admin (moved to /organization tab)', () => {
    authState.user = {
      id: 'u1',
      role: 'org_managed',
      org_role: 'org_admin',
      organization_id: 'org-1',
      email: 't@example.com',
    }
    renderSidebar()
    expect(
      screen.queryByRole('link', { name: /credit review/i }),
    ).not.toBeInTheDocument()
  })

  it('does NOT show Credit Review link for plain students', () => {
    authState.user = {
      id: 'u1',
      role: 'student',
      email: 's@example.com',
    }
    renderSidebar()
    expect(
      screen.queryByRole('link', { name: /credit review/i }),
    ).not.toBeInTheDocument()
  })

  it('does NOT show Credit Review link for parents', () => {
    authState.user = {
      id: 'u1',
      role: 'parent',
      email: 'p@example.com',
    }
    renderSidebar()
    expect(
      screen.queryByRole('link', { name: /credit review/i }),
    ).not.toBeInTheDocument()
  })
})

describe('Sidebar — school-specific program tab (org-gated)', () => {
  beforeEach(() => {
    authState = { user: null, logout: vi.fn(), isAuthenticated: true }
    orgState = { organization: null }
  })

  it('shows the Hearthwood Academy tab for members of the hearthwood org', () => {
    authState.user = { id: 'u1', role: 'org_managed', org_role: 'student', organization_id: 'org-hearthwood', email: 's@example.com' }
    orgState = { organization: { id: 'org-hearthwood', slug: 'hearthwood', name: 'Hearthwood Academy' } }
    renderSidebar()
    const link = screen.getByRole('link', { name: /hearthwood academy/i })
    expect(link).toHaveAttribute('href', '/hearthwood')
  })

  it('does NOT show the tab for users in a different org', () => {
    authState.user = { id: 'u1', role: 'org_managed', org_role: 'student', organization_id: 'org-x', email: 's@example.com' }
    orgState = { organization: { id: 'org-x', slug: 'someschool', name: 'Some School' } }
    renderSidebar()
    expect(screen.queryByRole('link', { name: /openEd academy/i })).not.toBeInTheDocument()
  })

  it('does NOT show the tab for users with no organization', () => {
    authState.user = { id: 'u1', role: 'student', email: 's@example.com' }
    renderSidebar()
    expect(screen.queryByRole('link', { name: /openEd academy/i })).not.toBeInTheDocument()
  })
})

describe('Sidebar — SIS carve-out (org feature flag)', () => {
  beforeEach(() => {
    localStorage.clear()
    authState = { user: null, logout: vi.fn(), isAuthenticated: true }
    orgState = { organization: null }
  })

  it('hides the Organization item and shows the launcher for a flagged org_admin', () => {
    authState.user = { id: 'u1', role: 'org_managed', org_role: 'org_admin', organization_id: 'org-1', email: 'a@example.com' }
    orgState = { organization: { id: 'org-1', slug: 'test', feature_flags: { sis_enabled: true } } }
    renderSidebar()
    expect(screen.getByText('School Admin')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^organization$/i })).not.toBeInTheDocument()
  })

  it('keeps the Organization item and shows no launcher for an unflagged org_admin', () => {
    authState.user = { id: 'u1', role: 'org_managed', org_role: 'org_admin', organization_id: 'org-1', email: 'a@example.com' }
    orgState = { organization: { id: 'org-1', slug: 'test', feature_flags: {} } }
    renderSidebar()
    expect(screen.queryByText('School Admin')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^organization$/i })).toBeInTheDocument()
  })

  it('always shows the School Admin launcher for superadmin (no org flag needed)', () => {
    authState.user = { id: 'u1', role: 'superadmin', email: 't@example.com' }
    orgState = { organization: null }
    renderSidebar()
    expect(screen.getByText('School Admin')).toBeInTheDocument()
  })

  it('shows the launcher for a campus coordinator at a flagged org', () => {
    // Coordinators run the console (minus finance); without the launcher the
    // only way in is a typed URL.
    authState.user = { id: 'u1', role: 'org_managed', org_roles: ['campus_coordinator'], organization_id: 'org-1', email: 'c@example.com' }
    orgState = { organization: { id: 'org-1', slug: 'test', feature_flags: { sis_enabled: true } } }
    renderSidebar()
    expect(screen.getByText('School Admin')).toBeInTheDocument()
  })

  it('shows the launcher for a coordinator stored in the legacy org_role field', () => {
    authState.user = { id: 'u1', role: 'org_managed', org_role: 'campus_coordinator', organization_id: 'org-1', email: 'c@example.com' }
    orgState = { organization: { id: 'org-1', slug: 'test', feature_flags: { sis_enabled: true } } }
    renderSidebar()
    expect(screen.getByText('School Admin')).toBeInTheDocument()
  })
})

describe('Sidebar — the school item', () => {
  // The old "Announcements" item was a name for a page, not a place. It is now
  // the school's own page, named after the school, and only for people who are
  // in one.
  beforeEach(() => {
    localStorage.clear()
    authState = { user: { id: 'u1', role: 'student', email: 's@example.com' }, logout: vi.fn(), isAuthenticated: true }
    orgState = { organization: null, school: null }
  })

  it('names the item after the school and links to its page', () => {
    orgState = { organization: null, school: { id: 'org-1', name: 'iCreate' } }
    renderSidebar()
    const link = screen.getByRole('link', { name: /icreate/i })
    expect(link).toHaveAttribute('href', '/school')
  })

  it('shows nothing for someone who is in no school', () => {
    renderSidebar()
    expect(screen.queryByRole('link', { name: /^announcements$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /my school/i })).not.toBeInTheDocument()
  })

  it('shows it to a parent who belongs through their child', () => {
    // A platform parent has no organization_id, so `organization` is null and
    // only `school` (resolved by /me through membership) says they belong.
    authState.user = { id: 'p1', role: 'parent', email: 'p@example.com' }
    orgState = { organization: null, school: { id: 'org-1', name: 'iCreate' } }
    renderSidebar()
    expect(screen.getByRole('link', { name: /icreate/i })).toBeInTheDocument()
  })

  it('falls back to a plain label when the school has no name yet', () => {
    orgState = { organization: null, school: { id: 'org-1' } }
    renderSidebar()
    expect(screen.getByRole('link', { name: /my school/i })).toBeInTheDocument()
  })
})

describe('Sidebar — the school surfaces moved onto the school page', () => {
  // Until 2026-08-06 a guardian at a SIS school got eight more nav items on top
  // of everything else: Schedule Builder, Billing, Absences, School Calendar,
  // Resources, Directory, Portal, Requests. Fourteen items, eight of them the
  // same school. They are cards on /school now; the sidebar keeps the school
  // itself and nothing else about it.
  const SCHOOL_SURFACES = [
    /^billing$/i, /^absences$/i, /^school calendar$/i, /^resources$/i,
    /^directory$/i, /^portal$/i, /^requests$/i, /^schedule builder$/i,
    /^goal setting$/i,
  ]

  beforeEach(() => {
    localStorage.clear()
    authState = {
      user: { id: 'p1', role: 'parent', email: 'p@example.com', has_dependents: true },
      logout: vi.fn(), isAuthenticated: true,
    }
    orgState = {
      organization: { id: 'org-1', feature_flags: { sis_enabled: true } },
      school: { id: 'org-1', name: 'iCreate' },
    }
  })

  it('gives a guardian at a SIS school one item for the school, not nine', () => {
    renderSidebar()
    for (const surface of SCHOOL_SURFACES) {
      expect(screen.queryByRole('link', { name: surface })).not.toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: /icreate/i })).toHaveAttribute('href', '/school')
  })

  it('keeps the things that are not the school', () => {
    // Family is the guardian's own children, which is a different question from
    // what the school is doing, so it stays put.
    renderSidebar()
    expect(screen.getByRole('link', { name: /^family$/i })).toHaveAttribute(
      'href', '/parent/dashboard')
    expect(screen.getByRole('link', { name: /^messages$/i })).toBeInTheDocument()
  })

  it('still shows staff the way into the SIS console', () => {
    authState.user = { id: 'a1', role: 'superadmin', email: 'a@example.com' }
    renderSidebar()
    expect(screen.getByRole('button', { name: /school admin/i })).toBeInTheDocument()
  })
})
