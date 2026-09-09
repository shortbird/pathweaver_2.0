import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SuperadminHome, { countSignupsThisWeek } from './SuperadminHome'
import api from '../../services/api'

let authState = {}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('../../services/api', () => ({
  default: { get: vi.fn() }
}))

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS).toISOString()

const usersPayload = {
  success: true,
  total: 1234,
  users: [
    { id: 'u1', created_at: daysAgo(1) },
    { id: 'u2', created_at: daysAgo(3) },
    { id: 'u3', created_at: daysAgo(20) }, // outside the week window
  ],
}

const orgsPayload = {
  organizations: [
    { id: 'o1', name: 'Alpha', is_active: true },
    { id: 'o2', name: 'Beta' }, // missing flag counts as active
    { id: 'o3', name: 'Gone', is_active: false },
  ],
}

const creditStatsPayload = {
  success: true,
  data: { pending_org_approval: 2, pending_review: 7, finalized: 40, merged_this_week: 1 },
}

const flaggedPayload = { success: true, tasks: [{ id: 't1' }], count: 5 }

const today = new Date().toISOString().slice(0, 10)
const aiCostsPayload = {
  period_days: 30,
  trends: [{ date: today, cost_usd: 0.0042, requests: 9, tokens: 4500 }],
}

function mockHappyApi() {
  api.get.mockImplementation((url) => {
    if (url === '/api/admin/users') return Promise.resolve({ data: usersPayload })
    if (url === '/api/admin/organizations') return Promise.resolve({ data: orgsPayload })
    if (url === '/api/credit-dashboard/stats') return Promise.resolve({ data: creditStatsPayload })
    if (url === '/api/admin/flagged-tasks') return Promise.resolve({ data: flaggedPayload })
    if (url === '/api/admin/ai/costs/trends') return Promise.resolve({ data: aiCostsPayload })
    return Promise.reject(new Error(`Unexpected GET ${url}`))
  })
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <SuperadminHome />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SuperadminHome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: { id: 'sa-1', first_name: 'Tanner' } }
  })

  it('greets the superadmin and shows the doors with correct links', () => {
    mockHappyApi()
    renderPage()

    expect(screen.getByRole('heading', { name: /welcome back, tanner/i })).toBeInTheDocument()
    expect(screen.getByText('Admin Panel').closest('a')).toHaveAttribute('href', '/admin')
    expect(screen.getByText('Credit Review').closest('a')).toHaveAttribute('href', '/credit-dashboard')
    expect(screen.getByText('Family Dashboard').closest('a')).toHaveAttribute('href', '/parent/dashboard')
    expect(screen.getByText('School Preview').closest('a')).toHaveAttribute('href', '/school')
  })

  it('renders the platform pulse from mocked admin endpoints', async () => {
    mockHappyApi()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Total users')).toBeInTheDocument()
    })

    expect(screen.getByText('Total users').closest('a')).toHaveTextContent('1,234')
    expect(screen.getByText('Signups this week').closest('a')).toHaveTextContent('2')
    expect(screen.getByText('Active organizations').closest('a')).toHaveTextContent('2')
    expect(screen.getByText('Pending credit review').closest('a')).toHaveTextContent('7')
    expect(screen.getByText('Flagged tasks').closest('a')).toHaveTextContent('5')
  })

  it('deep-links each stat tile into the acting surface', async () => {
    mockHappyApi()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Total users')).toBeInTheDocument()
    })

    expect(screen.getByText('Total users').closest('a')).toHaveAttribute('href', '/admin/users')
    expect(screen.getByText('Signups this week').closest('a')).toHaveAttribute('href', '/admin/users')
    expect(screen.getByText('Active organizations').closest('a')).toHaveAttribute('href', '/admin/organizations')
    expect(screen.getByText('Pending credit review').closest('a')).toHaveAttribute('href', '/credit-dashboard')
    expect(screen.getByText('Flagged tasks').closest('a')).toHaveAttribute('href', '/admin/flagged-tasks')
  })

  it('degrades silently when every endpoint fails', async () => {
    api.get.mockRejectedValue(new Error('API down'))
    renderPage()

    await waitFor(() => {
      expect(screen.queryByTestId('home-stat-skeleton')).not.toBeInTheDocument()
    })

    expect(screen.queryByText('Total users')).not.toBeInTheDocument()
    expect(screen.queryByText(/error|failed|wrong/i)).not.toBeInTheDocument()

    // Never a blank error wall: greeting + doors remain
    expect(screen.getByRole('heading', { name: /welcome back, tanner/i })).toBeInTheDocument()
    expect(screen.getByText('Admin Panel')).toBeInTheDocument()
  })

  it('keeps healthy tiles when only some endpoints fail', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/credit-dashboard/stats') {
        return Promise.resolve({ data: creditStatsPayload })
      }
      return Promise.reject(new Error('down'))
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Pending credit review')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.queryByTestId('home-stat-skeleton')).not.toBeInTheDocument()
    })

    expect(screen.getByText('Pending credit review').closest('a')).toHaveTextContent('7')
    expect(screen.queryByText('Total users')).not.toBeInTheDocument()
    expect(screen.queryByText('Flagged tasks')).not.toBeInTheDocument()
  })

  it('shows the AI cost chart with the period total', async () => {
    mockHappyApi()
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /ai api cost/i })).toBeInTheDocument()
    })
    // Sub-cent precision: $0.01 would round the real figure away.
    expect(await screen.findByText('$0.0042')).toBeInTheDocument()
    expect(screen.getByText(/9 logged calls over 30 days/i)).toBeInTheDocument()
    // The coverage caveat must ship with the number, not be optional chrome.
    expect(screen.getByText(/undercount/i)).toBeInTheDocument()
  })

  it('hides the cost chart rather than erroring when the endpoint fails', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/admin/ai/costs/trends') return Promise.reject(new Error('boom'))
      if (url === '/api/admin/users') return Promise.resolve({ data: usersPayload })
      if (url === '/api/admin/organizations') return Promise.resolve({ data: orgsPayload })
      if (url === '/api/credit-dashboard/stats') return Promise.resolve({ data: creditStatsPayload })
      if (url === '/api/admin/flagged-tasks') return Promise.resolve({ data: flaggedPayload })
      return Promise.reject(new Error(`Unexpected GET ${url}`))
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Total users')).toBeInTheDocument()
    })
    expect(screen.queryByRole('region', { name: /ai api cost/i })).not.toBeInTheDocument()
  })
})

describe('countSignupsThisWeek', () => {
  it('counts only users created in the last 7 days', () => {
    expect(countSignupsThisWeek(usersPayload.users, usersPayload.total)).toBe(2)
  })

  it('reports a floor ("N+") when the whole page is inside the window', () => {
    const users = Array.from({ length: 100 }, (_, i) => ({ id: `u${i}`, created_at: daysAgo(1) }))
    expect(countSignupsThisWeek(users, 5000)).toBe('100+')
  })

  it('returns null (hidden tile) without data', () => {
    expect(countSignupsThisWeek(undefined, undefined)).toBeNull()
  })
})
