import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SchoolShell from './SchoolShell'

/**
 * A family's own volunteer hours on its School page.
 *
 * iCreate 01082b30: "Could we make a way for parents to be able to see how
 * many volunteer hours they have completed? We can keep it updated, but ...
 * keep it private so not everyone sees everyone elses."
 *
 * The line sits under the letterhead on every school tab, for a guardian only,
 * and only when the server says the school uses it (this family has hours, or
 * the school has entered hours for any family).
 */

let authState = { user: { id: 'p1', role: 'parent' }, effectiveRole: 'parent' }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ school: { id: 'org-1', name: 'iCreate', homepage: true } }),
}))
vi.mock('../../contexts/FamilyScopeContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useFamilyScope: () => ({ selectedChild: null, selectedChildId: null, enterScope: vi.fn() }),
}))
vi.mock('framer-motion', () => ({ motion: { span: (p) => <span {...p} /> } }))

const ORG = {
  organization_id: 'org-1', organization_name: 'iCreate', logo_url: null,
  is_guardian: true, post_registration_flow: 'schedule',
  students: [{ student_id: 'dax', name: 'Daxton' }],
}
let memberOrg = ORG
let hoursResponse = { data: { success: true, volunteer_hours: 12.5, updated_at: null, shown: true } }

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))


function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/school-calendar']}>
        <Routes>
          <Route element={<SchoolShell />}>
            <Route path="/school-calendar" element={<div>calendar</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const hoursCalls = () => api.get.mock.calls.filter(([u]) => u.includes('/volunteer-hours'))

beforeEach(() => {
  vi.clearAllMocks()
  authState = { user: { id: 'p1', role: 'parent' }, effectiveRole: 'parent' }
  memberOrg = ORG
  hoursResponse = { data: { success: true, volunteer_hours: 12.5, updated_at: null, shown: true } }
  api.get.mockImplementation((url) => {
    if (url === '/api/sis/school/context') return Promise.resolve({ data: { success: true, orgs: [memberOrg] } })
    if (url === '/api/sis/parent/context') return Promise.resolve({ data: { orgs: [memberOrg] } })
    if (url.startsWith('/api/sis/parent/volunteer-hours')) {
      return hoursResponse instanceof Error ? Promise.reject(hoursResponse) : Promise.resolve(hoursResponse)
    }
    return Promise.resolve({ data: {} })
  })
})

describe('volunteer hours on the School page (iCreate 01082b30)', () => {
  it("shows a guardian their own family's hours", async () => {
    renderShell()
    const line = await screen.findByTestId('family-volunteer-hours')
    expect(line).toHaveTextContent('Volunteer hours')
    expect(line).toHaveTextContent('12.5')
    expect(hoursCalls()[0][0]).toBe('/api/sis/parent/volunteer-hours?organization_id=org-1')
  })

  it('shows 0 when the school tracks hours and this family has none yet', async () => {
    hoursResponse = { data: { success: true, volunteer_hours: 0, updated_at: null, shown: true } }
    renderShell()
    expect(await screen.findByTestId('family-volunteer-hours')).toHaveTextContent('0')
  })

  it('shows nothing at a school that does not use volunteer hours', async () => {
    hoursResponse = { data: { success: true, volunteer_hours: 0, updated_at: null, shown: false } }
    renderShell()
    await waitFor(() => expect(hoursCalls().length).toBe(1))
    expect(screen.queryByTestId('family-volunteer-hours')).not.toBeInTheDocument()
  })

  it('shows nothing when the read fails (404 for a non-guardian)', async () => {
    hoursResponse = Object.assign(new Error('404'), { response: { status: 404 } })
    renderShell()
    await waitFor(() => expect(hoursCalls().length).toBe(1))
    expect(screen.queryByTestId('family-volunteer-hours')).not.toBeInTheDocument()
  })

  it('never asks for hours for a member who guards nobody', async () => {
    authState = { user: { id: 's1', role: 'student' }, effectiveRole: 'student' }
    memberOrg = { ...ORG, is_guardian: false, students: [] }
    renderShell()
    await screen.findByText('calendar')
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(hoursCalls()).toHaveLength(0)
    expect(screen.queryByTestId('family-volunteer-hours')).not.toBeInTheDocument()
  })
})
