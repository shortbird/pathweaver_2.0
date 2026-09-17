import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FamilyHome from './FamilyHome'

let authState = {}
let orgState = {}
let scopeState = {}
const navigateMock = vi.fn()

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}))

vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => orgState,
}))

// The children come from the family scope context (one fetch for every
// parent surface); the page itself no longer loads them.
vi.mock('../../contexts/FamilyScopeContext', () => ({
  useFamilyScope: () => scopeState,
}))

let summaries = {}
vi.mock('../../hooks/api/useFamilyChildren', () => ({
  useInvalidateFamilyChildren: () => vi.fn(),
  useChildSummary: (id) => ({ data: summaries[id] || null }),
  useUploadChildAvatar: () => ({ mutate: vi.fn(), isPending: false }),
}))

// Peer-connection approvals are the child card's own concern, tested with it.
let approvals = { pending: [], approved: [] }
vi.mock('../../hooks/api/useConnectionApprovals', () => ({
  useConnectionApprovals: () => ({ data: approvals }),
  useDecideConnection: () => ({ mutate: vi.fn(), isPending: false }),
  useRevokeConnection: () => ({ mutate: vi.fn(), isPending: false }),
  forChild: (data, childId) => ({
    pending: (data?.pending || []).filter((r) => r.student_id === childId),
    approved: (data?.approved || []).filter((c) => c.student_id === childId),
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

// The modals and sections the page hosts are their own components with their
// own tests. FamilySettingsModal is kept real enough to assert which tab the
// page opens it on.
const settingsModal = vi.fn()
vi.mock('../../components/parent/AddChildModal', () => ({ default: () => null }))
vi.mock('../../components/parent/FamilySettingsModal', () => ({
  default: (props) => { settingsModal(props); return props.isOpen ? <div data-testid="family-settings" data-tab={props.initialTab} /> : null },
}))
vi.mock('../../components/parent/FamilyQuestsSection', () => ({ default: () => <div data-testid="family-quests" /> }))
vi.mock('../../components/parent/FamilyCover', () => ({ default: () => <div data-testid="family-cover" /> }))
vi.mock('../../components/parent/ParentMomentCaptureButton', () => ({ default: () => null }))
vi.mock('../../components/parent/VisibilityApprovalSection', () => ({ default: () => null }))
vi.mock('../../components/overview/WeeklyXpGoalCard', () => ({ default: () => null }))

import api from '../../services/api'

const child = (id, name, extra = {}) => ({
  id, name, firstName: name.split(' ')[0], avatarUrl: null, isDependent: false, dateOfBirth: null, raw: { id }, ...extra,
})

function renderFamilyHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/family']}>
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
    authState = { user: { id: 'parent-1', role: 'parent', first_name: 'Dana', has_dependents: true }, refreshUser: vi.fn() }
    orgState = { school: null, loading: false }
    scopeState = { children: [], isLoading: false, enterScope: vi.fn(), exitScope: vi.fn(), isScoped: false }
    summaries = {}
    mockApiRoutes()
  })

  it('greets the parent by first name', async () => {
    renderFamilyHome()
    expect(await screen.findByText('Welcome back, Dana')).toBeInTheDocument()
  })

  describe('child cards', () => {
    beforeEach(() => {
      scopeState.children = [
        child('child-1', 'Emma Smith'),
        child('dep-1', 'Timmy', { isDependent: true, dateOfBirth: '2018-05-01' }),
      ]
    })

    it('renders one card per child, each with an Open that enters family scope', async () => {
      renderFamilyHome()
      expect(await screen.findByText('Emma Smith')).toBeInTheDocument()
      expect(screen.getByText('Timmy')).toBeInTheDocument()

      const open = screen.getAllByRole('button', { name: 'Open' })
      expect(open).toHaveLength(2)
      open[1].click()
      expect(scopeState.enterScope).toHaveBeenCalledWith('dep-1')
      expect(navigateMock).toHaveBeenCalledWith('/dashboard')
    })

    it('never offers Act as', async () => {
      // A parent works on a child's account as themselves now (family scope);
      // the token-swapping act-as button is gone for every child, whatever
      // their age or login.
      renderFamilyHome()
      await screen.findByText('Emma Smith')
      expect(screen.queryByRole('button', { name: /act as/i })).not.toBeInTheDocument()
    })

    it('summarises each child from their dashboard read', async () => {
      summaries['child-1'] = {
        student: { total_xp: 1250, streak_days: 4 },
        stats: { active_quests_count: 2 },
        learning_rhythm: { last_activity_date: new Date().toISOString() },
        active_quests: [{
          quest_id: 'q1', title: 'Pack for the trip',
          progress: { completed_tasks: 1, total_tasks: 2, percentage: 50 },
          rhythm: { state: 'in_flow', state_display: 'In Flow', last_7_days: [] },
        }],
        recent_completions: [{ task_title: 'Make a packing list', quest_title: 'Pack for the trip', xp_earned: 50, completed_at: new Date().toISOString() }],
      }
      renderFamilyHome()
      expect(await screen.findByText(/1,250 XP · 2 active quests · 4-day streak · Active Just now/)).toBeInTheDocument()
      expect(screen.getByText('Pack for the trip')).toBeInTheDocument()
      // The quest carries the child's rhythm on it, not a progress bar.
      expect(screen.getByText('In Flow')).toBeInTheDocument()
      expect(screen.queryByText('1/2 tasks')).not.toBeInTheDocument()
      // No completions feed on the card, and no age chip.
      expect(screen.queryByText('Make a packing list')).not.toBeInTheDocument()
      expect(screen.queryByText('Under 13')).not.toBeInTheDocument()
    })

    it('names the class under a quest a class set', async () => {
      // Ticket 55ef3acf (Marika Connole, iCreate): "Language Studio B has a
      // vocab quest that we have no idea how to find as a parent." The quest
      // was on the card; nothing said which class put it there.
      summaries['child-1'] = {
        student: { total_xp: 0, streak_days: 0 },
        stats: { active_quests_count: 2 },
        learning_rhythm: { last_activity_date: null },
        active_quests: [
          { quest_id: 'q-vocab', title: 'Building Words with Prefixes and Roots', progress: {},
            rhythm: { state: 'in_flow', state_display: 'In Flow', last_7_days: [] },
            class_assignment: { class_id: 'cls-1', class_name: 'Language Studio B', due_date: null } },
          { quest_id: 'q-own', title: 'Backyard Birds', progress: {},
            rhythm: { state: 'in_flow', state_display: 'In Flow', last_7_days: [] },
            class_assignment: null },
        ],
      }
      renderFamilyHome()
      expect(await screen.findByText('Language Studio B')).toBeInTheDocument()
      expect(screen.getAllByText('Language Studio B')).toHaveLength(1)
    })

    it("the child's name opens their full profile in their scope", async () => {
      renderFamilyHome()
      ;(await screen.findByRole('button', { name: 'Emma Smith' })).click()
      expect(scopeState.enterScope).toHaveBeenCalledWith('child-1')
      expect(navigateMock).toHaveBeenCalledWith('/overview')
    })

    it("a quest on a child's card opens that child's copy of it", async () => {
      summaries['child-1'] = {
        student: { total_xp: 10 }, stats: {}, learning_rhythm: {},
        active_quests: [{ quest_id: 'q1', title: 'Pack for the trip', progress: {}, rhythm: { state: 'in_flow', state_display: 'In Flow', last_7_days: [] } }],
        recent_completions: [],
      }
      renderFamilyHome()
      ;(await screen.findByRole('button', { name: /Pack for the trip/ })).click()
      expect(scopeState.enterScope).toHaveBeenCalledWith('child-1')
      expect(navigateMock).toHaveBeenCalledWith('/quests/q1')
    })

    it('keeps settings and add-a-child in Family Settings, off the cards', async () => {
      renderFamilyHome()
      await screen.findByText('Emma Smith')
      expect(screen.queryByRole('button', { name: /settings for/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add a child' })).not.toBeInTheDocument()
      screen.getByRole('button', { name: /Family settings/ }).click()
      expect(await screen.findByTestId('family-settings')).toHaveAttribute('data-tab', 'you')
    })

    // A friend request is one decision about one child, taken next to the
    // Friends policy in that child's settings. The card says one is waiting
    // and opens that tab; the request itself is not on the card.
    it("announces a waiting friend request on the card and opens that child's settings", async () => {
      approvals = { pending: [{ id: 'req-1', student_id: 'child-1', requester: { display_name: 'Ada' } }], approved: [] }
      renderFamilyHome()
      const line = await screen.findByRole('button', { name: /friend request waiting for you/i })
      expect(screen.queryByText('Ada')).not.toBeInTheDocument()
      line.click()
      expect(await screen.findByTestId('family-settings')).toHaveAttribute('data-tab', 'child-1')
      approvals = { pending: [], approved: [] }
    })

    it('opens Family Settings on the tab ?settings= names', async () => {
      render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter initialEntries={['/family?settings=you']}>
            <FamilyHome />
          </MemoryRouter>
        </QueryClientProvider>
      )
      expect(await screen.findByTestId('family-settings')).toHaveAttribute('data-tab', 'you')
    })

    // ?friends=<childId> is every Friends notification's link: that child's
    // settings, open on the Friends row. Bare /family was the page the
    // parent was already on, so "View details" did nothing.
    it("opens the child's settings on the Friends row for ?friends=", async () => {
      render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter initialEntries={['/family?friends=child-1']}>
            <FamilyHome />
          </MemoryRouter>
        </QueryClientProvider>
      )
      expect(await screen.findByTestId('family-settings')).toHaveAttribute('data-tab', 'child-1')
      const props = settingsModal.mock.calls.at(-1)[0]
      expect(props.initialSection).toBe('friends')
    })

    it("a waiting friend request on the card opens that child's Friends row", async () => {
      approvals = { pending: [{ id: 'req-1', student_id: 'child-1', requester: { display_name: 'Ada' } }], approved: [] }
      renderFamilyHome()
      const line = await screen.findByRole('button', { name: /friend request waiting for you/i })
      line.click()
      expect(await screen.findByTestId('family-settings')).toHaveAttribute('data-tab', 'child-1')
      expect(settingsModal.mock.calls.at(-1)[0].initialSection).toBe('friends')
      approvals = { pending: [], approved: [] }
    })

    it('renders the family photo above everything and the family quests section', async () => {
      renderFamilyHome()
      const cover = await screen.findByTestId('family-cover')
      expect(await screen.findByTestId('family-quests')).toBeInTheDocument()
      const greeting = screen.getByText('Welcome back, Dana')
      // eslint-disable-next-line no-bitwise
      expect(cover.compareDocumentPosition(greeting) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  describe('empty state', () => {
    it('shows an EmptyState with an Add-your-child button when there are no children', async () => {
      renderFamilyHome()
      expect(await screen.findByText('No children on your account yet')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add your child' })).toBeInTheDocument()
    })

    // In an SIS school the office links students to their family; a child
    // added from here would land outside the household. No door, and the
    // empty state names the school to ask.
    it('offers no Add-your-child in an SIS school, and says who to ask', async () => {
      authState = {
        user: {
          id: 'parent-1', role: 'org_managed', org_roles: ['parent'], first_name: 'Dana',
          organization: { id: 'org-1', effective_modules: ['sis'] },
        },
        refreshUser: vi.fn(),
      }
      orgState = { school: { id: 'org-1', name: 'iCreate', homepage: false }, loading: false }
      renderFamilyHome()
      expect(await screen.findByText('No students linked to your account yet')).toBeInTheDocument()
      expect(screen.getByText(/Ask iCreate to link your student/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add your child' })).not.toBeInTheDocument()
      // Family Settings gets no add-child callback either.
      fireEvent.click(screen.getByRole('button', { name: /Family settings/ }))
      expect(settingsModal).toHaveBeenLastCalledWith(expect.objectContaining({ isOpen: true, onAddChild: null }))
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

    it('aggregates checklist and request items, each deep-linking to its page', async () => {
      renderFamilyHome()
      expect(await screen.findByText('Needs your attention')).toBeInTheDocument()

      const checklist = await screen.findByText('2 form items to complete')
      expect(checklist.closest('a')).toHaveAttribute('href', '/family/forms')

      const request = screen.getByText('1 request waiting on iCreate')
      expect(request.closest('a')).toHaveAttribute('href', '/family/forms#requests')
    })

    // The balance due lived here as a third card until 2026-09-16. It is the
    // notice at the top of Billing now (familyBillingPage.test: "the balance
    // due is the notice at the top"); the home neither shows it nor asks for it.
    it('leaves money to the Billing page', async () => {
      renderFamilyHome()
      await screen.findByText('Needs your attention')
      expect(screen.queryByText(/balance due/)).not.toBeInTheDocument()
      expect(api.get.mock.calls.some(([url]) => url.startsWith('/api/sis/parent/billing'))).toBe(false)
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
        if (url.startsWith('/api/sis/parent/forms')) {
          return Promise.resolve({ data: { submissions: [{ id: 'f1', status: 'submitted' }] } })
        }
        return Promise.reject(new Error('boom'))
      })
      renderFamilyHome()
      // The failed checklist source shows nothing; the request still lands.
      expect(await screen.findByText('1 request waiting on iCreate')).toBeInTheDocument()
      expect(screen.queryByText(/form item/)).not.toBeInTheDocument()
    })
  })

  describe('the school\'s messages', () => {
    // The home carried a third copy of the announcements feed (the bell and
    // /school being the other two) until the sidebar grew a section under
    // the school's name with Announcements first (2026-09-15). The home no
    // longer renders or fetches it, in a school or out of one.
    it('are not on the home, and are not fetched', async () => {
      orgState = { school: { id: 'org-1', name: 'iCreate', homepage: true }, loading: false }
      mockApiRoutes({
        '/api/announcements/archive': { success: true, announcements: [
          { id: 'ann-1', title: 'Spring showcase', content: '<p>Join us Friday</p>', created_at: '2026-08-01T00:00:00Z' },
        ] },
      })
      renderFamilyHome()
      await screen.findByText('Welcome back, Dana')
      expect(screen.queryByText(/^From /)).not.toBeInTheDocument()
      expect(screen.queryByText('Spring showcase')).not.toBeInTheDocument()
      expect(api.get).not.toHaveBeenCalledWith('/api/announcements/archive', expect.anything())
      expect(api.get).not.toHaveBeenCalledWith('/api/sis/community/feed')
    })
  })
})
