/**
 * Former families are kept, not shown.
 *
 * iCreate, 2026-09-14 (28937c94): "why are we keeping families and their
 * numbers if they aren't part of the school anymore? Then their contact
 * information is in reports, etc. It's confusing." The record has to stay --
 * billing and the children's history hang off it -- so the Families list stops
 * treating it as current: a family whose every student has withdrawn or
 * graduated sits behind a toggle, and a search still finds it by name.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import HouseholdsPage, { isFormerFamily } from './HouseholdsPage'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'org_admin' } }),
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => () => Promise.resolve(true) }))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const HOUSEHOLDS = [
  { id: 'h1', name: 'Ford Family', stated_payment_methods: [],
    members: [{ user_id: 's1', name: 'Uma Ford', relationship: 'student', status: 'enrolled' }] },
  { id: 'h2', name: 'Gone Family', stated_payment_methods: [],
    members: [
      { user_id: 's2', name: 'Robin Gone', relationship: 'student', status: 'withdrawn' },
      { user_id: 's3', name: 'Sam Gone', relationship: 'student', status: 'graduated' },
      { user_id: 'p2', name: 'Pat Gone', relationship: 'guardian' },
    ] },
  { id: 'h3', name: 'Half Family', stated_payment_methods: [],
    members: [
      { user_id: 's4', name: 'Ada Half', relationship: 'student', status: 'withdrawn' },
      { user_id: 's5', name: 'Ben Half', relationship: 'student', status: 'enrolled' },
    ] },
  { id: 'h4', name: 'New Family', stated_payment_methods: [],
    members: [{ user_id: 'p4', name: 'Kim New', relationship: 'guardian' }] },
]

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/api/sis/households')) return Promise.resolve({ data: { households: HOUSEHOLDS } })
    if (url.includes('/api/sis/unassigned-students')) return Promise.resolve({ data: { students: [] } })
    return Promise.resolve({ data: {} })
  })
})

describe('isFormerFamily', () => {
  it('is every student withdrawn or graduated, and at least one student', () => {
    expect(isFormerFamily(HOUSEHOLDS[0])).toBe(false)
    expect(isFormerFamily(HOUSEHOLDS[1])).toBe(true)
    expect(isFormerFamily(HOUSEHOLDS[2])).toBe(false)   // one child still here
    expect(isFormerFamily(HOUSEHOLDS[3])).toBe(false)   // no students yet: unfinished, not former
  })
})

describe('Families list — former families', () => {
  it('hides them until asked, and counts them on the toggle', async () => {
    render(<HouseholdsPage />)
    expect(await screen.findByText('Ford Family')).toBeInTheDocument()
    expect(screen.queryByText('Gone Family')).not.toBeInTheDocument()
    expect(screen.getByText('Half Family')).toBeInTheDocument()
    expect(screen.getByText('New Family')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Show former families (1)'))
    expect(screen.getByText('Gone Family')).toBeInTheDocument()
    expect(screen.getByText('Former')).toBeInTheDocument()
  })

  it('a search still finds a former family by name', async () => {
    render(<HouseholdsPage />)
    await screen.findByText('Ford Family')
    fireEvent.change(screen.getByPlaceholderText(/Search families/), { target: { value: 'gone' } })
    expect(screen.getByText('Gone Family')).toBeInTheDocument()
    expect(screen.queryByText('Ford Family')).not.toBeInTheDocument()
  })
})
