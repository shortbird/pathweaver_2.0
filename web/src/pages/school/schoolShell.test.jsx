import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// The school as one page: letterhead, a tab rail that IS the family catalog,
// one student picker that is family scope, and a panel per URL.

let authState = { user: { id: 'p1', role: 'parent' }, effectiveRole: 'parent' }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))

let orgState = { school: { id: 'org-1', name: 'iCreate', homepage: true } }
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))

const enterScope = vi.fn()
let scopeState = { selectedChild: null, selectedChildId: null, enterScope }
vi.mock('../../contexts/FamilyScopeContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useFamilyScope: () => scopeState,
}))

const GUARDIAN_ORG = {
  organization_id: 'org-1', organization_name: 'iCreate', logo_url: null,
  is_guardian: true, post_registration_flow: 'schedule',
  students: [{ student_id: 'dax', name: 'Daxton' }, { student_id: 'riv', name: 'Rivers' }],
}
let memberContext = { success: true, orgs: [GUARDIAN_ORG] }
let parentContext = { orgs: [GUARDIAN_ORG] }
vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn((url) => Promise.resolve(
      url === '/api/sis/school/context' ? { data: memberContext }
        : url === '/api/sis/parent/context' ? { data: parentContext }
          : { data: {} })),
  },
}))

vi.mock('framer-motion', () => ({ motion: { span: (p) => <span {...p} /> } }))

import SchoolShell from './SchoolShell'

const Where = () => <div data-testid="where">{useLocation().pathname}</div>

function renderAt(path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<SchoolShell />}>
            <Route path="/school" element={<Where />} />
            <Route path="/announcements" element={<Where />} />
            <Route path="/school-calendar" element={<Where />} />
            <Route path="/schedule-builder" element={<Where />} />
            <Route path="/absences" element={<Where />} />
            <Route path="/family/billing" element={<Where />} />
            <Route path="/family/forms" element={<Where />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  authState = { user: { id: 'p1', role: 'parent' }, effectiveRole: 'parent' }
  orgState = { school: { id: 'org-1', name: 'iCreate', homepage: true } }
  scopeState = { selectedChild: null, selectedChildId: null, enterScope }
  memberContext = { success: true, orgs: [GUARDIAN_ORG] }
  parentContext = { orgs: [GUARDIAN_ORG] }
})

describe('SchoolShell', () => {
  it('shows the letterhead, the family tabs, and the panel for the URL', async () => {
    renderAt('/family/billing')
    expect(screen.getByRole('heading', { level: 1, name: 'iCreate' })).toBeInTheDocument()
    const rail = await screen.findByRole('tablist', { name: 'School' })
    const labels = Array.from(rail.querySelectorAll('[role=tab]')).map((t) => t.textContent)
    expect(labels).toEqual(['Feed', 'Calendar', 'Schedule', 'Absences', 'Billing', 'Forms'])
    expect(screen.getByRole('tab', { name: 'Billing' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('where')).toHaveTextContent('/family/billing')
  })

  it('a tab is a URL: clicking one navigates, and the old /announcements alias lights the feed', async () => {
    renderAt('/announcements')
    expect(await screen.findByRole('tab', { name: 'Feed' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'Absences' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/absences'))
    expect(screen.getByRole('tab', { name: 'Absences' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows one student picker on a per-child tab, and it sets family scope', async () => {
    renderAt('/schedule-builder')
    const students = await screen.findByRole('tablist', { name: 'Students' })
    expect(students).toBeInTheDocument()
    // Unscoped: the first child is shown active, which is what the panel defaults to.
    expect(screen.getByRole('tab', { name: 'Daxton' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'Rivers' }))
    expect(enterScope).toHaveBeenCalledWith('riv')
  })

  it('keeps the student picker off tabs that are not one child\'s', async () => {
    renderAt('/absences')
    await screen.findByRole('tablist', { name: 'School' })
    expect(screen.queryByRole('tablist', { name: 'Students' })).not.toBeInTheDocument()
    renderAt('/family/billing')
    expect(screen.queryByRole('tablist', { name: 'Students' })).not.toBeInTheDocument()
  })

  it('a member who guards nobody gets the letterhead and no rail', async () => {
    memberContext = { success: true, orgs: [{ ...GUARDIAN_ORG, is_guardian: false }] }
    parentContext = { orgs: [] }
    renderAt('/school')
    expect(screen.getByRole('heading', { level: 1, name: 'iCreate' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/school'))
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('stays out of the way of a superadmin, who belongs to no school', () => {
    authState = { user: { id: 'sa', role: 'superadmin' }, effectiveRole: 'superadmin' }
    orgState = { school: null }
    renderAt('/school')
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/school')
  })
})
