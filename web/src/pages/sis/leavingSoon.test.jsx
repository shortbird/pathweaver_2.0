import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * "Leaving soon" on the coordinator and admin dashboards. Ticket 31e93fbb
 * (Katrine Myers, iCreate campus coordinator, 2026-09-24): "If there's a way
 * even Kate could get some kind of alert or something about each student
 * leaving at that hour? Something to alert someone instead of us having to
 * hunt for it."
 */

const COORDINATOR = { id: 'cc-1', role: 'org_managed', org_roles: ['campus_coordinator'], first_name: 'Kate' }
const ADMIN = { id: 'a-1', role: 'org_admin', first_name: 'Molly' }
let authState = { user: COORDINATOR }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({
    orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, loading: false,
    activeOrg: { id: 'org-1', feature_flags: { sis_enabled: true } },
  }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('./teacherPreview', () => ({ getPreviewTeacher: () => null, withPreview: (p) => p }))
vi.mock('./TeacherDashboard', () => ({ default: () => <div>Teacher dashboard</div> }))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })) },
}))
vi.mock('../../services/api', () => ({ default: api }))

import SisDashboard from './SisDashboard'
import LeavingSoon from '../../components/sis/LeavingSoon'

const SOON = [
  { name: 'Ada Lovelace', leaves_at: '11:30am' },
  { name: 'Bo Diddley', leaves_at: '11:45am' },
]

const coordinatorPayload = (leaving) => ({
  success: true,
  organization: { id: 'org-1', name: 'iCreate' },
  date: '2026-09-22',
  today_schedule: [],
  teachers_to_check: { no_roll: [], flagged: [] },
  leaving_soon: leaving,
  attendance: { recorded: {}, open_alerts: [], resolutions: [] },
  my_schedule: { today: [], upcoming: [] },
  my_tasks: [],
  quick_links: [],
  staff_resources: [],
  pinned_links: [],
})

const adminPayload = (leaving) => ({
  organization: { id: 'org-1', name: 'iCreate' },
  snapshot: { enrollment_status: {} },
  attention: {},
  today: { date: '2026-09-22', ...(leaving ? { leaving_soon: leaving } : {}) },
  events: [],
  settings: { hidden_modules: [] },
})

const renderAs = (user, leaving) => {
  authState = { user }
  api.get.mockImplementation((url) => {
    if (url.includes('/api/sis/coordinator/dashboard')) {
      return Promise.resolve({ data: coordinatorPayload(leaving) })
    }
    if (url.includes('/api/sis/dashboard')) {
      return Promise.resolve({ data: { success: true, data: adminPayload(leaving) } })
    }
    return Promise.resolve({ data: {} })
  })
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><SisDashboard /></MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => { vi.clearAllMocks() })

describe('Leaving soon', () => {
  it('names each child and their time on the coordinator dashboard', async () => {
    renderAs(COORDINATOR, SOON)
    const heading = await screen.findByText('Leaving soon (2)')
    const card = heading.closest('[data-leaving-soon]')
    expect(within(card).getByText('Ada Lovelace')).toBeInTheDocument()
    expect(within(card).getByText('11:30am')).toBeInTheDocument()
    expect(within(card).getByText('Bo Diddley')).toBeInTheDocument()
  })

  it('draws nothing on the coordinator dashboard when nobody is leaving soon', async () => {
    renderAs(COORDINATOR, [])
    await screen.findByText(/Good morning, Kate/)
    expect(screen.queryByText(/Leaving soon/)).not.toBeInTheDocument()
  })

  it('names each child and their time on the admin dashboard', async () => {
    renderAs(ADMIN, SOON)
    const heading = await screen.findByText('Leaving soon (2)')
    const card = heading.closest('[data-leaving-soon]')
    expect(within(card).getByText('Bo Diddley')).toBeInTheDocument()
    expect(within(card).getByText('11:45am')).toBeInTheDocument()
  })

  it('draws nothing on the admin dashboard when the key is absent', async () => {
    renderAs(ADMIN, undefined)
    await screen.findByText('School Dashboard')
    await screen.findByText(/iCreate/)
    expect(screen.queryByText(/Leaving soon/)).not.toBeInTheDocument()
  })

  it('renders nothing for an empty or missing list', () => {
    const { container, rerender } = render(<LeavingSoon students={[]} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<LeavingSoon />)
    expect(container).toBeEmptyDOMElement()
  })
})
