import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

/**
 * The People page's add wizard (2026-10-12): a family in one request, a
 * staff member in any staff role, a student into an existing family, and the
 * roster import that moved here from the superadmin dashboard.
 */

const { api, authUser } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  authUser: { current: { id: 'u1', role: 'org_managed', org_role: 'org_admin', org_roles: ['org_admin'] } },
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../../services/api', () => ({ default: api }))
vi.mock('../../../components/ui', () => ({ ModalOverlay: ({ children }) => <div>{children}</div> }))
vi.mock('../../../contexts/ConfirmContext', () => ({ useConfirm: () => () => Promise.resolve(true) }))
vi.mock('../../../contexts/AuthContext', async () => {
  const R = await import('react')
  return { AuthContext: R.createContext(null), useAuth: () => ({ user: authUser.current }) }
})

import AddFamilyForm from './AddFamilyForm'
import AddStudentForm from './AddStudentForm'
import RosterImport from './RosterImport'
import TeacherModal from '../../../components/sis/TeacherModal'
import { AuthContext } from '../../../contexts/AuthContext'

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={{ user: authUser.current }}>{ui}</AuthContext.Provider>
    </QueryClientProvider>,
  )
}

const yearsAgo = (n) => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - n)
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 10)
}

const typeInto = (label, value, index = 0) =>
  fireEvent.change(screen.getAllByLabelText(label)[index], { target: { value } })

beforeEach(() => {
  vi.clearAllMocks()
  authUser.current = { id: 'u1', role: 'org_managed', org_role: 'org_admin', org_roles: ['org_admin'] }
  api.get.mockResolvedValue({ data: { templates: [], households: [], members: [], students: [] } })
})

describe('A family', () => {
  const fillParent = () => {
    typeInto('First name', 'Shelby', 0)
    typeInto('Last name', 'Watson', 0)
    typeInto('Email', 'shelby@example.com', 0)
  }

  it('sends the parents and children in one request, after a review', async () => {
    api.post.mockResolvedValue({ data: { household: { id: 'hh-1', name: 'Watson Family' },
      guardians: [{ name: 'Shelby Watson', invite_sent: true }],
      children: [{ name: 'Reece Watson', kind: 'dependent' }], problems: [] } })
    const onCreated = vi.fn()
    render(<AddFamilyForm orgId="org-1" onBack={vi.fn()} onCreated={onCreated} />)
    fillParent()
    typeInto('First name', 'Reece', 1)
    typeInto('Last name', 'Watson', 1)
    typeInto('Date of birth', yearsAgo(9))
    // Under 13: no email field, and the form says why.
    expect(screen.getByText(/a profile their parent manages/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByText('Watson Family')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Create family' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/api/sis/families')
    expect(body).toMatchObject({
      organization_id: 'org-1', name: 'Watson Family', send_emails: true,
      guardians: [{ first_name: 'Shelby', last_name: 'Watson', email: 'shelby@example.com' }],
      children: [{ first_name: 'Reece', last_name: 'Watson', email: '' }],
    })
    expect(await screen.findByText(/is ready/)).toBeInTheDocument()
    expect(onCreated).toHaveBeenCalled()
  })

  it('a child 13 or older needs their own email before review', () => {
    render(<AddFamilyForm orgId="org-1" onBack={vi.fn()} />)
    fillParent()
    typeInto('First name', 'Ava', 1)
    typeInto('Last name', 'Watson', 1)
    typeInto('Date of birth', yearsAgo(15))
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByRole('alert')).toHaveTextContent('needs their own email')
  })

  it('emails can wait', async () => {
    api.post.mockResolvedValue({ data: { household: { id: 'hh-1' }, guardians: [], children: [], problems: [] } })
    render(<AddFamilyForm orgId="org-1" onBack={vi.fn()} />)
    fillParent()
    fireEvent.click(screen.getByLabelText(/Email each new account/))
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByText(/No emails go out now/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create family' }))
    await waitFor(() => expect(api.post.mock.calls[0][1].send_emails).toBe(false))
  })

  it('a refusal from the server comes back to the form', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'shelby@example.com is already a parent in a family here.' } } })
    render(<AddFamilyForm orgId="org-1" onBack={vi.fn()} />)
    fillParent()
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create family' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already a parent in a family here')
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument()
  })
})

