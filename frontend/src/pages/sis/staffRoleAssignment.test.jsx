/**
 * Setting somebody's role — including campus coordinator.
 *
 * iCreate, 2026-08-06: "i also think we established a campus coordinator role
 * but we don't know how to set someone to have that role."
 *
 * The role shipped on 2026-08-04 complete except for this: there was nowhere in
 * the console to put a person in it. The picker lives on the staff member's
 * card, next to the roles it changes.
 *
 * The check that matters most is the last one: a campus coordinator must not
 * see this control at all. Promoting yourself to admin hands back the finance
 * access the coordinator role exists to withhold, so the frontend hides it and
 * the backend gates it (test_sis_staff_roles.py).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_admin' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import StaffDetailModal from '../../components/sis/StaffDetailModal'

const KATE = {
  id: 'kate', name: 'Kate Myers', email: 'kate@x.com', roles: ['advisor'],
  is_placeholder: false, login_pending: false, class_count: 2, last_active: null,
}

const open = (staff = KATE, props = {}) => render(
  <StaffDetailModal orgId="org-1" staff={staff} onClose={() => {}} onEdit={() => {}}
    onEmployment={() => {}} onLink={() => {}} onViewPortal={() => {}} {...props} />,
)

beforeEach(() => {
  vi.clearAllMocks()
  authState = { user: { id: 'u1', role: 'org_admin' } }
  api.get.mockResolvedValue({ data: { profile: {} } })
  api.put.mockResolvedValue({ data: { success: true } })
})

describe('setting a staff role', () => {
  it('offers to change the role from the staff card', async () => {
    open()
    expect(await screen.findByRole('button', { name: 'Change' })).toBeInTheDocument()
  })

  it('names campus coordinator and says what it withholds', async () => {
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    expect(screen.getByText('Campus Coordinator')).toBeInTheDocument()
    expect(screen.getByText(/billing, timesheets and pay rates stay hidden/i)).toBeInTheDocument()
  })

  it('makes a teacher a campus coordinator', async () => {
    const onRolesChanged = vi.fn()
    open(KATE, { onRolesChanged })
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Campus Coordinator/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Teacher/i }))  // drop the old one
    fireEvent.click(screen.getByRole('button', { name: 'Save role' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/staff/kate/roles?organization_id=org-1',
      { roles: ['campus_coordinator'] },
    ))
    await waitFor(() => expect(onRolesChanged).toHaveBeenCalled())
  })

  it('lets somebody hold both coordinator and teacher', async () => {
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Campus Coordinator/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save role' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      expect.any(String),
      { roles: ['advisor', 'campus_coordinator'] },
    ))
  })

  it('shows the backend refusal instead of pretending it saved', async () => {
    const { toast } = await import('react-hot-toast')
    api.put.mockRejectedValue({ response: { data: {
      error: "This is the school's only admin. Make somebody else an admin first." } } })
    open({ ...KATE, roles: ['org_admin'] })
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /^Admin/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save role' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      "This is the school's only admin. Make somebody else an admin first."))
  })

  it('hides the control from a campus coordinator', async () => {
    authState = { user: { id: 'u2', role: 'org_managed', org_roles: ['campus_coordinator'] } }
    open()
    await screen.findByText('Kate Myers')
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument()
  })
})
