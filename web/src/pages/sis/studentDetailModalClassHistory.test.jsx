import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The student record's Schedule tab carries the class history (iCreate, ticket
 * fee0d486), and a drop from that tab shows up in it without reopening the
 * record.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}?organization_id=${orgId}`,
}))
vi.mock('../../contexts/ConfirmContext', () => ({
  useConfirm: () => vi.fn(async () => true),
}))
vi.mock('../../utils/appSurface', () => ({ switchSurfaceInApp: vi.fn() }))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import StudentDetailModal from './StudentDetailModal'

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const student = { student_id: 's1', name: 'Test Student', is_student: true }
const ENROLLED = [{ class_id: 'c1', name: 'Geometry', meetings: [] }]
const ADDED = { id: 'e1', event: 'added', class_name: 'Geometry',
  occurred_at: '2026-08-01T10:00:00+00:00', date_known: true, actor_name: 'Marika Office' }
const DROPPED = { id: 'e2', event: 'dropped', class_name: 'Geometry',
  occurred_at: '2026-09-29T10:00:00+00:00', date_known: true, actor_name: 'Marika Office' }

let history
beforeEach(() => {
  vi.clearAllMocks()
  history = [ADDED]
  api.get.mockImplementation((url) => {
    if (url.startsWith('/api/sis/students/s1/class-history')) return Promise.resolve({ data: { history } })
    if (url.startsWith('/api/sis/students/s1/classes')) return Promise.resolve({ data: { classes: ENROLLED } })
    if (url.startsWith('/api/sis/classes')) return Promise.resolve({ data: { classes: [] } })
    return Promise.resolve({ data: {} })
  })
  api.delete.mockResolvedValue({ data: { success: true } })
})

describe('StudentDetailModal class history', () => {
  it('shows the history on the Schedule tab', async () => {
    render(<StudentDetailModal student={student} orgId="org-1" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Schedule' }))

    expect(await screen.findByText('Class history')).toBeInTheDocument()
    expect(await screen.findByText('Added')).toBeInTheDocument()
    expect(screen.getByText(/by Marika Office/)).toBeInTheDocument()
  })

  it('shows the drop in the history right after dropping the class', async () => {
    render(<StudentDetailModal student={student} orgId="org-1" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Schedule' }))
    await screen.findByText('Added')

    fireEvent.click(await screen.findByRole('button', { name: 'List' }))
    history = [DROPPED, ADDED]
    fireEvent.click(await screen.findByRole('button', { name: 'Drop' }))

    await vi.waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      '/api/sis/classes/c1/enrollments/s1?organization_id=org-1'))
    expect(await screen.findByText('Dropped')).toBeInTheDocument()
  })

  it('shows the empty state for a student with no class changes', async () => {
    history = []
    render(<StudentDetailModal student={student} orgId="org-1" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Schedule' }))
    expect(await screen.findByText('No class changes recorded yet.')).toBeInTheDocument()
  })
})
