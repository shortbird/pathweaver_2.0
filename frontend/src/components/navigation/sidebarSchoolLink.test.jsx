import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The school item in the main sidebar.
 *
 * Members get it named after their school (resolved through membership).
 * Superadmins are in no school, but they need a door to the school-page
 * preview (/school with the org dropdown) — so they get the same item as
 * "School Pages". Everyone else still never sees it.
 */

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

describe('Sidebar — school page link', () => {
  beforeEach(() => {
    authState = { user: null, logout: vi.fn(), isAuthenticated: true }
    orgState = { organization: null }
  })

  it('gives a superadmin "School Pages" pointing at the preview', () => {
    authState.user = { id: 'sa-1', role: 'superadmin', email: 't@example.com' }
    renderSidebar()
    const link = screen.getByRole('link', { name: /school pages/i })
    expect(link).toHaveAttribute('href', '/school')
  })

  it('still names the item after the school for a member', () => {
    authState.user = { id: 'u1', role: 'parent', email: 'p@example.com' }
    orgState = { organization: null, school: { id: 'org-1', name: 'iCreate' } }
    renderSidebar()
    expect(screen.getByRole('link', { name: 'iCreate' })).toHaveAttribute('href', '/school')
  })

  it('shows nothing to someone in no school', () => {
    authState.user = { id: 'u1', role: 'student', email: 's@example.com' }
    renderSidebar()
    expect(screen.queryByRole('link', { name: /school/i })).not.toBeInTheDocument()
  })
})
