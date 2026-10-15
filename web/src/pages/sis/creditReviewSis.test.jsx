/**
 * Credit Review in the SIS console (/credit-review), 2026-10-15.
 *
 * The org stage of credit review had no SIS door: the web sidebar hid "Credit
 * Review" from SIS schools and no console page read diploma_status, so 299
 * requests sat at 'pending_org_approval' in prod (Gryffin 222, the oldest from
 * March). These pin the console's door to the queue:
 *
 *   - who is offered it (the nav and the route guard): every staff role --
 *     org admins, coordinators and teachers (2026-10-15) -- and superadmins;
 *     not a parent, not a school whose credit Optio reviews directly;
 *   - what an approval says it did: "Added to the transcript" when the school
 *     makes the final call, "Sent to Optio for review" when Optio does;
 *   - that the queue is the org's, and an org admin whose first org role is
 *     something else still approves at the org stage;
 *   - that the student link and its Back work on the console's routes.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfirmProvider } from '../../contexts/ConfirmContext'
import CreditReviewPage from './CreditReviewPage'
import OrgStudentOverviewPage from '../admin/OrgStudentOverviewPage'
import { CreditReviewRoute } from '../../sis/SisRoutes'
import { NAV_SECTIONS } from '../../components/sis/SisSidebar'
import { navContextFor, navItemVisible } from './sisNavVisibility'
import { buildSearchIndex } from './sisSearchIndex'

const { api, authState, orgState } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  authState: { current: null },
  orgState: { current: null },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState.current }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => orgState.current,
  withOrg: (p) => p,
}))
vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ organization: null }),
}))
vi.mock('../../components/advisor/AdvisorStudentOverviewContent', () => ({
  default: ({ studentId }) => <p>Overview of {studentId}</p>,
}))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

// An org admin whose org_roles lead with 'advisor': the singular effective
// role reads 'advisor', which is the case the SIS mount's reviewerRole fixes.
const ADMIN = {
  id: 'a1', role: 'org_managed', org_role: 'advisor', org_roles: ['advisor', 'org_admin'],
}
const COORDINATOR = { id: 'c1', role: 'org_managed', org_role: 'campus_coordinator', org_roles: ['campus_coordinator'] }
const TEACHER = { id: 't1', role: 'org_managed', org_role: 'advisor', org_roles: ['advisor'] }
const SUPER = { id: 's1', role: 'superadmin' }
const PARENT = { id: 'p1', role: 'parent' }
const GRYFFIN = { id: 'org-1', name: 'Gryffin', feature_flags: {} }
const OPTIO_REVIEWS = { id: 'org-2', name: 'Academy', feature_flags: { credit_review_by_optio: true } }

const creditItem = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.path === '/credit-review')
const offered = (user, org) => navItemVisible(creditItem, navContextFor(user, org))

const row = (n) => ({
  completion_id: `c${n}`, student_id: `s${n}`, student_name: `Student ${n}`,
  task_title: `Task ${n}`, quest_title: 'Bridge', diploma_status: 'pending_org_approval',
  xp_value: 100, evidence_block_count: 1, is_org_student: true,
  organization_id: 'org-1', organization_name: 'Gryffin',
})
const detailFor = (id) => ({
  completion: { id, user_id: `s${id.slice(1)}`, diploma_status: 'pending_org_approval',
                user_quest_task_id: `t${id}` },
  task: { id: `t${id}`, title: `Task ${id.slice(1)}`, xp_value: 100,
          success_criteria: ['Did it'], subject_xp_distribution: { science: 100 } },
  quest: { id: 'q0', title: 'Bridge' },
  student: { display_name: `Student ${id.slice(1)}` },
  evidence_blocks: [], review_rounds: [], suggested_subjects: { science: 100 },
  is_org_student: true,
})

const Where = () => {
  const l = useLocation()
  return <output data-testid="where">{l.pathname + l.search}</output>
}

const renderConsole = (url = '/credit-review') => render(
  <QueryClientProvider client={new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })}>
    <ConfirmProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/" element={<p>Dashboard</p>} />
          <Route path="/credit-review" element={<CreditReviewRoute><CreditReviewPage /></CreditReviewRoute>} />
          <Route path="/admin/organizations/:orgId/student/:studentId" element={<OrgStudentOverviewPage />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </ConfirmProvider>
  </QueryClientProvider>,
)

const setReader = (user, org = GRYFFIN) => {
  authState.current = {
    user, effectiveRole: user.role === 'superadmin' ? 'superadmin' : user.org_role,
    isAdmin: false, isSuperadmin: user.role === 'superadmin',
  }
  orgState.current = { orgId: org?.id || null, activeOrg: org, loading: false }
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  setReader(ADMIN)
  api.get.mockImplementation((url) => {
    if (url === '/api/credit-dashboard/items') {
      return Promise.resolve({ data: { data: { items: [row(0), row(1)], total: 2 } } })
    }
    if (url.startsWith('/api/credit-dashboard/items/')) {
      return Promise.resolve({ data: { data: detailFor(url.split('/').pop()) } })
    }
    if (url === '/api/credit-dashboard/stats') {
      return Promise.resolve({ data: { data: { pending_org_approval: 2, pending_review: 0 } } })
    }
    return Promise.resolve({ data: { data: {} } })
  })
  api.post.mockResolvedValue({ data: { data: { success: true } } })
})

describe('who is offered Credit Review', () => {
  it('an org admin and a superadmin, at a school that approves its own credit first', () => {
    expect(offered(ADMIN, GRYFFIN)).toBe(true)
    expect(offered(SUPER, GRYFFIN)).toBe(true)
  })

  it('a coordinator and a teacher too (2026-10-15)', () => {
    expect(offered(COORDINATOR, GRYFFIN)).toBe(true)
    expect(offered(TEACHER, GRYFFIN)).toBe(true)
  })

  it('not a parent', () => {
    expect(offered(PARENT, GRYFFIN)).toBe(false)
  })

  it('not at a school whose credit Optio reviews directly', () => {
    expect(offered(ADMIN, OPTIO_REVIEWS)).toBe(false)
  })

  it('needs no module: a school with every opt-in block off still has it', () => {
    expect(offered(ADMIN, { ...GRYFFIN, effective_modules: ['sis'] })).toBe(true)
  })

  it('the header search finds it for the same readers', () => {
    const names = (user) => buildSearchIndex(navContextFor(user, GRYFFIN)).map((e) => e.name)
    expect(names(ADMIN)).toContain('Credit Review')
    expect(names(COORDINATOR)).toContain('Credit Review')
    expect(names(TEACHER)).toContain('Credit Review')
  })
})

describe('the route guard', () => {
  it('bounces a parent who types the URL to the dashboard', async () => {
    setReader(PARENT)
    renderConsole()
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalledWith('/api/credit-dashboard/items', expect.anything())
  })

  it.each([['a coordinator', COORDINATOR], ['a teacher', TEACHER]])(
    'lets %s in, with the school-stage buttons', async (_label, user) => {
      setReader(user)
      renderConsole()
      fireEvent.click(await screen.findByRole('button', { name: 'Start grading' }))
      await screen.findByRole('heading', { name: 'Task 0' })
      expect(screen.getByRole('button', { name: /approve for optio review/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /grow this/i })).toBeInTheDocument()
    })

  it('bounces at a school whose credit Optio reviews', async () => {
    setReader(ADMIN, OPTIO_REVIEWS)
    renderConsole()
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  })
})

describe('the queue in the console', () => {
  it("asks for the org in view's queue and stats", async () => {
    renderConsole()
    await screen.findByRole('button', { name: 'Start grading' })
    const items = api.get.mock.calls.find(([u]) => u === '/api/credit-dashboard/items')
    expect(items[1].params.org_id).toBe('org-1')
    const stats = api.get.mock.calls.find(([u]) => u === '/api/credit-dashboard/stats')
    expect(stats[1].params.org_id).toBe('org-1')
    expect(await screen.findByText('2 pending org')).toBeInTheDocument()
  })

  it('an org admin whose first role is advisor still approves on to Optio', async () => {
    renderConsole()
    fireEvent.click(await screen.findByRole('button', { name: 'Start grading' }))
    await screen.findByRole('heading', { name: 'Task 0' })
    fireEvent.click(screen.getByRole('button', { name: /approve for optio review/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][0]).toBe('/api/credit-dashboard/items/c0/org-approve')
  })

  it('says the request went to Optio when Optio makes the final call', async () => {
    const { toast } = await import('react-hot-toast')
    api.post.mockResolvedValue({ data: { data: { diploma_status: 'pending_review', final_reviewer: 'optio' } } })
    renderConsole()
    fireEvent.click(await screen.findByRole('button', { name: 'Start grading' }))
    await screen.findByRole('heading', { name: 'Task 0' })
    fireEvent.click(screen.getByRole('button', { name: /approve for optio review/i }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Sent to Optio for review'))
  })

  it("says the credit is on the transcript when the school makes the final call", async () => {
    const { toast } = await import('react-hot-toast')
    api.get.mockImplementation((url) => {
      if (url === '/api/credit-dashboard/items') {
        return Promise.resolve({ data: { data: {
          items: [{ ...row(0), final_reviewer: 'school' }], total: 1 } } })
      }
      if (url.startsWith('/api/credit-dashboard/items/')) {
        return Promise.resolve({ data: { data: { ...detailFor('c0'), final_reviewer: 'school' } } })
      }
      return Promise.resolve({ data: { data: {} } })
    })
    api.post.mockResolvedValue({ data: { data: { diploma_status: 'finalized', final_reviewer: 'school' } } })
    setReader(TEACHER)
    renderConsole()
    fireEvent.click(await screen.findByRole('button', { name: 'Start grading' }))
    await screen.findByRole('heading', { name: 'Task 0' })
    expect(screen.getByText(/makes the final call on this request/)).toBeInTheDocument()
    // The school is the final reviewer, so it sets the XP.
    expect(screen.getByLabelText('XP to award')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /approve at 100 xp/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][0]).toBe('/api/credit-dashboard/items/c0/org-approve')
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Added to the transcript'))
  })

  it("the student's name opens their overview, and Back returns to the same item", async () => {
    renderConsole()
    fireEvent.click(await screen.findByRole('button', { name: 'Start grading' }))
    await screen.findByRole('heading', { name: 'Task 0' })
    fireEvent.click(screen.getByTitle("Open Student 0's profile"))

    expect(await screen.findByText('Overview of s0')).toBeInTheDocument()
    const where = screen.getByTestId('where').textContent
    expect(where).toMatch(/^\/admin\/organizations\/org-1\/student\/s0\?returnTo=/)
    expect(decodeURIComponent(where)).toContain('returnTo=/credit-review?')

    fireEvent.click(screen.getByRole('button', { name: /Back to grading/ }))
    await screen.findByRole('heading', { name: 'Task 0' })
    expect(screen.getByTestId('where').textContent).toMatch(/^\/credit-review\?.*cr_item=c0/)
  })

  it('asks a superadmin with no org picked to pick one', () => {
    setReader(SUPER, null)
    renderConsole()
    expect(screen.getByText(/Select an organization/)).toBeInTheDocument()
  })
})
