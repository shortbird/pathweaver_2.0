import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Engagement alerts live on the classes blueprint. A school with classes off
 * must not ask for them: in shadow mode every visit logged a ModuleGate
 * "would block" (Apogee Cache Valley), and once enforcement is on it is a 404.
 */

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, org } = vi.hoisted(() => ({
  org: { current: null },
  api: {
    get: vi.fn((url) => {
      if (url.includes('/engagement-alerts')) {
        return Promise.resolve({ data: { alerts: [
          { id: 'a1', alert_type: 'inactive_two_weeks', student_name: 'Robin Fields', details: {} },
        ] } })
      }
      if (url.includes('/teacher/dashboard')) {
        return Promise.resolve({ data: { data: { classes: [], profile: {}, pending_acks: [] } } })
      }
      return Promise.resolve({ data: {} })
    }),
    post: vi.fn(),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('./useSisOrg', async (importOriginal) => ({
  ...(await importOriginal()),
  useSisOrg: () => ({ orgId: 'org-1', activeOrg: org.current }),
}))

import TeacherDashboard from './TeacherDashboard'

const alertCalls = () => api.get.mock.calls.filter(([url]) => url.includes('/engagement-alerts'))

beforeEach(() => {
  vi.clearAllMocks()
  org.current = null
})

describe('TeacherDashboard engagement alerts and the classes module', () => {
  it('does not fetch alerts when the org has classes off', async () => {
    org.current = { id: 'org-1', effective_modules: ['sis', 'attendance', 'curriculum'] }
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)
    expect(await screen.findByText('Welcome, Jess')).toBeInTheDocument()
    expect(alertCalls()).toHaveLength(0)
    expect(screen.queryByText(/Needs attention/)).toBeNull()
  })

  it('fetches and shows alerts when classes is on', async () => {
    org.current = { id: 'org-1', effective_modules: ['sis', 'classes'] }
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)
    expect(await screen.findByText('Needs attention (1)')).toBeInTheDocument()
    expect(alertCalls()).toHaveLength(1)
  })

  it('still asks when the org payload cannot answer (degraded { id })', async () => {
    org.current = { id: 'org-1' }
    render(<TeacherDashboard orgId="org-1" userName="Jess" />)
    expect(await screen.findByText('Needs attention (1)')).toBeInTheDocument()
    expect(alertCalls()).toHaveLength(1)
  })
})
