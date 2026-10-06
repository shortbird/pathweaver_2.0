import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// "Viewing as" (2026-08-31): for the front office it is ONE searchable person
// picker — no role dropdown. Picking a person starts a masquerade landed on
// their own surface. Campus coordinators have the picker too (the server hands
// them a shorter list). Nobody else gets a switcher (2026-09-25): parent
// features live on the learning app and teacher features here, so a
// parent-teacher has nothing to switch; a leftover role view keeps its exit.

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../../services/api', () => ({ default: apiMock }))
vi.mock('../../pages/sis/useSisOrg', () => ({ withOrg: (p) => p }))

const masq = vi.hoisted(() => ({
  getMasqueradeState: vi.fn(() => null),
  startMasquerade: vi.fn(() => Promise.resolve({ success: true })),
  exitMasquerade: vi.fn(() => Promise.resolve({ success: true })),
}))
vi.mock('../../services/masqueradeService', () => masq)

import RoleViewSwitcher from './RoleViewSwitcher'

// The server lists school staff only (no students or parents) — a teacher who
// also parents a student here still appears, labeled with both roles.
const PEOPLE = [
  { id: 'u-t', name: 'Dallin Bird', roles: ['advisor', 'parent'] },
  { id: 'u-c', name: 'Cora Front', roles: ['campus_coordinator'] },
]

const admin = { role_view: { active_role: null, available_roles: ['org_admin'] } }

beforeEach(() => {
  vi.clearAllMocks()
  masq.getMasqueradeState.mockReturnValue(null)
  apiMock.get.mockResolvedValue({ data: { people: PEOPLE } })
})

describe('RoleViewSwitcher — admin person picker', () => {
  it('is a single searchable picker, no role dropdown', async () => {
    render(<RoleViewSwitcher user={admin} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    const input = await screen.findByPlaceholderText('Search people…')
    expect(apiMock.get).toHaveBeenCalledWith('/api/role-view/people')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'dal' } })
    expect(screen.getByText('Dallin Bird — Teacher, Parent')).toBeInTheDocument()
    expect(screen.queryByText('Cora Front — Coordinator')).not.toBeInTheDocument()
  })

  it('picking a person masquerades, landed on the console', async () => {
    render(<RoleViewSwitcher user={admin} />)
    const input = await screen.findByPlaceholderText('Search people…')
    fireEvent.focus(input)
    fireEvent.mouseDown(screen.getByText('Cora Front — Coordinator'))
    await waitFor(() => expect(masq.startMasquerade).toHaveBeenCalledWith(
      'u-c', 'SIS viewing-as picker', apiMock, '/',
    ))
  })

  it('a superadmin without a school picked gets no fetch, just the hint', () => {
    const superadmin = { role_view: { active_role: null, available_roles: ['superadmin'] } }
    render(<RoleViewSwitcher user={superadmin} orgId={null} />)
    expect(screen.getByPlaceholderText('Pick a school first')).toBeInTheDocument()
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('a campus coordinator gets the picker, not a role dropdown', async () => {
    const coord = { role_view: { active_role: null, available_roles: ['campus_coordinator'] } }
    render(<RoleViewSwitcher user={coord} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    await screen.findByPlaceholderText('Search people…')
    expect(apiMock.get).toHaveBeenCalledWith('/api/role-view/people')
  })

  it('a lingering role view still has a way out', async () => {
    const viewing = { role_view: { active_role: 'advisor', available_roles: ['org_admin'] } }
    render(<RoleViewSwitcher user={viewing} />)
    fireEvent.click(await screen.findByText('Exit Teacher view'))
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/api/role-view/exit', {}))
  })
})

describe('RoleViewSwitcher — non-admin with several roles', () => {
  it('offers no role switcher to a parent-teacher', () => {
    const katie = { role_view: { active_role: null, available_roles: ['parent', 'advisor'] } }
    const { container } = render(<RoleViewSwitcher user={katie} />)
    expect(container).toBeEmptyDOMElement()
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('still lets a parent-teacher leave a role view started before', async () => {
    const katie = { role_view: { active_role: 'parent', available_roles: ['parent', 'advisor'] } }
    render(<RoleViewSwitcher user={katie} />)
    fireEvent.click(await screen.findByText('Exit Parent view'))
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/api/role-view/exit', {}))
  })

  it('renders nothing for a single-role user', () => {
    const student = { role_view: { active_role: null, available_roles: ['student'] } }
    const { container } = render(<RoleViewSwitcher user={student} />)
    expect(container).toBeEmptyDOMElement()
  })
})

// Ticket 3ed1ffc1: "I can't view the learning app as someone who is JUST a
// parent, not also staff or a teacher." An admin who is also a parent at the
// school gets a door into their own family, narrowed to the parent role.
describe('RoleViewSwitcher — own family view (ticket 3ed1ffc1)', () => {
  const adminParent = {
    org_roles: ['org_admin', 'parent'],
    role_view: { active_role: null, available_roles: ['org_admin', 'parent'] },
  }
  let hrefSpy
  beforeEach(() => {
    apiMock.post.mockResolvedValue({ data: { success: true } })
    hrefSpy = vi.fn()
    vi.stubGlobal('location', { set href(v) { hrefSpy(v) }, get href() { return '' } })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('is offered to an admin whose org_roles include parent', async () => {
    render(<RoleViewSwitcher user={adminParent} />)
    expect(await screen.findByRole('button', { name: 'Parent (my own family)' })).toBeInTheDocument()
  })

  it('is not offered to an admin who is not a parent', async () => {
    render(<RoleViewSwitcher user={admin} />)
    await screen.findByPlaceholderText('Search people…')
    expect(screen.queryByRole('button', { name: 'Parent (my own family)' })).not.toBeInTheDocument()
  })

  it('is not offered while a role view is already on', async () => {
    const viewing = { ...adminParent, role_view: { ...adminParent.role_view, active_role: 'parent' } }
    render(<RoleViewSwitcher user={viewing} />)
    await screen.findByText('Exit Parent view')
    expect(screen.queryByRole('button', { name: 'Parent (my own family)' })).not.toBeInTheDocument()
  })

  it('starts the parent role view and lands on the family pages', async () => {
    render(<RoleViewSwitcher user={adminParent} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Parent (my own family)' }))
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/api/role-view/parent', {}))
    await waitFor(() => expect(hrefSpy).toHaveBeenCalledWith('/family'))
    expect(masq.startMasquerade).not.toHaveBeenCalled()
  })
})
