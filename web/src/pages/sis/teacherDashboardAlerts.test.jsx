import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

// Keep the real withOrg (appends ?organization_id); only stub the hook so the
// dashboard doesn't need the org-list fetch / contexts.
vi.mock('./useSisOrg', async (importOriginal) => ({
  ...(await importOriginal()),
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, loading: false, activeOrg: null }),
}))

const { api, apiData, state } = vi.hoisted(() => {
  const state = {
    dashboard: { today: [], classes: [], profile: {}, recent_forms: [], pending_acks: [] },
    alerts: [],
  }
  const apiData = (url) => {
    if (url.includes('/engagement-alerts')) return { data: { success: true, alerts: state.alerts } }
    if (url.includes('/teacher/dashboard')) return { data: { data: state.dashboard } }
    return { data: {} }
  }
  return {
    state,
    apiData,
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
  state.alerts = [
    {
      id: 'a1',
      alert_type: 'inactive_two_weeks',
      student_name: 'Robin Fields',
      class_name: 'Pottery',
      quest_title: 'Glaze Basics',
      details: { days_threshold: 14 },
      created_at: '2026-07-20T12:00:00Z',
    },
    {
      id: 'a2',
      alert_type: 'unfinished_next_released',
      student_name: 'Ada Stone',
      class_name: 'Robotics',
      quest_title: 'Motors 101',
      details: { quest_title: 'Motors 101', later_quest_title: 'Sensors' },
      created_at: '2026-07-21T12:00:00Z',
    },
  ]
  vi.clearAllMocks()
})

describe('TeacherDashboard — Needs attention card', () => {
  it('lists open engagement alerts with student, class, and what happened', async () => {
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)

    expect(await screen.findByText('Needs attention (2)')).toBeInTheDocument()
    expect(screen.getByText('Robin Fields')).toBeInTheDocument()
    expect(screen.getByText(/Pottery/)).toBeInTheDocument()
    expect(screen.getByText(/no quest activity for 14\+ days/)).toBeInTheDocument()
    expect(screen.getByText('Ada Stone')).toBeInTheDocument()
    expect(screen.getByText(/hasn't started "Motors 101"/)).toBeInTheDocument()
    expect(screen.getByText(/"Sensors" is already out/)).toBeInTheDocument()
    // The alerts were fetched org-scoped
    expect(api.get.mock.calls.some(([url]) =>
      url.includes('/api/sis/engagement-alerts') && url.includes('organization_id=org-1')
    )).toBe(true)
  })

  it('resolving an alert posts to the resolve endpoint and removes the row', async () => {
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)

    const buttons = await screen.findAllByRole('button', { name: 'Resolve' })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[0])

    await waitFor(() => {
      // scope=mine, like the list above it: resolve re-derives the scope from
      // the query string, so without it an admin-who-also-teaches could see a
      // narrowed list and dismiss out of a wider one.
      expect(api.post).toHaveBeenCalledWith(
        '/api/sis/engagement-alerts/a1/resolve?scope=mine',
        { organization_id: 'org-1' }
      )
    })
    await waitFor(() => {
      expect(screen.queryByText('Robin Fields')).not.toBeInTheDocument()
    })
    // Count in the title updates
    expect(screen.getByText('Needs attention (1)')).toBeInTheDocument()
  })

  it('hides the card entirely when there are no open alerts', async () => {
    state.alerts = []
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)

    // Wait for the dashboard body to render, then confirm the card never appeared
    expect(await screen.findByText('My classes')).toBeInTheDocument()
    expect(screen.queryByText(/Needs attention/)).not.toBeInTheDocument()
  })

  it('hides the card when the alerts endpoint fails', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/engagement-alerts')) return Promise.reject(new Error('boom'))
      if (url.includes('/teacher/dashboard')) return Promise.resolve({ data: { data: state.dashboard } })
      return Promise.resolve({ data: {} })
    })
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)

    expect(await screen.findByText('My classes')).toBeInTheDocument()
    expect(screen.queryByText(/Needs attention/)).not.toBeInTheDocument()
  })
})

describe('TeacherDashboard — Needs attention search and bulk resolve', () => {
  // Ticket 6e03f8c6 (iCreate, Marika viewing as a teacher): "On needs
  // attention, can we have a search function, and a checkbox so teachers can
  // resolve multiple things at a time?"

  beforeEach(() => {
    // The failing-endpoint test above swaps the get implementation, and
    // clearAllMocks does not put it back.
    api.get.mockImplementation((url) => Promise.resolve(apiData(url)))
  })

  it('filters the rows by student, class, or alert text', async () => {
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)
    const search = await screen.findByRole('searchbox', { name: 'Search alerts' })

    fireEvent.change(search, { target: { value: 'robotics' } })
    expect(screen.getByText('Ada Stone')).toBeInTheDocument()
    expect(screen.queryByText('Robin Fields')).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'no quest activity' } })
    expect(screen.getByText('Robin Fields')).toBeInTheDocument()
    expect(screen.queryByText('Ada Stone')).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'nobody' } })
    expect(screen.getByText('No alerts match that search.')).toBeInTheDocument()
    // The title still counts every open alert, not just the matches.
    expect(screen.getByText('Needs attention (2)')).toBeInTheDocument()
  })

  it('resolves every checked row in one request and removes them', async () => {
    api.post.mockResolvedValueOnce({ data: { success: true, resolved: 2, skipped: 0 } })
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)

    const bulk = await screen.findByRole('button', { name: 'Resolve selected (0)' })
    expect(bulk).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select alert for Robin Fields' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select alert for Ada Stone' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resolve selected (2)' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/sis/engagement-alerts/resolve?scope=mine',
        { organization_id: 'org-1', ids: ['a1', 'a2'], scope: 'mine' }
      )
    })
    await waitFor(() => {
      expect(screen.queryByText(/Needs attention/)).not.toBeInTheDocument()
    })
  })

  it('select all takes only the rows the search shows', async () => {
    api.post.mockResolvedValueOnce({ data: { success: true, resolved: 1, skipped: 0 } })
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)
    const search = await screen.findByRole('searchbox', { name: 'Search alerts' })

    fireEvent.change(search, { target: { value: 'pottery' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all shown alerts' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resolve selected (1)' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/sis/engagement-alerts/resolve?scope=mine',
        { organization_id: 'org-1', ids: ['a1'], scope: 'mine' }
      )
    })
    fireEvent.change(search, { target: { value: '' } })
    await waitFor(() => expect(screen.queryByText('Robin Fields')).not.toBeInTheDocument())
    expect(screen.getByText('Ada Stone')).toBeInTheDocument()
    expect(screen.getByText('Needs attention (1)')).toBeInTheDocument()
  })

  it('reloads the list when the server skipped some of the selection', async () => {
    api.post.mockResolvedValueOnce({ data: { success: true, resolved: 1, skipped: 1 } })
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select all shown alerts' }))
    const alertFetches = () => api.get.mock.calls.filter(([u]) => u.includes('/engagement-alerts')).length
    const before = alertFetches()
    fireEvent.click(screen.getByRole('button', { name: 'Resolve selected (2)' }))

    await waitFor(() => expect(alertFetches()).toBe(before + 1))
  })
})
