import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Which class is waiting, without opening every class.
 *
 * Gryffin Learning Center, 2026-08-31: "I would love to get an email
 * notification if a student sends me a message... Right now, I don't think I
 * see it unless I look at specific students individually." The unread counts
 * existed inside a class's Messages tab; nothing on the way there said which
 * class to open.
 */

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
    dashboard: {
      today: [], profile: {}, recent_forms: [], pending_acks: [],
      classes: [
        { id: 'c1', name: 'Geometry', enrolled_count: 8 },
        { id: 'c2', name: 'Biology', enrolled_count: 5 },
      ],
    },
    groups: [],
  }
  const apiData = (url) => {
    if (url.includes('/engagement-alerts')) return { data: { success: true, alerts: [] } }
    if (url.includes('/teacher/dashboard')) return { data: { data: state.dashboard } }
    if (url.includes('/api/groups')) return { data: { groups: state.groups } }
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
  state.groups = []
  vi.clearAllMocks()
})

describe('TeacherDashboard — unread class messages', () => {
  it('badges the class with unread messages, and only that class', async () => {
    state.groups = [
      { id: 'g1', source_class_id: 'c1', unread_count: 3 },
      { id: 'g2', source_class_id: 'c2', unread_count: 0 },
    ]
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)

    await screen.findByText('Geometry')
    const badge = await screen.findByLabelText('3 unread')
    expect(badge).toHaveTextContent('3')
    expect(screen.queryByLabelText('0 unread')).not.toBeInTheDocument()
  })

  it('sums the parent chat and the student chat for one class', async () => {
    // Two chats per class since 2026-08-31. Keying by class would have shown
    // whichever came back last instead of everything waiting.
    state.groups = [
      { id: 'g1', source_class_id: 'c1', unread_count: 2 },
      { id: 'g2', source_class_id: 'c1', unread_count: 4 },
    ]
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)

    expect(await screen.findByLabelText('6 unread')).toBeInTheDocument()
  })

  it('shows no badge when nothing is unread', async () => {
    state.groups = [{ id: 'g1', source_class_id: 'c1', unread_count: 0 }]
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)

    await screen.findByText('Geometry')
    expect(screen.queryByLabelText(/unread/)).not.toBeInTheDocument()
  })

  it('does not ask for groups while previewing another teacher', async () => {
    // /api/groups answers for whoever is signed in, so an admin previewing a
    // teacher would see their own unread counts on that teacher's classes.
    state.groups = [{ id: 'g1', source_class_id: 'c1', unread_count: 3 }]
    render(<TeacherDashboard orgId="org-1" userName="Jess" preview={{ id: 't1', name: 'Ana' }} />)

    await screen.findByText('Geometry')
    await waitFor(() =>
      expect(api.get.mock.calls.some(([u]) => u.includes('/api/groups'))).toBe(false)
    )
    expect(screen.queryByLabelText(/unread/)).not.toBeInTheDocument()
  })

  it('renders the cards normally when the groups call fails', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/api/groups')) return Promise.reject(new Error('boom'))
      if (url.includes('/engagement-alerts')) return Promise.resolve({ data: { success: true, alerts: [] } })
      if (url.includes('/teacher/dashboard')) return Promise.resolve({ data: { data: state.dashboard } })
      return Promise.resolve({ data: {} })
    })
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)

    expect(await screen.findByText('Geometry')).toBeInTheDocument()
    expect(screen.queryByLabelText(/unread/)).not.toBeInTheDocument()
  })
})
