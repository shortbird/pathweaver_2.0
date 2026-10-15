/**
 * What the School Dashboard took over from the organization console
 * (2026-10-15: every org is an SIS org, and the console is being retired).
 *
 *   - the credit requests waiting on the school, as a queue tile that opens
 *     /credit-review;
 *   - the Getting started checklist, whose steps open SIS pages;
 *   - a credit-class partner's classes (the card renders nothing for a school
 *     that sells none).
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SisDashboard from './SisDashboard'

const { api, orgState } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  orgState: { activeOrg: { id: 'org-1', feature_flags: {} } },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'a-1', role: 'org_admin', first_name: 'Ada' } }),
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', loading: false, activeOrg: orgState.activeOrg }),
  withOrg: (url) => url,
}))
vi.mock('./teacherPreview', () => ({ getPreviewTeacher: () => null, withPreview: (p) => p }))
vi.mock('./TeacherDashboard', () => ({ default: () => <div>Teacher dashboard</div> }))
vi.mock('./CoordinatorDashboard', () => ({ default: () => <div>Coordinator dashboard</div> }))

const DASHBOARD = {
  organization: { id: 'org-1', name: 'Gryffin' },
  snapshot: { total_students: 3 },
  attention: {},
  today: { date: '2026-10-15' },
  events: [],
  settings: { hidden_modules: [] },
}
const SETUP = { teachers: 1, students: 0, parents: 0, parent_links: 0, classes: 0, class_quests: 0 }
const OFFERING = {
  id: 'off-1', title: 'Critical Thinking', subject_name: 'Language Arts',
  link: 'https://app.optioeducation.com/offer/x', students: [],
}

const Where = () => <output data-testid="where">{useLocation().pathname + useLocation().search}</output>

const mount = ({ attention = {}, setup = SETUP, offerings = [] } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/api/sis/dashboard')) {
      return Promise.resolve({ data: { data: { ...DASHBOARD, attention } } })
    }
    if (url.endsWith('/setup-status')) return Promise.resolve({ data: { success: true, counts: setup } })
    if (url.endsWith('/partner-offerings')) return Promise.resolve({ data: { offerings } })
    return Promise.resolve({ data: {} })
  })
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/']}>
        <Routes><Route path="*" element={<><SisDashboard /><Where /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  orgState.activeOrg = { id: 'org-1', feature_flags: {} }
})

describe('credit requests waiting on the school', () => {
  it('draws a tile that opens Credit Review', async () => {
    mount({ attention: { credits_to_approve: 222 } })
    const tile = await screen.findByRole('link', { name: /222\s*Credit requests to approve/ })
    expect(tile).toHaveAttribute('href', '/credit-review')
  })

  it('draws nothing when the backend sent no count', async () => {
    mount()
    await screen.findByText('School Dashboard')
    await screen.findByText(/All caught up/)
    expect(screen.queryByText('Credit requests to approve')).toBeNull()
  })
})

describe('Getting started', () => {
  it('shows the steps left, and a step opens its SIS page', async () => {
    mount()
    expect(await screen.findByText('Getting Started')).toBeInTheDocument()
    expect(screen.getByText(/1 of 5 steps done/)).toBeInTheDocument()
    await userEvent.click(screen.getByText('Add your students'))
    expect(screen.getByTestId('where').textContent).toBe('/people?add=roster')
  })

  it('the class steps open the class catalog and the Library quests', async () => {
    mount({ setup: { ...SETUP, students: 2, parents: 1 } })
    await userEvent.click(await screen.findByText('Create your first class'))
    expect(screen.getByTestId('where').textContent).toBe('/classes?tab=all')
    await userEvent.click(screen.getByText('Assign a quest'))
    expect(screen.getByTestId('where').textContent).toBe('/library?tab=quests')
  })

  it('a school with classes off is not asked to create a class', async () => {
    orgState.activeOrg = { id: 'org-1', effective_modules: ['sis', 'curriculum'] }
    mount()
    expect(await screen.findByText(/1 of 3 steps done/)).toBeInTheDocument()
    expect(screen.queryByText('Create your first class')).toBeNull()
  })

  it('is gone once every step is done', async () => {
    mount({ setup: { teachers: 1, students: 1, parents: 1, parent_links: 1, classes: 1, class_quests: 1 } })
    await screen.findByText(/All caught up/)
    expect(screen.queryByText('Getting Started')).toBeNull()
  })
})

describe("a partner's classes", () => {
  it('shows each class the school sells', async () => {
    mount({ offerings: [OFFERING] })
    expect(await screen.findByRole('heading', { name: 'Critical Thinking' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/admin/organizations/org-1/partner-offerings')
  })

  it('draws nothing for a school that sells none', async () => {
    mount()
    await screen.findByText(/All caught up/)
    expect(screen.queryByText('Link for your buyers')).toBeNull()
  })
})
