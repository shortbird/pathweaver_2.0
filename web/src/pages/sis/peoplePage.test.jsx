import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RecordDoorsProvider } from '../../components/sis/RecordDoors'

/**
 * People: one table of everyone in the school.
 *
 * It was three tabs (Everyone, Staff, Families) until 2026-09-16. Now every
 * row is a person showing every role they hold, and the filters are built
 * from the list: a chip or an option nobody matches is not offered.
 */

// RecordDoorsProvider is the console's one mount of the student record
// (SisLayout renders it); a page rendered bare opens nothing without it.
const render = (ui, { route = '/people' } = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}><RecordDoorsProvider>{ui}</RecordDoorsProvider></MemoryRouter>
    </QueryClientProvider>,
  )
}

const { api, sisOrg, preview, nav } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })), patch: vi.fn(), delete: vi.fn() },
  sisOrg: { orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, canViewAs: true, activeOrg: null },
  preview: { setPreviewTeacher: vi.fn(), getPreviewTeacher: () => null, clearPreviewTeacher: vi.fn(), withPreview: (p) => p },
  nav: { navigate: vi.fn() },
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../contexts/AuthContext', async () => {
  const React = await import('react')
  return { useAuth: () => ({ user: { id: 'u1', role: 'org_admin' } }), AuthContext: React.createContext(null) }
})
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => ({ organization: { id: 'org-1' } }) }))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => () => Promise.resolve(true) }))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({ useSisOrg: () => sisOrg, withOrg: (p) => p }))
vi.mock('./teacherPreview', () => preview)
vi.mock('./StudentDetailModal', () => ({ default: ({ student }) => <div>MANAGE {student.name}</div> }))
vi.mock('./FamilyDetailModal', () => ({ default: ({ household }) => <div>FAMILY {household.name}</div> }))
vi.mock('../../components/sis/StaffDetailModal', () => ({ default: ({ staff }) => <div>STAFF {staff.id} roles:{staff.roles.join(',')}</div> }))
vi.mock('../../components/sis/SisNewUserModal', () => ({ default: () => <div>NEW USER</div> }))
vi.mock('../../components/sis/TeacherModal', () => ({ default: ({ placeholders }) => <div>NEW TEACHER placeholders:{placeholders.length}</div> }))
vi.mock('../../components/sis/PeopleExportModal', () => ({ default: ({ rows }) => <div>EXPORT {rows.length}</div> }))
vi.mock('../../services/masqueradeService', () => ({ startMasquerade: vi.fn(() => Promise.resolve({ success: true })) }))
vi.mock('../../utils/appSurface', () => ({ switchSurfaceInApp: vi.fn() }))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal()
  return { ...mod, useNavigate: () => nav.navigate }
})

import PeoplePage from './PeoplePage'

const person = (id, over = {}) => ({
  student_id: id, name: id, first_name: id, last_name: 'X', is_student: false, roles: ['parent'], role: 'parent',
  enrollment_status: null, household_id: null, household_name: null, age: null,
  joined_at: '2026-06-01T00:00:00Z', last_active: null, email: `${id.toLowerCase()}@x.com`, ...over,
})

const ROSTER = [
  person('Ada Ant', { is_student: true, roles: ['student'], role: 'student', age: 9, enrollment_status: 'enrolled',
    household_id: 'h1', household_name: 'Ant', email: null, username: 'ada' }),
  person('Bo Bee', { is_student: true, roles: ['student'], role: 'student', age: 12, enrollment_status: 'withdrawn',
    household_id: 'h2', household_name: 'Bee', household_former: true }),
  person('Bea Bee', { household_id: 'h2', household_name: 'Bee', household_former: true,
    stated_payment_methods: ['Utah Fits All'] }),
  person('Cal Cat', { is_student: true, roles: ['student'], role: 'student', age: 7, enrollment_status: 'unassigned' }),
  person('Molly Christensen', { roles: ['org_admin', 'parent'], role: 'org_admin', household_id: 'h1', household_name: 'Ant',
    last_active: '2026-09-01T00:00:00Z', registration_hold: true, registration_hold_reason: 'Unpaid fee',
    stated_payment_methods: ['Self-Pay'], payment_plan: 'monthly' }),
  person('Julia Connor', { roles: ['advisor'], role: 'advisor', login_pending: true, class_count: 0,
    joined_at: new Date(Date.now() - 3 * 86400000).toISOString() }),
  person('Liz', { roles: ['advisor'], role: 'advisor', is_placeholder: true, class_count: 12,
    email: 'liz@icreate-staff.placeholder.optioeducation.com',
    duplicate_of: { id: 'Julia Connor', name: 'Julia Connor', email: 'julia connor@x.com', is_placeholder: false, class_count: 0 } }),
]

