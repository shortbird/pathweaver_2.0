import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let authState = { user: null, logout: vi.fn(), isAuthenticated: true }

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState,
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

  it('shows Credit Review link for org_admin', () => {
    authState.user = {
      id: 'u1',
      role: 'org_managed',
      org_role: 'org_admin',
      organization_id: 'org-1',
      email: 't@example.com',
    }
    renderSidebar()
    expect(
      screen.getByRole('link', { name: /credit review/i }),
    ).toBeInTheDocument()
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
