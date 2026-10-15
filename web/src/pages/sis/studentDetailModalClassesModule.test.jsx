import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The Schedule tab is classes: the student's enrolled classes and an enroll
 * picker over /api/sis/classes, which the classes module serves. A school with
 * classes off (Apogee Cache Valley) is not offered the tab, so the picker's
 * request -- a ModuleGate "would block" in shadow mode -- never goes out.
 */

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, org } = vi.hoisted(() => ({
  org: { current: null },
  api: { get: vi.fn(() => Promise.resolve({ data: {} })), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', activeOrg: org.current }),
  withOrg: (url, orgId) => `${url}?organization_id=${orgId}`,
}))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(async () => true) }))
vi.mock('../../utils/appSurface', () => ({ switchSurfaceInApp: vi.fn() }))

import StudentDetailModal from './StudentDetailModal'

const student = { student_id: 's1', name: 'Test Student', is_student: true }

beforeEach(() => {
  vi.clearAllMocks()
  org.current = null
})

describe('StudentDetailModal Schedule tab and the classes module', () => {
  it('is not offered when the org has classes off', () => {
    org.current = { id: 'org-1', effective_modules: ['sis', 'attendance', 'individual_work'] }
    render(<StudentDetailModal student={student} orgId="org-1" onClose={vi.fn()} />)
    expect(screen.queryByRole('tab', { name: 'Schedule' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Profile' })).toBeInTheDocument()
    expect(api.get.mock.calls.some(([url]) => url.startsWith('/api/sis/classes'))).toBe(false)
  })

  it('is offered when classes is on', () => {
    org.current = { id: 'org-1', effective_modules: ['sis', 'classes'] }
    render(<StudentDetailModal student={student} orgId="org-1" onClose={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Schedule' })).toBeInTheDocument()
  })

  it('is offered when the org payload cannot answer', () => {
    org.current = { id: 'org-1' }
    render(<StudentDetailModal student={student} orgId="org-1" onClose={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Schedule' })).toBeInTheDocument()
  })
})
