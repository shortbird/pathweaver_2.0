import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('./useSisOrg', async (importOriginal) => ({
  ...(await importOriginal()),
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, loading: false, activeOrg: null }),
}))

const { api, state } = vi.hoisted(() => {
  const state = {
    dashboard: { today: [], classes: [], profile: {}, recent_forms: [], pending_acks: [] },
    announcements: [],
  }
  const apiData = (url) => {
    if (url.includes('/engagement-alerts')) return { data: { success: true, alerts: [] } }
    if (url.includes('/teacher/dashboard')) return { data: { data: state.dashboard } }
    if (url.includes('/api/announcements/archive')) return { data: { success: true, announcements: state.announcements } }
    return { data: {} }
  }
  return {
    state,
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: { success: true } })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import TeacherDashboard from './TeacherDashboard'

const announcement = (n) => ({
  id: `a${n}`, title: `Notice ${n}`, content: `Body of notice ${n}`,
  created_at: '2026-08-29T15:00:00Z', target_audience: 'advisors',
})

beforeEach(() => {
  state.dashboard = { today: [], classes: [], profile: {}, recent_forms: [], pending_acks: [] }
  state.announcements = []
  vi.clearAllMocks()
})

// iCreate, 2026-08-29: "could we have announcements for teachers show up in a
// different place than announcements for families? Like could it show in their
// teacher portal". The archive endpoint already narrows to what was sent to
// the caller; this is the page that finally shows it to a teacher.
describe('TeacherDashboard — announcements from the office', () => {
  it('reads the archive for the org and lists what was sent to this teacher', async () => {
    state.announcements = [announcement(1), announcement(2)]
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)

    expect(await screen.findByText('Announcements')).toBeInTheDocument()
    expect(screen.getByText('Notice 1')).toBeInTheDocument()
    expect(screen.getByText('Body of notice 2')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/announcements/archive?limit=20&organization_id=org-1')
  })

  it('shows nothing at all when the office has sent nothing', async () => {
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)

    expect(await screen.findByText('Today')).toBeInTheDocument()
    expect(screen.queryByText('Announcements')).not.toBeInTheDocument()
  })

  it('keeps the card short: three at a time, the rest behind Show all', async () => {
    state.announcements = [1, 2, 3, 4, 5].map(announcement)
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)

    expect(await screen.findByText('Notice 1')).toBeInTheDocument()
    expect(screen.getByText('Notice 3')).toBeInTheDocument()
    expect(screen.queryByText('Notice 4')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show all (5)' }))
    expect(screen.getByText('Notice 5')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(screen.queryByText('Notice 5')).not.toBeInTheDocument()
  })
})
