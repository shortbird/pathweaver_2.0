import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen } from '@testing-library/react'
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
  }
  const apiData = (url) => {
    if (url.includes('/engagement-alerts')) return { data: { success: true, alerts: [] } }
    if (url.includes('/teacher/dashboard')) return { data: { data: state.dashboard } }
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

beforeEach(() => {
  state.dashboard = { today: [], classes: [], profile: {}, recent_forms: [], pending_acks: [] }
  vi.clearAllMocks()
})

describe('TeacherDashboard — pinned Links section', () => {
  it('renders pinned links as named hyperlinks above My classes', async () => {
    state.dashboard.pinned_links = [
      { id: 'l1', title: 'Field Trip Form', url: 'https://example.com/form', description: 'Permission slip' },
      { id: 'l2', title: 'Staff Handbook', url: 'https://example.com/handbook' },
    ]
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)

    expect(await screen.findByText('Links')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Field Trip Form' })
    expect(link).toHaveAttribute('href', 'https://example.com/form')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'Staff Handbook' })).toBeInTheDocument()

    // Order on the page: Links, then My classes (the Today card is gone —
    // iCreate 2026-08-31).
    const titles = ['Links', 'My classes'].map((t) => screen.getByText(t))
    expect(titles[0].compareDocumentPosition(titles[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
  })

  it('shows no Links card when the org pinned nothing', async () => {
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)
    expect(await screen.findByText('My classes')).toBeInTheDocument()
    expect(screen.queryByText('Links')).not.toBeInTheDocument()
  })
})