const HOUSEHOLDS = [
  { id: 'h1', name: 'Ant', members: [{ user_id: 'Ada Ant', name: 'Ada Ant', relationship: 'student' }] },
  { id: 'h2', name: 'Bee', members: [] },
]

// The duplicates banner names a person too, so look for the table row.
const rowOf = (name) => screen.getAllByText(name).map((e) => e.closest('tr')).find(Boolean)
// Clicking the row is what opens a person's actions, since 2026-09-22. It
// used to go straight to Manage, with everything else behind a per-row menu
// whose column made an already too-wide table wider.
const openMenu = (name) => fireEvent.click(rowOf(name))
const menuItems = () => [...screen.getByRole('dialog').querySelectorAll('li button')]
  .map((b) => b.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  sisOrg.canViewAs = true
  api.get.mockImplementation((url) => {
    if (url.includes('/api/sis/roster')) return Promise.resolve({ data: { roster: ROSTER } })
    if (url.includes('/api/sis/households')) return Promise.resolve({ data: { households: HOUSEHOLDS } })
    if (url.includes('/api/sis/members')) return Promise.resolve({ data: { members: [] } })
    if (url.includes('/api/sis/unassigned-students')) return Promise.resolve({ data: { students: [] } })
    return Promise.resolve({ data: {} })
  })
})

describe('the one table', () => {
  it('lists everyone with every role they hold, and no tabs', async () => {
    render(<PeoplePage />)
    expect(await screen.findByText('Ada Ant')).toBeInTheDocument()
    expect(screen.queryByText('Everyone')).not.toBeInTheDocument()
    expect(screen.queryByText('Families')).not.toBeInTheDocument()
    const molly = rowOf('Molly Christensen')
    expect(within(molly).getByText('Admin')).toBeInTheDocument()
    expect(within(molly).getByText('Parent')).toBeInTheDocument()
    // Staff and family facts are pills on the row, not a tab away.
    expect(within(rowOf('Julia Connor')).getByText('Invite pending')).toBeInTheDocument()
    expect(within(rowOf('Julia Connor')).getByText('invited 3 days ago')).toBeInTheDocument()
    expect(within(rowOf('Liz')).getByText('No login yet')).toBeInTheDocument()
    expect(within(rowOf('Liz')).getByText('12 classes')).toBeInTheDocument()
    expect(screen.queryByText('liz@icreate-staff.placeholder.optioeducation.com')).not.toBeInTheDocument()
    expect(within(molly).getByText('Hold')).toBeInTheDocument()
    expect(within(molly).getByText('Self-Pay')).toBeInTheDocument()
    expect(within(molly).getByText('Monthly')).toBeInTheDocument()
    expect(within(rowOf('Cal Cat')).getByText('Not enrolled')).toBeInTheDocument()
  })

  it('hides the former by default and shows them on request', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    expect(screen.queryByText('Bo Bee')).not.toBeInTheDocument()
    expect(screen.queryByText('Bea Bee')).not.toBeInTheDocument()   // her only child withdrew
    fireEvent.click(screen.getByLabelText(/Hide withdrawn/))
    expect(await screen.findByText('Bo Bee')).toBeInTheDocument()
    expect(screen.getByText('Bea Bee')).toBeInTheDocument()
    expect(within(rowOf('Bea Bee')).getByText('Former')).toBeInTheDocument()
    expect(screen.getByText(/Showing 7 of 7 people/)).toBeInTheDocument()
  })
})

