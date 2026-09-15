import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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


// Family scope: which child a parent is working for. Unscoped by default;
// the family-scope describe below picks one.
let scopeState = { isScoped: false, selectedChild: null, hasFamily: false, children: [], isLoading: false }
vi.mock('../../contexts/FamilyScopeContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useFamilyScope: () => scopeState,
}))
vi.mock('../parent/ProfileSwitcher', () => ({ default: () => <div data-testid="profile-switcher" /> }))

// /api/sis/school/context answers "which of the school's surfaces may this
// person reach"; the school section below reads it. Everything else the
// sidebar asks for (courses, classes) answers empty.
let schoolContext = { success: true, orgs: [], is_guardian: false }
vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn((url) => Promise.resolve(
      url === '/api/sis/school/context' ? { data: schoolContext } : { data: { courses: [] } })),
  },
}))

vi.mock('../../services/masqueradeService', () => ({
  getMasqueradeState: () => null,
  exitMasquerade: vi.fn(),
}))

vi.mock('../admin/MasqueradeBanner', () => ({ default: () => null }))

import Sidebar from './Sidebar'
import { OPTIO_ACADEMY_ORG_ID } from '../../config/optioAcademy'

beforeEach(() => {
  schoolContext = { success: true, orgs: [], is_guardian: false }
})

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

describe('Sidebar — the school section for a guardian', () => {
  // From 2026-08-06 to 2026-09-15 the school's family surfaces (billing,
  // absences, checklists, requests, schedule) were cards on /school and
  // nothing else: a parent looking for "where do I pay" had to know to open
  // the school's page first. They are a section under the school's name now,
  // from the same catalog the /school rail reads (pages/school/schoolCards).
  const GUARDIAN_ORG = {
    organization_id: 'org-1', organization_name: 'iCreate',
    is_guardian: true, post_registration_flow: 'schedule',
  }

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
    schoolContext = { success: true, orgs: [GUARDIAN_ORG], is_guardian: true }
  })

  it('lists the family doors under the school\'s name', async () => {
    renderSidebar()
    expect(await screen.findByRole('link', { name: /^billing$/i })).toHaveAttribute('href', '/family/billing')
    expect(screen.getByRole('link', { name: /^absences$/i })).toHaveAttribute('href', '/absences')
    expect(screen.getByRole('link', { name: /^checklists$/i })).toHaveAttribute('href', '/family/portal')
    expect(screen.getByRole('link', { name: /^requests$/i })).toHaveAttribute('href', '/family/forms')
    expect(screen.getByRole('link', { name: /^schedule$/i })).toHaveAttribute('href', '/schedule-builder')
    expect(screen.getByRole('link', { name: /^calendar$/i })).toHaveAttribute('href', '/school-calendar')
    expect(screen.getByText('iCreate')).toBeInTheDocument()
  })

  it('carries the school\'s own page as Announcements, once', async () => {
    renderSidebar()
    await screen.findByRole('link', { name: /^billing$/i })
    const schoolLinks = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/school')
    expect(schoolLinks).toHaveLength(1)
    expect(schoolLinks[0]).toHaveAccessibleName(/announcements/i)
  })

  it('leaves resources, directory and carpool to the school page', async () => {
    renderSidebar()
    await screen.findByRole('link', { name: /^billing$/i })
    expect(screen.queryByRole('link', { name: /^resources$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^directory$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^carpool$/i })).not.toBeInTheDocument()
  })

  it('gives a student at the school the school item and no family doors', async () => {
    authState.user = { id: 's1', role: 'org_managed', org_role: 'student', organization_id: 'org-1', email: 's@example.com' }
    schoolContext = { success: true, orgs: [{ ...GUARDIAN_ORG, is_guardian: false }], is_guardian: false }
    renderSidebar()
    expect(await screen.findByRole('link', { name: /icreate/i })).toHaveAttribute('href', '/school')
    expect(screen.queryByRole('link', { name: /^billing$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^absences$/i })).not.toBeInTheDocument()
  })

  it('keeps the things that are not the school', () => {
    // A parent's home is the family dashboard.
    renderSidebar()
    expect(screen.getByRole('link', { name: /^family$/i })).toHaveAttribute(
      'href', '/family')
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

  it('gives an unscoped parent Family -> /family and no Quests', () => {
    authState.user = { id: 'p1', role: 'parent', email: 'p@example.com' }
    renderSidebar()
    expect(screen.getByRole('link', { name: /^family$/i })).toHaveAttribute('href', '/family')
    expect(screen.queryByRole('link', { name: /^home$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^quests$/i })).not.toBeInTheDocument()
  })

  it('lists the family dashboard once — the home slot absorbs the Family item', () => {
    authState.user = { id: 'p1', role: 'parent', has_dependents: true, email: 'p@example.com' }
    renderSidebar()
    const familyLinks = screen.getAllByRole('link').filter(
      (l) => l.getAttribute('href') === '/family'
    )
    expect(familyLinks).toHaveLength(1)
  })
})

