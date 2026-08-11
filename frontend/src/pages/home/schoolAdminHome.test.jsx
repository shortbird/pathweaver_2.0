import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SchoolAdminHome from './SchoolAdminHome'
import api from '../../services/api'

let authState = {}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('../../services/api', () => ({
  default: { get: vi.fn() }
}))

const ORG_ID = 'org-123'

const orgPayload = {
  organization: { id: ORG_ID, name: 'Test School' },
  users: [
    { id: 'u1', org_role: 'student' },
    { id: 'u2', org_role: 'student' },
    { id: 'u3', org_role: 'student' },
    // Multi-role user: advisor via org_roles array
    { id: 'u4', org_role: 'parent', org_roles: ['advisor', 'parent'] },
    { id: 'u5', org_role: 'advisor' },
    { id: 'u6', org_role: 'org_admin' },
  ],
}

const classesPayload = {
  success: true,
  classes: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
}

const creditStatsPayload = {
  success: true,
  data: { pending_org_approval: 4, pending_review: 9, finalized: 12, merged_this_week: 0 },
}

function mockHappyApi() {
  api.get.mockImplementation((url) => {
    if (url === `/api/admin/organizations/${ORG_ID}`) {
      return Promise.resolve({ data: orgPayload })
    }
    if (url === `/api/organizations/${ORG_ID}/classes`) {
      return Promise.resolve({ data: classesPayload })
    }
    if (url === '/api/credit-dashboard/stats') {
      return Promise.resolve({ data: creditStatsPayload })
    }
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
        <SchoolAdminHome />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SchoolAdminHome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = {
      user: { id: 'admin-1', first_name: 'Dana', organization_id: ORG_ID }
    }
  })

  it('greets the admin and shows the doors', async () => {
    mockHappyApi()
    renderPage()

    expect(screen.getByRole('heading', { name: /welcome back, dana/i })).toBeInTheDocument()
    expect(screen.getByText('Organization Console')).toBeInTheDocument()
    expect(screen.getByText('Classes')).toBeInTheDocument()
    expect(screen.getByText('People')).toBeInTheDocument()
    expect(screen.getByText('Announcements')).toBeInTheDocument()

    expect(screen.getByText('Organization Console').closest('a')).toHaveAttribute('href', '/organization')
    expect(screen.getByText('Classes').closest('a')).toHaveAttribute('href', '/org-classes')
    expect(screen.getByText('People').closest('a')).toHaveAttribute('href', '/organization?tab=people')
    expect(screen.getByText('Announcements').closest('a')).toHaveAttribute('href', '/school')
  })

  it('renders snapshot stats from the console endpoints', async () => {
    mockHappyApi()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Students')).toBeInTheDocument()
    })

    // 3 students; 2 teachers (org_role advisor + org_roles containing advisor)
    expect(screen.getByText('Students').closest('a')).toHaveTextContent('3')
    expect(screen.getByText('Teachers').closest('a')).toHaveTextContent('2')
    expect(screen.getByText('Active classes').closest('a')).toHaveTextContent('3')
    expect(screen.getByText('Awaiting credit review').closest('a')).toHaveTextContent('4')
  })

  it('deep-links each stat tile into the console', async () => {
    mockHappyApi()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Students')).toBeInTheDocument()
    })

    expect(screen.getByText('Students').closest('a')).toHaveAttribute('href', '/organization?tab=people')
    expect(screen.getByText('Teachers').closest('a')).toHaveAttribute('href', '/organization?tab=people')
    expect(screen.getByText('Active classes').closest('a')).toHaveAttribute('href', '/org-classes')
    expect(screen.getByText('Awaiting credit review').closest('a')).toHaveAttribute('href', '/organization?tab=credit-review')
  })

  it('degrades silently when every stat source fails', async () => {
    api.get.mockRejectedValue(new Error('API down'))
    renderPage()

    // Skeletons appear while loading, then the whole stats section disappears
    await waitFor(() => {
      expect(screen.queryByTestId('home-stat-skeleton')).not.toBeInTheDocument()
    })

    expect(screen.queryByText('Students')).not.toBeInTheDocument()
    expect(screen.queryByText(/error|failed|wrong/i)).not.toBeInTheDocument()

    // The page is still useful: greeting + doors
    expect(screen.getByRole('heading', { name: /welcome back, dana/i })).toBeInTheDocument()
    expect(screen.getByText('Organization Console')).toBeInTheDocument()
  })

  it('keeps a failed source hidden while healthy sources still render', async () => {
    api.get.mockImplementation((url) => {
      if (url === `/api/organizations/${ORG_ID}/classes`) {
        return Promise.resolve({ data: classesPayload })
      }
      return Promise.reject(new Error('down'))
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Active classes')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.queryByTestId('home-stat-skeleton')).not.toBeInTheDocument()
    })

    expect(screen.getByText('Active classes').closest('a')).toHaveTextContent('3')
    expect(screen.queryByText('Students')).not.toBeInTheDocument()
    expect(screen.queryByText('Awaiting credit review')).not.toBeInTheDocument()
  })

  it('shows no stats section without an organization id, but keeps the doors', () => {
    authState = { user: { id: 'admin-1', first_name: 'Dana' } }
    api.get.mockRejectedValue(new Error('should not be called'))
    renderPage()

    expect(api.get).not.toHaveBeenCalled()
    expect(screen.queryByTestId('home-stat-skeleton')).not.toBeInTheDocument()
    expect(screen.getByText('Organization Console')).toBeInTheDocument()
  })
})
