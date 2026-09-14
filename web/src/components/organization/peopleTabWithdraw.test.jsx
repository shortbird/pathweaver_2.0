/**
 * "Withdraw from school" on the org admin's People tab.
 *
 * Schools that do not run the SIS console (Hearthwood, most LMS-only orgs)
 * had Remove -- the account leaves the org outright -- and nothing gentler
 * (2026-09-14). Withdrawing keeps the student on file, frees their class
 * seats, and takes them off the members list until asked for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PeopleTab from './PeopleTab'

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(async () => true) }))
vi.mock('../admin/BulkUserImport', () => ({ default: () => null }))
vi.mock('../admin/InviteUserModal', () => ({ default: () => null }))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

const USERS = [
  { id: 's1', first_name: 'Sam', last_name: 'Student', role: 'org_managed', org_role: 'student',
    org_roles: ['student'], email: 'sam@x.test', enrollment_status: 'enrolled' },
  { id: 's2', first_name: 'Gone', last_name: 'Student', role: 'org_managed', org_role: 'student',
    org_roles: ['student'], email: 'gone@x.test', enrollment_status: 'withdrawn' },
  { id: 'p1', first_name: 'Penny', last_name: 'Parent', role: 'org_managed', org_role: 'parent',
    org_roles: ['parent'], email: 'penny@x.test' },
]

const mount = () => render(
  <MemoryRouter>
    <PeopleTab orgId="org-1" orgSlug="test" orgName="Test" users={USERS} onUpdate={vi.fn()} />
  </MemoryRouter>,
)

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(() => Promise.resolve({ data: {} }))
  window.confirm = vi.fn(() => true)
})

describe('People tab -- withdrawn students', () => {
  it('keeps a withdrawn student off the list until asked, and badges them', async () => {
    mount()
    expect(await screen.findByText('Sam Student')).toBeInTheDocument()
    expect(screen.queryByText('Gone Student')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Show withdrawn (1)'))
    expect(screen.getByText('Gone Student')).toBeInTheDocument()
    expect(screen.getByText('Withdrawn')).toBeInTheDocument()
  })

  it('a search still finds a withdrawn student by name', async () => {
    mount()
    await screen.findByText('Sam Student')
    fireEvent.change(screen.getByPlaceholderText('Search members...'), { target: { value: 'gone' } })
    expect(screen.getByText('Gone Student')).toBeInTheDocument()
  })

  it('offers Withdraw on a student and sends the standing', async () => {
    mount()
    await screen.findByText('Sam Student')
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    fireEvent.click(await screen.findByRole('button', { name: /Withdraw/ }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/Withdraw Sam Student/))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/admin/organizations/org-1/users/s1/standing', { status: 'withdrawn' }))
  })

  it('offers Reinstate on a withdrawn student', async () => {
    mount()
    await screen.findByText('Sam Student')
    fireEvent.click(screen.getByLabelText('Show withdrawn (1)'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1])
    fireEvent.click(await screen.findByRole('button', { name: /Reinstate/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/admin/organizations/org-1/users/s2/standing', { status: 'enrolled' }))
  })

  it('does not offer Withdraw on a parent', async () => {
    mount()
    await screen.findByText('Penny Parent')
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1])
    await screen.findByRole('button', { name: /Remove/ })
    expect(screen.queryByRole('button', { name: /Withdraw/ })).not.toBeInTheDocument()
  })
})