describe('Sidebar — family scope: a parent working on a child\'s account', () => {
  // Once a parent has picked a child on the family dashboard, the child's own
  // surfaces appear -- Home, Quests, Journal, Portfolio -- pointed at the
  // child (contexts/FamilyScopeContext). This replaced the act-as token swap.
  beforeEach(() => {
    localStorage.clear()
    authState = {
      user: { id: 'p1', role: 'parent', has_dependents: true, email: 'p@example.com' },
      logout: vi.fn(), isAuthenticated: true,
    }
    orgState = { organization: null }
    scopeState = {
      isScoped: true, hasFamily: true, isLoading: false,
      selectedChild: { id: 'kid-1', firstName: 'Romney', dateOfBirth: '2014-03-21' },
      children: [{ id: 'kid-1', firstName: 'Romney' }],
    }
  })

  afterEach(() => {
    scopeState = { isScoped: false, selectedChild: null, hasFamily: false, children: [], isLoading: false }
  })

  it('adds the child\'s home, quests, journal and portfolio', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /^family$/i })).toHaveAttribute('href', '/family')
    expect(screen.getByRole('link', { name: /romney's home/i })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: /^quests$/i })).toHaveAttribute('href', '/quests')
    expect(screen.getByRole('link', { name: /^journal$/i })).toHaveAttribute('href', '/learning-journal')
    expect(screen.getByRole('link', { name: /^portfolio$/i })).toHaveAttribute('href', '/overview')
  })

  it('renders the scope switcher for anyone with a family', () => {
    renderSidebar()
    expect(screen.getByTestId('profile-switcher')).toBeInTheDocument()
  })

  it('gates Custom Class on the CHILD\'s age, not the parent\'s', () => {
    scopeState.selectedChild = { id: 'kid-2', firstName: 'Hope', dateOfBirth: '2018-10-28' }
    renderSidebar()
    expect(screen.queryByRole('link', { name: /^custom class$/i })).not.toBeInTheDocument()
  })
})

describe('Sidebar — the two feeds have distinct names', () => {
  beforeEach(() => {
    localStorage.clear()
    authState = { user: null, logout: vi.fn(), isAuthenticated: true }
    orgState = { organization: null }
  })

  it("names the student's evidence feed Feed", () => {
    // Was "My Feed" until peer connections gave it a second source. It shows
    // connected friends' work now, so the possessive stopped being true.
    authState.user = { id: 'u1', role: 'student', email: 's@example.com' }
    renderSidebar()
    expect(screen.getByRole('link', { name: /^feed$/i })).toHaveAttribute('href', '/feedback')
    expect(screen.queryByRole('link', { name: /^my feed$/i })).not.toBeInTheDocument()
  })

  it('names the observer-side feed Student Feed (superadmin sees both, unambiguously)', () => {
    // The pair still has to be distinguishable: a superadmin sees the student
    // surface and the observer surface in one sidebar.
    authState.user = { id: 'u1', role: 'superadmin', email: 't@example.com' }
    renderSidebar()
    expect(screen.getByRole('link', { name: /^student feed$/i })).toHaveAttribute('href', '/observer/feed')
    expect(screen.queryByRole('link', { name: /^my feed$/i })).not.toBeInTheDocument()
  })
})

describe('Sidebar — every parent: the Family tab is the home tab', () => {
  // Until 2026-09-15 only Optio Academy parents had Family in the home slot;
  // other parents got a Home digest plus a separate Family item. One parent
  // page now, at /family, for every school.
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
    expect(screen.getByRole('link', { name: /^family$/i })).toHaveAttribute('href', '/family')
    expect(screen.queryByRole('link', { name: /^home$/i })).not.toBeInTheDocument()
  })

  it('still lists the family dashboard exactly once', () => {
    authState.user = academyParent
    renderSidebar()
    const links = screen.getAllByRole('link').filter(
      (l) => l.getAttribute('href') === '/family'
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

  it('gives parents at other schools the same Family home', () => {
    authState.user = { ...academyParent, organization_id: 'some-other-org' }
    renderSidebar()
    expect(screen.queryByRole('link', { name: /^home$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^family$/i })).toHaveAttribute('href', '/family')
  })
})

describe('Sidebar — Custom Class link visibility', () => {
  beforeEach(() => {
    authState = { user: null, logout: vi.fn(), isAuthenticated: true }
    orgState = { organization: null }
  })

  const customClassLink = () => screen.queryByRole('link', { name: /custom class/i })

  it('shows Custom Class for a platform student', () => {
    authState.user = { id: 's1', role: 'student', email: 's@example.com' }
    renderSidebar()
    expect(customClassLink()).toHaveAttribute('href', '/my-classes')
  })

  it('shows Custom Class for an org student', () => {
    authState.user = {
      id: 's2', role: 'org_managed', org_role: 'student',
      organization_id: 'org-1', email: 's2@example.com',
    }
    renderSidebar()
    expect(customClassLink()).toHaveAttribute('href', '/my-classes')
  })

  it('hides Custom Class from parents and observers', () => {
    authState.user = { id: 'p1', role: 'parent', email: 'p@example.com' }
    const { unmount } = renderSidebar()
    expect(customClassLink()).not.toBeInTheDocument()
    unmount()

    authState.user = { id: 'o1', role: 'observer', email: 'o@example.com' }
    renderSidebar()
    expect(customClassLink()).not.toBeInTheDocument()
  })

  // Classes are 13+, matching the mobile gate. A known under-13 never sees the
  // entry; a student whose birthday we don't have still does, because the page
  // is what collects it.
  it('hides Custom Class from a student under 13', () => {
    const elevenYearsAgo = new Date()
    elevenYearsAgo.setFullYear(elevenYearsAgo.getFullYear() - 11)
    authState.user = {
      id: 's3', role: 'student', email: 's3@example.com',
      date_of_birth: elevenYearsAgo.toISOString().slice(0, 10),
    }
    renderSidebar()
    expect(customClassLink()).not.toBeInTheDocument()
  })

  it('still shows Custom Class when the birthday is unknown', () => {
    authState.user = { id: 's4', role: 'student', email: 's4@example.com', date_of_birth: null }
    renderSidebar()
    expect(customClassLink()).toHaveAttribute('href', '/my-classes')
  })
})
