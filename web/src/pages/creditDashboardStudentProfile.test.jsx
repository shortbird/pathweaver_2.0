/**
 * From the grader to the student's profile, and back to the same item.
 *
 * A reviewer mid-queue clicks the student's name to see who they are grading.
 * Back must return them to that item, with the same filters and page, and
 * with the note they had started still in the box -- not to the top of a
 * queue of forty with the grader closed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import api from '../services/api'
import CreditReviewDashboardPage, { queueSearch, studentProfilePath } from './CreditReviewDashboardPage'
import OrgStudentOverviewPage, { safeReturnTo } from './admin/OrgStudentOverviewPage'
import { ConfirmProvider } from '../contexts/ConfirmContext'

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ effectiveRole: 'superadmin', user: { id: 'super-1' }, isSuperadmin: true, isAdmin: false }),
}))
vi.mock('../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ organization: null }),
}))
vi.mock('../components/advisor/AdvisorStudentOverviewContent', () => ({
  default: ({ studentId }) => <p>Overview of {studentId}</p>,
}))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const row = (n, extra = {}) => ({
  completion_id: `c${n}`,
  student_id: `s${n}`,
  student_name: `Student ${n}`,
  task_title: `Task ${n}`,
  quest_title: 'Bridge',
  diploma_status: 'pending_review',
  xp_value: 100,
  evidence_block_count: 1,
  ai_status: 'not_run',
  is_org_student: true,
  organization_id: 'org-1',
  organization_name: 'Hearthwood Academy',
  ...extra,
})

const detailFor = (id) => ({
  completion: { id, user_id: `s${id.slice(1)}`, diploma_status: 'pending_review',
                user_quest_task_id: `t${id}` },
  task: { id: `t${id}`, title: `Task ${id.slice(1)}`, xp_value: 100,
          success_criteria: ['Did it'], subject_xp_distribution: { science: 100 } },
  quest: { id: 'q0', title: 'Bridge' },
  student: { display_name: `Student ${id.slice(1)}` },
  evidence_blocks: [], review_rounds: [], suggested_subjects: { science: 100 },
  is_org_student: true,
  ai: { status: 'not_run' },
})

const Where = () => {
  const location = useLocation()
  return <output data-testid="where">{location.pathname + location.search}</output>
}

const renderAt = (url) => render(
  <QueryClientProvider client={new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })}>
    <ConfirmProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/credit-dashboard" element={<CreditReviewDashboardPage />} />
          <Route path="/admin/organizations/:orgId/student/:studentId" element={<OrgStudentOverviewPage />} />
          <Route path="/admin/students/:studentId" element={<OrgStudentOverviewPage />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </ConfirmProvider>
  </QueryClientProvider>,
)

const heading = (n) => screen.findByRole('heading', { name: `Task ${n}` })
const itemsCalls = () =>
  api.get.mock.calls.filter(([url]) => url === '/api/credit-dashboard/items')

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  api.get.mockImplementation((url) => {
    if (url === '/api/credit-dashboard/items') {
      return Promise.resolve({ data: { data: { items: [row(0), row(1, {
        organization_id: null, organization_name: null, is_org_student: false,
      })], total: 2 } } })
    }
    if (url.startsWith('/api/credit-dashboard/items/')) {
      return Promise.resolve({ data: { data: detailFor(url.split('/').pop()) } })
    }
    if (url.startsWith('/api/credit/')) {
      return Promise.resolve({ data: { success: true, messages: [] } })
    }
    return Promise.resolve({ data: { data: {} } })
  })
  api.post.mockResolvedValue({ data: { data: { success: true } } })
})

describe('the student in the grader header', () => {
  it('names their school beside their name', async () => {
    renderAt('/credit-dashboard')
    fireEvent.click(await screen.findByRole('button', { name: 'Start grading' }))
    await heading(0)
    const grader = screen.getByRole('region', { name: 'Credit grader' })
    expect(grader).toHaveTextContent('School: Hearthwood Academy')
  })

  it('says so when a platform student has no school', async () => {
    renderAt('/credit-dashboard')
    fireEvent.click(await screen.findByRole('button', { name: 'Start grading' }))
    await heading(0)
    fireEvent.keyDown(document.body, { key: 'j' })
    await heading(1)
    expect(screen.getByText('No school')).toBeInTheDocument()
  })
})

describe('to the profile and back', () => {
  it('opens the profile and Back reopens the same item with the note kept', async () => {
    renderAt('/credit-dashboard')
    fireEvent.click(await screen.findByRole('button', { name: 'Start grading' }))
    await heading(0)

    fireEvent.change(screen.getByPlaceholderText(/Feedback for student/),
                     { target: { value: 'Add the numbers.' } })
    fireEvent.click(screen.getByTitle("Open Student 0's profile"))

    expect(await screen.findByText('Overview of s0')).toBeInTheDocument()
    expect(screen.getByTestId('where').textContent)
      .toMatch(/^\/admin\/organizations\/org-1\/student\/s0\?returnTo=/)

    fireEvent.click(screen.getByRole('button', { name: /Back to grading/ }))

    await heading(0)
    expect(screen.getByRole('region', { name: 'Credit grader' })).toBeInTheDocument()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Feedback for student/)).toHaveValue('Add the numbers.')
  })

  it('a platform student opens the org-less profile route', async () => {
    renderAt('/credit-dashboard')
    fireEvent.click(await screen.findByRole('button', { name: 'Start grading' }))
    await heading(0)
    fireEvent.keyDown(document.body, { key: 'j' })
    await heading(1)
    fireEvent.click(screen.getByTitle("Open Student 1's profile"))

    expect(await screen.findByText('Overview of s1')).toBeInTheDocument()
    expect(screen.getByTestId('where').textContent).toMatch(/^\/admin\/students\/s1\?returnTo=/)
    // No org, so no school record to open.
    expect(screen.queryByRole('button', { name: 'Open school record' })).toBeNull()
  })

  it('restores the filters and page it left with', async () => {
    renderAt('/credit-dashboard?cr_status=any&cr_student=clare&cr_page=2&cr_item=c1')
    await heading(1)
    const params = itemsCalls()[0][1].params
    expect(params.page).toBe(2)
    expect(params.student).toBe('clare')
    // "any" is the reviewer's choice of no status filter, not the role default.
    expect(params.status).toBeUndefined()
  })
})

describe('the helpers', () => {
  it('builds the profile path from the org, or without one', () => {
    expect(studentProfilePath({ student_id: 's', organization_id: 'o' }))
      .toBe('/admin/organizations/o/student/s')
    expect(studentProfilePath({ student_id: 's', organization_id: null }))
      .toBe('/admin/students/s')
  })

  it('keeps other parameters on the URL, such as the org page tab', () => {
    const next = queueSearch(new URLSearchParams('tab=credit'), {
      filters: { status: '' }, page: 1, itemId: 'c9',
    })
    expect(next.get('tab')).toBe('credit')
    expect(next.get('cr_status')).toBe('any')
    expect(next.get('cr_item')).toBe('c9')
  })

  it('only honours an in-app return path', () => {
    expect(safeReturnTo('/credit-dashboard?cr_item=c1')).toBe('/credit-dashboard?cr_item=c1')
    expect(safeReturnTo('//evil.example')).toBeNull()
    expect(safeReturnTo('https://evil.example')).toBeNull()
    expect(safeReturnTo('/\\evil.example')).toBeNull()
    expect(safeReturnTo(null)).toBeNull()
  })
})