describe('filters built from the list', () => {
  it('offers role chips with counts only for roles somebody holds', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    const group = screen.getByRole('group', { name: 'Role' })
    // Everyone counts the same people the role chips count: the five showing,
    // not the seven on file. Two of these fixtures are former -- a withdrawn
    // student and the parent whose only child withdrew -- and the table hides
    // them by default. Everyone used to say 7 over a table of 5 (2026-09-22).
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Everyone (5)', 'Students (2)', 'Parents (1)', 'Teachers (2)', 'Admins (1)',
    ])
  })

  it('Everyone follows the search box too', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'Ada' } })
    const group = screen.getByRole('group', { name: 'Role' })
    expect(within(group).getByRole('button', { name: /^Everyone/ }).textContent).toBe('Everyone (1)')
  })

  it('Everyone counts people, and a role chip counts the roles they hold', async () => {
    // Somebody who teaches and also has a child here is in Teachers and in
    // Parents both, so the chips can add up to more than Everyone. That is
    // not the arithmetic being wrong; it is one person wearing two hats.
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    fireEvent.click(screen.getByLabelText(/Hide withdrawn/))
    const group = await screen.findByRole('group', { name: 'Role' })
    const counts = within(group).getAllByRole('button')
      .map((b) => Number(b.textContent.match(/\((\d+)\)/)[1]))
    const [everyone, ...roles] = counts
    expect(everyone).toBe(7)
    expect(roles.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(everyone)
  })

  it('narrows by role, and the other counts follow', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    fireEvent.click(screen.getByRole('button', { name: 'Students (2)' }))
    expect(screen.getByText('Ada Ant')).toBeInTheDocument()
    expect(screen.queryByText('Molly Christensen')).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Not enrolled (1)' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Invite pending/ })).not.toBeInTheDocument()
  })

  it('offers only the statuses somebody has, and filters by one', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    const status = screen.getByLabelText('Status')
    expect(within(status).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Any status', 'Not enrolled (1)', 'Invite pending (1)', 'No login yet (1)', 'Registration hold (1)', 'Withdrawn (1)',
    ])
    fireEvent.change(status, { target: { value: 'invite_pending' } })
    expect(screen.getByText('Julia Connor')).toBeInTheDocument()
    expect(screen.queryByText('Ada Ant')).not.toBeInTheDocument()
    // Asking for the withdrawn shows them without touching the hide toggle.
    fireEvent.change(status, { target: { value: 'withdrawn' } })
    expect(screen.getByText('Bo Bee')).toBeInTheDocument()
  })

  it('finds the students not in a family, from the hint or the select', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    expect(screen.getByText(/1 student is not in a family yet/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show them' }))
    expect(screen.getByText('Cal Cat')).toBeInTheDocument()
    expect(screen.queryByText('Ada Ant')).not.toBeInTheDocument()
    expect(screen.queryByText(/not in a family yet/)).not.toBeInTheDocument()
  })

  it('filters by how the family pays', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    fireEvent.change(screen.getByLabelText('Filter by form of payment'), { target: { value: 'Self-Pay' } })
    expect(screen.getByText('Molly Christensen')).toBeInTheDocument()
    expect(screen.queryByText('Ada Ant')).not.toBeInTheDocument()
  })

  it('searches by any name, email, or family', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'ant' } })
    expect(screen.getByText('Ada Ant')).toBeInTheDocument()
    expect(screen.getByText('Molly Christensen')).toBeInTheDocument()   // family Ant
    expect(screen.queryByText('Julia Connor')).not.toBeInTheDocument()
  })

  it('reads its filters from the link, including the old tab links', async () => {
    render(<PeoplePage />, { route: '/people?role=student&family=none' })
    expect(await screen.findByText('Cal Cat')).toBeInTheDocument()
    expect(screen.queryByText('Ada Ant')).not.toBeInTheDocument()
  })

  it('an old ?tab=staff link is the Teachers, Coordinators and Admins together', async () => {
    render(<PeoplePage />, { route: '/people?tab=staff' })
    expect(await screen.findByText('Julia Connor')).toBeInTheDocument()
    expect(screen.getByText('Molly Christensen')).toBeInTheDocument()
    expect(screen.queryByText('Ada Ant')).not.toBeInTheDocument()
  })
})

