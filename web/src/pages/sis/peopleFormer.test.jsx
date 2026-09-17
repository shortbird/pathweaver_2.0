/**
 * Former families are kept, not shown.
 *
 * iCreate, 2026-09-14 (28937c94): "why are we keeping families and their
 * numbers if they aren't part of the school anymore? Then their contact
 * information is in reports, etc. It's confusing." The record has to stay --
 * billing and the children's history hang off it -- so the People table stops
 * treating its members as current: the guardians of a family whose every
 * student has withdrawn or graduated hide with their children, behind the
 * same toggle, and a search still finds them by name. The rule itself is the
 * roster's household_former (services/sis_service.get_roster).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
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

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'org_admin' } }) }))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (p) => p,
}))
vi.mock('./teacherPreview', () => ({ setPreviewTeacher: vi.fn(), getPreviewTeacher: () => null }))
vi.mock('./StudentDetailModal', () => ({ default: () => <div /> }))
vi.mock('./FamilyDetailModal', () => ({ default: () => <div /> }))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => () => Promise.resolve(true) }))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const person = (id, over) => ({
  student_id: id, name: id, is_student: false, role: 'parent', roles: ['parent'],
  enrollment_status: null, joined_at: '2026-06-01T00:00:00Z', ...over,
})
const ROSTER = [
  person('Here Kid', { is_student: true, role: 'student', roles: ['student'], enrollment_status: 'enrolled',
    household_id: 'h1', household_name: 'Here Family', household_former: false }),
  person('Here Mom', { household_id: 'h1', household_name: 'Here Family', household_former: false }),
  person('Gone Kid', { is_student: true, role: 'student', roles: ['student'], enrollment_status: 'graduated',
    household_id: 'h2', household_name: 'Gone Family', household_former: true }),
  person('Gone Mom', { household_id: 'h2', household_name: 'Gone Family', household_former: true }),
  person('New Mom', { household_id: 'h3', household_name: 'New Family', household_former: false }),
]

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

import PeoplePage from './PeoplePage'

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { roster: ROSTER } })
})

describe('People — former families', () => {
  it('hides their guardians with their children until asked', async () => {
    render(<PeoplePage />)
    expect(await screen.findByText('Here Mom')).toBeInTheDocument()
    expect(screen.getByText('New Mom')).toBeInTheDocument()   // no students yet: unfinished, not former
    expect(screen.queryByText('Gone Kid')).not.toBeInTheDocument()
    expect(screen.queryByText('Gone Mom')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText(/Hide withdrawn/))
    expect(screen.getByText('Gone Mom')).toBeInTheDocument()
    expect(screen.getAllByText('Former').length).toBe(2)
  })

  it('is a family filter of its own, with a count', async () => {
    render(<PeoplePage />)
    await screen.findByText('Here Mom')
    fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'former' } })
    expect(screen.getByText('Gone Mom')).toBeInTheDocument()
    expect(screen.getByText('Gone Kid')).toBeInTheDocument()
    expect(screen.queryByText('Here Mom')).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Former family (2)' })).toBeInTheDocument()
  })

  it('a search finds a former family member by the family name, once shown', async () => {
    render(<PeoplePage />)
    await screen.findByText('Here Mom')
    fireEvent.click(screen.getByLabelText(/Hide withdrawn/))
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'gone family' } })
    expect(screen.getByText('Gone Mom')).toBeInTheDocument()
    expect(screen.queryByText('Here Mom')).not.toBeInTheDocument()
  })
})
