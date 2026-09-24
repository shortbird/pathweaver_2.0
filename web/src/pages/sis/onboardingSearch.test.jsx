/**
 * One search box over the Assigned list, for a person or a step or both.
 *
 * iCreate, 2026-09-14: the office could see that Lisa Price had uploaded her
 * W-4 and I-9, and had to scroll a list of every assigned task to reach
 * her row. The list needed a box that takes "lisa", "w-4" or "lisa w-4" and
 * narrows as they type.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import AssignedWork from '../../components/sis/tasks/AssignedWork'
import { matchAssignment } from './checklistSearch'

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', role: 'org_managed', org_roles: ['org_admin'] } }),
}))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))


// People as GET /api/sis/tasks/assigned shapes them (shape_task). Lisa and
// Molly were assigned on different days, so each is her own card.
const LISA = {
  id: 'a1', user_id: 'lisa', user_name: 'Lisa Price', title: 'Employee onboarding',
  template_name: 'Employee onboarding',
  audience: 'staff', status: 'done', native_status: 'complete', done_count: 2, total_count: 2,
  finished_at: '2026-09-12T15:00:00Z',
  items: [
    { key: 'w4', title: 'W-4', status: 'complete', needs_document: true,
      documents: [{ path: 'staff/lisa/w4.pdf', filename: 'lisa-w4.pdf' }] },
    { key: 'i9', title: 'I-9', status: 'complete', needs_document: true,
      documents: [{ path: 'staff/lisa/i9.pdf', filename: 'passport.pdf' }] },
  ],
}
const MOLLY = {
  id: 'a2', user_id: 'molly', user_name: 'Molly Christensen', title: 'Employee onboarding',
  template_name: 'Employee onboarding',
  audience: 'staff', status: 'todo', native_status: 'in_progress', done_count: 0, total_count: 1,
  finished_at: null,
  items: [{ key: 'bgcheck', title: 'Background check', status: 'pending', needs_document: true, documents: [] }],
}

const batchOf = (key, person, created) => ({
  key, title: 'Employee onboarding', audiences: ['staff'], action: 'do', priority: null,
  due_date: null, created_at: created, people: [person],
  done: person.status === 'done' ? 1 : 0, total: 1, awaiting_review: 0,
  outstanding: person.status !== 'done',
})

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.startsWith('/api/sis/tasks/assigned')) {
      return Promise.resolve({ data: { batches: [
        batchOf('b1', LISA, '2026-09-10T00:00:00Z'), batchOf('b2', MOLLY, '2026-09-11T00:00:00Z'),
      ] } })
    }
    if (url.startsWith('/api/sis/tasks/schedules')) return Promise.resolve({ data: { schedules: [] } })
    if (url.includes('signature-requests')) return Promise.resolve({ data: { batches: [] } })
    return Promise.resolve({ data: {} })
  })
})

// A person's name shows in their send's table and on their own card; the card
// is the one with a <summary>.
const cardOf = (name) => screen.getAllByText(name)
  .find((el) => el.closest('summary'))?.closest('details')

const renderList = async () => {
  render(<MemoryRouter>
    <AssignedWork orgId="org-1" sigEndpoint="/api/sis/staff-admin/signature-requests" />
  </MemoryRouter>)
  // Lisa's task is finished, so the default Outstanding view hides it.
  fireEvent.click(await screen.findByRole('button', { name: /^All \(/ }))
  await screen.findAllByText('Lisa Price')
  return screen.getByLabelText('Search assigned tasks')
}

describe('matchAssignment', () => {
  it('matches a person, a step, or both; punctuation in a step name is optional', () => {
    expect(matchAssignment(LISA, 'lisa')).toEqual({ items: [] })
    expect(matchAssignment(LISA, 'w4')).toEqual({ items: ['w4'] })
    expect(matchAssignment(LISA, 'I-9')).toEqual({ items: ['i9'] })
    expect(matchAssignment(LISA, 'lisa w-4')).toEqual({ items: ['w4'] })
    expect(matchAssignment(LISA, 'passport')).toEqual({ items: ['i9'] })
    expect(matchAssignment(MOLLY, 'w4')).toBeNull()
    expect(matchAssignment(MOLLY, 'molly w4')).toBeNull()
    expect(matchAssignment(MOLLY, '   ')).toEqual({ items: [] })
  })
})

describe('Assigned search', () => {
  it('narrows the list as the office types a name', async () => {
    const box = await renderList()
    fireEvent.change(box, { target: { value: 'lis' } })
    expect(screen.getAllByText('Lisa Price').length).toBeGreaterThan(0)
    expect(screen.queryByText('Molly Christensen')).not.toBeInTheDocument()

    fireEvent.change(box, { target: { value: '' } })
    expect(screen.getAllByText('Molly Christensen').length).toBeGreaterThan(0)
  })

  it('finds people by the step they were asked for and opens the card on it', async () => {
    const box = await renderList()
    fireEvent.change(box, { target: { value: 'w-4' } })
    expect(screen.queryByText('Molly Christensen')).not.toBeInTheDocument()
    const card = cardOf('Lisa Price')
    expect(card.open).toBe(true)
    // The send around her card opens too, or the open card is out of sight.
    expect(card.parentElement.closest('details').open).toBe(true)
    expect(screen.getByText('lisa-w4.pdf')).toBeInTheDocument()
    // The step the search named is marked; the other is not.
    expect(screen.getByText('W-4').closest('li').className).toContain('bg-amber-50')
    expect(screen.getByText('I-9').closest('li').className).not.toContain('bg-amber-50')
  })

  it('says so when nothing matches', async () => {
    const box = await renderList()
    fireEvent.change(box, { target: { value: 'zzz' } })
    await waitFor(() => expect(screen.getByText('Nothing here matches "zzz".')).toBeInTheDocument())
    expect(screen.queryByText('Lisa Price')).not.toBeInTheDocument()
  })
})
