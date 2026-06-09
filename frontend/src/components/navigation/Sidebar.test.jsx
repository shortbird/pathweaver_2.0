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

  it('shows the OpenEd Academy tab for members of the oea org', () => {
    authState.user = { id: 'u1', role: 'org_managed', org_role: 'student', organization_id: 'org-oea', email: 's@example.com' }
    orgState = { organization: { id: 'org-oea', slug: 'oea', name: 'OpenEd Academy' } }
    renderSidebar()
    const link = screen.getByRole('link', { name: /openEd academy/i })
    expect(link).toHaveAttribute('href', '/opened-academy')
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