describe('A staff member', () => {
  it('starts as the role picked', async () => {
    api.post.mockResolvedValue({ data: { teacher: { id: 'new-1' }, email_sent: true } })
    const onSaved = vi.fn()
    render(<TeacherModal orgId="org-1" onClose={vi.fn()} onSaved={onSaved} onBack={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(/Campus Coordinator/))
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'sam@school.org' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Campus Coordinator' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/api/sis/staff')
    expect(body.org_role).toBe('campus_coordinator')
  })

  it('a teacher sends no role, as before', async () => {
    api.post.mockResolvedValue({ data: { teacher: { id: 'new-1' }, email_sent: true } })
    render(<TeacherModal orgId="org-1" onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'sam@school.org' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Teacher' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].org_role).toBeUndefined()
  })

  it('a coordinator is not offered Admin', () => {
    authUser.current = { id: 'u2', role: 'org_managed', org_role: 'campus_coordinator', org_roles: ['campus_coordinator'] }
    render(<TeacherModal orgId="org-1" onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByLabelText(/Campus Coordinator/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Admin/)).not.toBeInTheDocument()
  })

  it('Back returns to the wizard', () => {
    const onBack = vi.fn()
    render(<TeacherModal orgId="org-1" onClose={vi.fn()} onSaved={vi.fn()} onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalled()
  })
})

describe('A student', () => {
  it('with no family, makes a username login and shows the password once', async () => {
    api.post.mockResolvedValue({ data: { user: { id: 'kid-1' },
      login_credentials: { username: 'ava.w', password: 'tulip-42', login_url: '/login/school' } } })
    render(<AddStudentForm orgId="org-1" onBack={vi.fn()} />)
    typeInto('First name', 'Ava')
    typeInto('Last name', 'Watson')
    typeInto('Username', 'Ava.W')
    fireEvent.click(screen.getByRole('button', { name: 'Create student' }))
    expect(await screen.findByText('tulip-42')).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/api/admin/organizations/org-1/users/create-username', {
      username: 'ava.w', first_name: 'Ava', last_name: 'Watson', org_role: 'student',
    })
  })
})

describe('Many people', () => {
  const ROSTER = 'Student First Name\tStudent Last Name\tStudent Email\tParent First Name\tParent Last Name\tParent Email\n'
    + 'Ava\tWatson\t\tShelby\tWatson\tshelby@example.com'

  const paste = () => {
    fireEvent.paste(screen.getByLabelText('Student first row 1'), {
      clipboardData: { getData: () => ROSTER },
    })
  }

  it('previews and imports through the SIS, with emails off by default', async () => {
    api.post.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/preview')
      ? { can_import: true, students: [], parents: [], row_errors: [], warnings: [],
          counts: { students_new: 1, parents_new: 1, families: 1, dependents_new: 1,
            students_existing: 0, parents_existing: 0, adopted: 0, invalid_rows: 0 } }
      : { results: [], family_errors: [], counts: { created: 2, existing: 0, adopted: 0,
          families_created: 1, linked: 0, invited: 0, failed: 0 } } }))
    const onImported = vi.fn()
    render(<RosterImport orgId="org-1" orgName="Apogee" onImported={onImported} />)
    paste()
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }))
    await screen.findByText('Families')
    expect(api.post.mock.calls[0][0]).toBe('/api/sis/roster-import/preview')

    expect(screen.getByLabelText(/Email each new account/)).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Create 2 accounts at Apogee' }))
    await screen.findByText('Import complete')
    const [url, body] = api.post.mock.calls[1]
    expect(url).toBe('/api/sis/roster-import/commit')
    expect(body.send_emails).toBe(false)
    expect(onImported).toHaveBeenCalled()
  })
})
