import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The curriculum library's class picker reads the classes module's list. A
 * school that runs curriculum with classes off (Apogee Cache Valley) must not
 * ask for it -- a ModuleGate "would block" in shadow mode, a 404 once enforced
 * -- and has no classes to attach an entry to, so the picker is not offered.
 */

const render = (ui) => rtlRender(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>,
)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, org } = vi.hoisted(() => ({
  org: { current: null },
  api: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: { curriculum: { id: 'new-1' } } })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../../services/api', () => ({ default: api }))
vi.mock('../useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', activeOrg: org.current }),
  withOrg: (url, orgId) => `${url}?organization_id=${orgId}`,
}))
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'org_managed', org_role: 'org_admin' } }),
}))
vi.mock('../../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(() => Promise.resolve(true)) }))

import CurriculumPanel from './CurriculumPanel'

const classListCalls = () => api.get.mock.calls.filter(([url]) => url.startsWith('/api/sis/classes'))

beforeEach(() => {
  vi.clearAllMocks()
  org.current = null
  api.get.mockImplementation((url) => {
    if (url.includes('/api/sis/curriculum')) return Promise.resolve({ data: { curriculum: [] } })
    return Promise.resolve({ data: { classes: [{ id: 'c1', name: 'Pottery' }] } })
  })
})

describe('CurriculumPanel and the classes module', () => {
  it('with classes off: no class list request, no class picker, no attach write', async () => {
    org.current = { id: 'org-1', effective_modules: ['sis', 'curriculum'] }
    render(<CurriculumPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /add curriculum/i }))
    expect(screen.queryByText('Classes using this curriculum')).toBeNull()
    expect(classListCalls()).toHaveLength(0)

    fireEvent.change(screen.getByPlaceholderText(/title/i), { target: { value: 'Clay' } })
    fireEvent.click(screen.getByRole('button', { name: /save curriculum/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.put).not.toHaveBeenCalled()
  })

  it('with classes on: loads the class list and offers the picker', async () => {
    org.current = { id: 'org-1', effective_modules: ['sis', 'curriculum', 'classes'] }
    render(<CurriculumPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /add curriculum/i }))
    expect(screen.getByText('Classes using this curriculum')).toBeInTheDocument()
    expect(await screen.findByText('Pottery')).toBeInTheDocument()
    expect(classListCalls()).toHaveLength(1)
  })
})
