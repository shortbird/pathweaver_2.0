import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FamilyHome from './FamilyHome'
import { OPTIO_ACADEMY_ORG_ID } from '../../config/optioAcademy'

let authState = {}
let actingAsState = {}
let orgState = {}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}))

vi.mock('../../contexts/ActingAsContext', () => ({
  useActingAs: () => actingAsState,
}))

vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => orgState,
}))

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  parentAPI: {
    getMyChildren: vi.fn(),
    getRecentCompletions: vi.fn(),
  },
}))

vi.mock('../../services/dependentAPI', () => ({
  getMyDependents: vi.fn(),
}))

import api, { parentAPI } from '../../services/api'
import { getMyDependents } from '../../services/dependentAPI'

function renderFamilyHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <FamilyHome />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

/** Route-shaped api.get mock; unspecified routes resolve empty. */
function mockApiRoutes(routes = {}) {
  api.get.mockImplementation((url) => {
    const match = Object.keys(routes).find((prefix) => url.startsWith(prefix))
    if (match) return Promise.resolve({ data: routes[match] })
    return Promise.resolve({ data: {} })
  })
}

describe('FamilyHome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: { id: 'parent-1', role: 'parent', first_name: 'Dana', has_dependents: true } }
    actingAsState = { setActingAs: vi.fn(), actingAsDependent: null, clearActingAs: vi.fn() }
    orgState = { school: null, loading: false }

    parentAPI.getMyChildren.mockResolvedValue({ data: { children: [] } })
    parentAPI.getRecentCompletions.mockResolvedValue({ data: { completions: [] } })
    getMyDependents.mockResolvedValue({ dependents: [] })
    mockApiRoutes()
  })

  it('greets the parent by first name', async () => {
    renderFamilyHome()
    expect(await screen.findByText('Welcome back, Dana')).toBeInTheDocument()
  })

  describe('child cards', () => {
    beforeEach(() => {
      parentAPI.getMyChildren.mockResolvedValue({
        data: {
          children: [
            { student_id: 'child-1', student_first_name: 'Emma', student_last_name: 'Smith' },
          ],
        },
      })
      getMyDependents.mockResolvedValue({
        dependents: [{ id: 'dep-1', display_name: 'Little Timmy', first_name: 'Timmy' }],
      })
    })

    it('renders one card per child and dependent, with View links into the parent dashboard', async () => {
      renderFamilyHome()
      expect(await screen.findByText('Emma Smith')).toBeInTheDocument()
      expect(screen.getByText('Timmy')).toBeInTheDocument()

      const viewLinks = screen.getAllByRole('link', { name: 'View' })
      expect(viewLinks.map((l) => l.getAttribute('href'))).toEqual([
        '/parent/dashboard/child-1',
        '/parent/dashboard/dep-1',
      ])
    })

    it('offers Act as only on dependent cards, wired to setActingAs', async () => {
      renderFamilyHome()
      await screen.findByText('Emma Smith')
      const actAs = screen.getAllByRole('button', { name: 'Act as' })
      expect(actAs).toHaveLength(1)
      actAs[0].click()
      expect(actingAsState.setActingAs).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'dep-1' })
      )
    })

    it('shows XP earned this week from recent completions', async () => {
      parentAPI.getRecentCompletions.mockResolvedValue({
        data: {
          completions: [
            { completed_at: new Date().toISOString(), task: { title: 'Build a kite', xp_value: 50 } },
          ],
        },
      })
      renderFamilyHome()
      expect((await screen.findAllByText('50 XP earned this week')).length).toBeGreaterThanOrEqual(1)
    })

    it('deduplicates linked students returned again by the dependents RPC', async () => {
      getMyDependents.mockResolvedValue({
        dependents: [
          { id: 'child-1', first_name: 'Emma', last_name: 'Smith' },
          { id: 'dep-1', display_name: 'Little Timmy', first_name: 'Timmy' },
        ],
      })
      renderFamilyHome()
      await screen.findByText('Emma Smith')
      expect(screen.getAllByText('Emma Smith')).toHaveLength(1)
    })
  })

  describe('empty state', () => {
    it('shows an EmptyState with a CTA to the parent dashboard when there are no children', async () => {
      renderFamilyHome()
      expect(await screen.findByText('No children on your account yet')).toBeInTheDocument()
      const cta = screen.getByRole('link', { name: 'Add your children' })
      expect(cta).toHaveAttribute('href', '/parent/dashboard')
    })
  })

  describe('needs your attention', () => {
    beforeEach(() => {
      mockApiRoutes({
        '/api/sis/parent/context': {
          orgs: [{ organization_id: 'org-1', organization_name: 'iCreate' }],
        },
        '/api/sis/parent/onboarding': {
          assignments: [{ id: 'a1', total_count: 5, done_count: 3 }],
        },
        '/api/sis/parent/forms': {
          submissions: [
            { id: 'f1', status: 'submitted' },
            { id: 'f2', status: 'resolved' },
          ],
        },
        '/api/sis/parent/billing': {
          households: [{ household_id: 'hh1', totals: { balance_cents: 12550 } }],
        },
      })
    })

    it('aggregates checklist, request and balance items, each deep-linking to its page', async () => {
      renderFamilyHome()
      expect(await screen.findByText('Needs your attention')).toBeInTheDocument()

      const checklist = await screen.findByText('2 checklist items to complete')
      expect(checklist.closest('a')).toHaveAttribute('href', '/family/portal')

      const request = screen.getByText('1 open request with iCreate')
      expect(request.closest('a')).toHaveAttribute('href', '/family/forms')

      const balance = screen.getByText('$125.50 balance due')
      expect(balance.closest('a')).toHaveAttribute('href', '/family/billing')
    })

    it('hides the strip entirely when nothing needs attention', async () => {
      mockApiRoutes({
        '/api/sis/parent/context': {
          orgs: [{ organization_id: 'org-1', organization_name: 'iCreate' }],
        },
        '/api/sis/parent/onboarding': { assignments: [{ id: 'a1', total_count: 3, done_count: 3 }] },
        '/api/sis/parent/forms': { submissions: [{ id: 'f2', status: 'resolved' }] },
        '/api/sis/parent/billing': { households: [{ household_id: 'hh1', totals: { balance_cents: 0 } }] },
      })
      renderFamilyHome()
      await screen.findByText('Welcome back, Dana')
      await waitFor(() => {
        expect(screen.queryByText('Needs your attention')).not.toBeInTheDocument()
      })
    })

    it('degrades silently when an attention source fails', async () => {
      api.get.mockImplementation((url) => {
        if (url.startsWith('/api/sis/parent/context')) {
          return Promise.resolve({ data: { orgs: [{ organization_id: 'org-1', organization_name: 'iCreate' }] } })
        }
        if (url.startsWith('/api/sis/parent/billing')) {
          return Promise.resolve({ data: { households: [{ household_id: 'hh1', totals: { balance_cents: 5000 } }] } })
        }
        return Promise.reject(new Error('boom'))
      })
      renderFamilyHome()
      // The failed checklist/forms sources show nothing; billing still lands.
      expect(await screen.findByText('$50.00 balance due')).toBeInTheDocument()
      expect(screen.queryByText(/checklist item/)).not.toBeInTheDocument()
    })
  })

  describe('school section', () => {
    const schoolRoutes = {
      '/api/sis/school/context': {
        success: true,
        orgs: [{ organization_id: 'org-1', name: 'iCreate', is_guardian: true }],
      },
      '/api/announcements/archive': {
        success: true,
        announcements: [
          { id: 'ann-1', title: 'Spring showcase', content: '<p>Join us Friday</p>', created_at: '2026-08-01T00:00:00Z' },
        ],
        total: 1,
      },
    }

    it('renders the latest announcements when the user is in a school', async () => {
      orgState = { school: { id: 'org-1', name: 'iCreate', homepage: false }, loading: false }
      mockApiRoutes(schoolRoutes)
      renderFamilyHome()

      expect(await screen.findByText('From iCreate')).toBeInTheDocument()
      expect(screen.getByText('Spring showcase')).toBeInTheDocument()
      expect(screen.getByText('Join us Friday')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/school')
    })

    it('does not duplicate the school-page card grid on home', async () => {
      // The same eight buttons used to render on home AND on /school, back to
      // back for exactly the orgs that render this section first. The cards
      // live on /school now; home keeps the messages.
      orgState = { school: { id: 'org-1', name: 'iCreate', homepage: true }, loading: false }
      mockApiRoutes(schoolRoutes)
      renderFamilyHome()

      await screen.findByText('From iCreate')
      expect(screen.queryByRole('link', { name: /Billing/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('navigation', { name: 'School surfaces' })).not.toBeInTheDocument()
    })

    it('renders the school section above the child cards for school-homepage orgs', async () => {
      orgState = { school: { id: 'org-1', name: 'iCreate', homepage: true }, loading: false }
      mockApiRoutes(schoolRoutes)
      parentAPI.getMyChildren.mockResolvedValue({
        data: { children: [{ student_id: 'child-1', student_first_name: 'Emma', student_last_name: 'Smith' }] },
      })
      renderFamilyHome()

      const school = await screen.findByText('From iCreate')
      const kids = await screen.findByText('Emma Smith')
      // eslint-disable-next-line no-bitwise
      expect(school.compareDocumentPosition(kids) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('is hidden entirely when the user has no school', async () => {
      orgState = { school: null, loading: false }
      renderFamilyHome()
      await screen.findByText('Welcome back, Dana')
      expect(screen.queryByText(/^From /)).not.toBeInTheDocument()
      expect(api.get).not.toHaveBeenCalledWith('/api/sis/school/context')
    })

    // Optio Academy runs none of the modules the cards link to, so the section
    // is skipped there — and skipped means not fetched, not just not rendered.
    it('is hidden entirely for Optio Academy', async () => {
      orgState = {
        school: { id: OPTIO_ACADEMY_ORG_ID, name: 'Optio Academy', homepage: false },
        loading: false,
      }
      mockApiRoutes(schoolRoutes)
      renderFamilyHome()
      await screen.findByText('Welcome back, Dana')
      expect(screen.queryByText(/^From /)).not.toBeInTheDocument()
      expect(api.get).not.toHaveBeenCalledWith('/api/sis/school/context')
    })
  })
})