describe('what a row can do', () => {
  it('everyone gets Manage; students, staff and family members get theirs', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    openMenu('Ada Ant')
    expect(menuItems()).toEqual(['Manage', 'Overview', 'View as student', 'Open family', 'Remove from school…'])
    fireEvent.click(screen.getByText('Manage'))
    expect(screen.getByText('MANAGE Ada Ant')).toBeInTheDocument()
  })

  it('a staff member has a staff record and a portal to view', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    openMenu('Molly Christensen')
    expect(menuItems()).toEqual(['Manage', 'Staff record', 'View their portal', 'Open family', 'Remove from school…'])
    fireEvent.click(screen.getByText('Staff record'))
    // The staff modal reads the staff row shape: id, and staff roles only.
    expect(screen.getByText('STAFF Molly Christensen roles:org_admin')).toBeInTheDocument()
  })

  it('a placeholder has a record but no portal to view', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    openMenu('Liz')
    expect(menuItems()).toEqual(['Manage', 'Staff record', 'Remove from school…'])
  })

  it('opens a family from its name', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    fireEvent.click(within(rowOf('Ada Ant')).getByRole('button', { name: 'Ant' }))
    expect(await screen.findByText('FAMILY Ant')).toBeInTheDocument()
  })

  it('resends an invite from the row', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    fireEvent.click(within(rowOf('Julia Connor')).getByRole('button', { name: 'Resend invite' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/staff/Julia Connor/resend-invite', { organization_id: 'org-1' }))
  })

  it('names the same person on two rows and offers the merge', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    expect(screen.getByText(/is on the list twice/)).toHaveTextContent('holding 12 classes')
    fireEvent.click(screen.getByRole('button', { name: 'Merge into invited account' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/staff/Liz/link', {
      email: 'julia connor@x.com', organization_id: 'org-1',
    }))
  })
})

describe('adding', () => {
  it('one Add button offers a person, a teacher, or a family', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Teacher' }))
    // The teacher form is told about the cards with no login, so it links
    // instead of creating a second record.
    expect(screen.getByText('NEW TEACHER placeholders:1')).toBeInTheDocument()
  })

  it('creates a family in place', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Family' }))
    fireEvent.change(screen.getByPlaceholderText('New family / household name'), { target: { value: 'The Garcia Family' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/households',
      expect.objectContaining({ name: 'The Garcia Family' })))
  })

  it('the dashboard link opens the family form straight away', async () => {
    render(<PeoplePage />, { route: '/people?add=family' })
    expect(await screen.findByPlaceholderText('New family / household name')).toBeInTheDocument()
  })

  it('exports the rows on screen', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    fireEvent.click(screen.getByRole('button', { name: 'Students (2)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(screen.getByText('EXPORT 2')).toBeInTheDocument()
  })
})

describe('the table stays inside its card', () => {
  // "The list of people extends past the white inner rectangle. Family field
  // could be made smaller so it all fits" (an iCreate org admin, 2026-09-22).
  // The card is overflow-visible on purpose, because the row's ... menu opens
  // inside it, so nothing scrolls the spill away: the Family cell has to stop
  // being the widest thing in the table. Its widest part was a payment answer
  // a family typed, and iCreate's longest runs to 53 unbreakable characters.
  //
  // jsdom has no layout -- every element measures zero -- so this pins the
  // structure that keeps the width down rather than the width itself.
  it('caps the family cell and truncates the long parts', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')

    const family = screen.getAllByTitle(/^Open /)[0]
    expect(family.className).toMatch(/truncate/)
    expect(family.className).toMatch(/max-w-/)
    expect(family.closest('div').className).toMatch(/max-w-/)
  })

  it('keeps a payment answer on one capped line, with the whole of it on hover', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')

    const pill = within(screen.getByRole('table')).getByText('Self-Pay')
    expect(pill.className).toMatch(/truncate/)
    expect(pill.className).toMatch(/max-w-/)
    // Truncated in the cell, intact in the tooltip.
    expect(pill).toHaveAttribute('title', 'Self-Pay')
  })

  it('lets the card scroll, now that nothing pops out of it', async () => {
    // It was overflow-visible only to keep the row menu's absolute panel from
    // being clipped. The menu is gone, so the card behaves like every other
    // table card in the console and a narrow window scrolls instead of
    // spilling.
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')

    const card = screen.getByRole('table').closest('div')
    expect(card.className).toMatch(/overflow-x-auto/)
  })

  it('has no per-row actions column any more', async () => {
    render(<PeoplePage />)
    await screen.findByText('Ada Ant')
    expect(screen.queryByLabelText('Actions')).toBeNull()
  })
})
