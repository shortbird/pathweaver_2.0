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
import { OPTIO_ACADEMY_ORG_ID } from '../../config/optioAcademy'

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

  it('keeps the organization console reachable and shows no launcher for an unflagged org_admin', () => {
    authState.user = { id: 'u1', role: 'org_managed', org_role: 'org_admin', organization_id: 'org-1', email: 'a@example.com' }
    orgState = { organization: { id: 'org-1', slug: 'test', feature_flags: {} } }
    renderSidebar()
    expect(screen.queryByText('School Admin')).not.toBeInTheDocument()
    // Home is the role home (/dashboard); the console is its own item.
    expect(screen.getByRole('link', { name: /^home$/i })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: /^organization$/i })).toHaveAttribute('href', '/organization')
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
    orgState = { organization: null, school: { id: 'org-1', name: 'iCreate', homepage: true } }
    renderSidebar()
    const link = screen.getByRole('link', { name: /icreate/i })
    expect(link).toHaveAttribute('href', '/school')
  })

  it('shows nothing for someone who is in no school', () => {
    renderSidebar()
    expect(screen.queryByRole('link', { name: /^announcements$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /my school/i })).not.toBeInTheDocument()
  })

  it('shows nothing for a school that did not opt into the page', () => {
    // Belonging to an org is not the same as that org running its families
    // through /school. Hearthwood front-doors families on its own program
    // page, so its members must not get a second, near-empty school item.
    orgState = { organization: null, school: { id: 'org-1', name: 'Hearthwood Academy' } }
    renderSidebar()
    expect(screen.queryByRole('link', { name: /hearthwood/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /my school/i })).not.toBeInTheDocument()
  })

  it('shows it to a parent who belongs through their child', () => {
    // A platform parent has no organization_id, so `organization` is null and
    // only `school` (resolved by /me through membership) says they belong.
    authState.user = { id: 'p1', role: 'parent', email: 'p@example.com' }
    orgState = { organization: null, school: { id: 'org-1', name: 'iCreate', homepage: true } }
    renderSidebar()
    expect(screen.getByRole('link', { name: /icreate/i })).toBeInTheDocument()
  })

  it('falls back to a plain label when the school has no name yet', () => {
    orgState = { organization: null, school: { id: 'org-1', homepage: true } }
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
      school: { id: 'org-1', name: 'iCreate', homepage: true },
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
    // Home is the role home (/dashboard, the Family Home for parents); the
    // family management dashboard stays reachable as its own Family item.
    renderSidebar()
    expect(screen.getByRole('link', { name: /^home$/i })).toHaveAttribute(
      'href', '/dashboard')
    expect(screen.getByRole('link', { name: /^messages$/i })).toBeInTheDocument()
  })

  it('still shows staff the way into the SIS console', () => {
    authState.user = { id: 'a1', role: 'superadmin', email: 'a@example.com' }
    renderSidebar()
    expect(screen.getByRole('button', { name: /school admin/i })).toBeInTheDocument()
  })
})

describe('Sidebar — Home and Quests (the retired top-navbar toggle)', () => {
  beforeEach(() => {
    localStorage.clear()
    authState = { user: null, logout: vi.fn(), isAuthenticated: true }
    orgState = { organization: null }
  })

  it('gives a student Home -> /dashboard and a Quests item', () => {
    authState.user = { id: 'u1', role: 'student', email: 's@example.com' }
    renderSidebar()
    expect(screen.getByRole('link', { name: /^home$/i })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: /^quests$/i })).toHaveAttribute('href', '/quests')
  })

  it('points a parent Home at the role home and hides Quests', () => {
    authState.user = { id: 'p1', role: 'parent', email: 'p@example.com' }
    renderSidebar()
    expect(screen.getByRole('link', { name: /^home$/i })).toHaveAttribute('href', '/dashboard')
    expect(screen.queryByRole('link', { name: /^quests$/i })).not.toBeInTheDocument()
  })

  it('lists each destination once — Home absorbs the role-home item', () => {
    authState.user = { id: 'p1', role: 'parent', has_dependents: true, email: 'p@example.com' }
    renderSidebar()
    const familyLinks = screen.getAllByRole('link').filter(
      (l) => l.getAttribute('href') === '/parent/dashboard'
    )
    expect(familyLinks).toHaveLength(1)
  })
})

describe('Sidebar — the two feeds have distinct names', () => {
  beforeEach(() => {
    localStorage.clear()
    authState = { user: null, logout: vi.fn(), isAuthenticated: true }
    orgState = { organization: null }
  })

  it("names the student's own evidence feed My Feed", () => {
    authState.user = { id: 'u1', role: 'student', email: 's@example.com' }
    renderSidebar()
    expect(screen.getByRole('link', { name: /^my feed$/i })).toHaveAttribute('href', '/feedback')
    expect(screen.queryByRole('link', { name: /^feed$/i })).not.toBeInTheDocument()
  })

  it('names the observer-side feed Student Feed (superadmin sees both, unambiguously)', () => {
    authState.user = { id: 'u1', role: 'superadmin', email: 't@example.com' }
    renderSidebar()
    expect(screen.getByRole('link', { name: /^student feed$/i })).toHaveAttribute('href', '/observer/feed')
    expect(screen.queryByRole('link', { name: /^feed$/i })).not.toBeInTheDocument()
  })
})

describe('Sidebar — Optio Academy parents: the Family tab is the home tab', () => {
  beforeEach(() => {
    localStorage.clear()
    authState = { user: null, logout: vi.fn(), isAuthenticated: true }
    orgState = { organization: null }
  })

  const academyParent = {
    id: 'p1',
    role: 'org_managed',
    org_role: 'parent',
    organization_id: OPTIO_ACADEMY_ORG_ID,
    has_dependents: true,
    email: 'p@example.com',
  }

  it('puts Family in the home slot and drops the separate Home item', () => {
    authState.user = academyParent
    renderSidebar()
    expect(screen.getByRole('link', { name: /^family$/i })).toHaveAttribute(
      'href', '/parent/dashboard')
    expect(screen.queryByRole('link', { name: /^home$/i })).not.toBeInTheDocument()
  })

  it('still lists the family dashboard exactly once', () => {
    authState.user = academyParent
    renderSidebar()
    const links = screen.getAllByRole('link').filter(
      (l) => l.getAttribute('href') === '/parent/dashboard'
    )
    expect(links).toHaveLength(1)
  })

  it('leaves Academy students on the ordinary Home', () => {
    authState.user = {
      id: 's1', role: 'org_managed', org_role: 'student',
      organization_id: OPTIO_ACADEMY_ORG_ID, email: 's@example.com',
    }
    renderSidebar()
    expect(screen.getByRole('link', { name: /^home$/i })).toHaveAttribute('href', '/dashboard')
  })

  it('leaves parents at other schools on the ordinary Home', () => {
    authState.user = { ...academyParent, organization_id: 'some-other-org' }
    renderSidebar()
    expect(screen.getByRole('link', { name: /^home$/i })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: /^family$/i })).toHaveAttribute(
      'href', '/parent/dashboard')
  })
})
