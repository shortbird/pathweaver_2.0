import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { ReprintLoginCardsModal, BulkUsernamesForm, parseNames, hasUsernameSignIn } from './LoginCards'
import SignUpLinks from './SignUpLinks'
import AddPeopleWizard from './AddPeopleWizard'
import { AuthContext } from '../../../contexts/AuthContext'

/**
 * Login cards, sign-up links and the add wizard's new doors (2026-10-15),
 * moved from the web organization console when every org became an SIS org.
 *
 * The login address is the point of more than one test here: the console
 * built it from window.location.origin, which on the SIS host printed cards
 * pointing at a page that does not exist there.
 */

const { api, printCards, authUser } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  printCards: vi.fn(),
  authUser: { current: { id: 'molly', role: 'org_managed', org_roles: ['org_admin'] } },
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../../services/api', () => ({ default: api }))
vi.mock('../../../contexts/ConfirmContext', () => ({ useConfirm: () => async () => true }))
vi.mock('../../../contexts/AuthContext', async () => {
  const R = await import('react')
  return { AuthContext: R.createContext(null), useAuth: () => ({ user: authUser.current }) }
})
vi.mock('../../../utils/appSurface', () => ({
  getLearningOrigin: () => 'https://app.test', switchSurfaceInApp: vi.fn(), learningSurfaceHref: (p) => p,
}))
vi.mock('../../../utils/credentialCardsPrinter', () => ({ printCredentialCards: printCards }))
vi.mock('../../../components/admin/BulkUserImport', () => ({
  default: ({ organizationId }) => <div data-testid="csv-import">csv for {organizationId}</div>,
}))

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={{ user: authUser.current }}>{ui}</AuthContext.Provider>
    </QueryClientProvider>,
  )
}

const ROWS = [
  { student_id: 's-1', name: 'Ava Watson', username: 'avaw', is_student: true },
  { student_id: 's-2', name: 'Ben Bee', username: 'benb', is_student: true },
  { student_id: 's-3', name: 'Cy Sea', username: 'cys', is_student: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  authUser.current = { id: 'molly', role: 'org_managed', org_roles: ['org_admin'] }
})

describe('Reprint login cards', () => {
  it('makes new passwords for the chosen students only, and names who was skipped', async () => {
    api.post.mockResolvedValue({ data: {
      results: [{ user_id: 's-1', name: 'Ava Watson', username: 'avaw', password: '1234apple' }],
      failed: [],
    } })
    render(<ReprintLoginCardsModal rows={ROWS} orgId="org-1" orgName="Apogee" orgSlug="apogee" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Ava Watson/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Ben Bee/ }))
    fireEvent.click(screen.getByRole('button', { name: 'New passwords for 2' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/admin/organizations/org-1/users/bulk-reset-passwords', { user_ids: ['s-1', 's-2'] }))
    const results = await screen.findByTestId('login-card-results')
    expect(within(results).getByText('avaw / 1234apple')).toBeInTheDocument()
    // The server skipped Ben without saying so; the page says so.
    expect(within(results).getByRole('alert')).toHaveTextContent('Ben Bee')
    expect(within(results).getByText('https://app.test/login/apogee')).toBeInTheDocument()
    fireEvent.click(within(results).getByRole('button', { name: 'Print login cards' }))
    expect(printCards).toHaveBeenCalledWith(expect.objectContaining({ loginUrl: 'https://app.test/login/apogee' }))
  })

  it('choose all picks every row', () => {
    render(<ReprintLoginCardsModal rows={ROWS} orgId="org-1" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Choose all (3)' }))
    expect(screen.getByRole('button', { name: 'New passwords for 3' })).toBeEnabled()
  })

  it('counts only username students with no email', () => {
    expect(hasUsernameSignIn({ is_student: true, username: 'a', email: null })).toBe(true)
    expect(hasUsernameSignIn({ is_student: true, username: 'a', email: 'a@b.c' })).toBe(false)
    expect(hasUsernameSignIn({ is_student: true, username: null })).toBe(false)
    expect(hasUsernameSignIn({ is_student: false, username: 'a' })).toBe(false)
  })
})

describe('Many students, no email', () => {
  it('reads one name per line', () => {
    expect(parseNames('Maya Jones\n\n  Liam van Smith \nOlivia,Nguyen')).toEqual([
      { first_name: 'Maya', last_name: 'Jones' },
      { first_name: 'Liam', last_name: 'van Smith' },
      { first_name: 'Olivia', last_name: 'Nguyen' },
    ])
  })

  it('refuses a line with no last name before calling the server', () => {
    render(<BulkUsernamesForm orgId="org-1" onBack={vi.fn()} onDone={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Student names'), { target: { value: 'Maya Jones\nLiam' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make 2 accounts' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Line 2')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('makes the accounts and prints cards at the learning app address', async () => {
    const onCreated = vi.fn()
    api.post.mockResolvedValue({ data: { organization_slug: 'apogee', results: [
      { row: 1, name: 'Maya Jones', status: 'created', username: 'mayaj', password: '1234apple', user_id: 'u1' },
      { row: 2, name: 'Liam Smith', status: 'failed', error: 'Username taken' },
    ] } })
    render(<BulkUsernamesForm orgId="org-1" orgName="Apogee" onBack={vi.fn()} onDone={vi.fn()} onCreated={onCreated} />)
    fireEvent.change(screen.getByLabelText('Student names'), { target: { value: 'Maya Jones\nLiam Smith' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make 2 accounts' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/admin/organizations/org-1/users/bulk-create-username',
      { students: [{ first_name: 'Maya', last_name: 'Jones' }, { first_name: 'Liam', last_name: 'Smith' }], org_role: 'student' }))
    const results = await screen.findByTestId('login-card-results')
    expect(within(results).getByText('mayaj / 1234apple')).toBeInTheDocument()
    expect(within(results).getByRole('alert')).toHaveTextContent('Liam Smith (Username taken)')
    expect(within(results).getByText('https://app.test/login/apogee')).toBeInTheDocument()
    expect(onCreated).toHaveBeenCalled()
  })

  it('shows the per-line errors when the server refuses the batch', async () => {
    api.post.mockRejectedValue({ response: { data: { validation_errors: [{ row: 1, name: 'Maya Jones', errors: ['bad'] }] } } })
    render(<BulkUsernamesForm orgId="org-1" onBack={vi.fn()} onDone={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Student names'), { target: { value: 'Maya Jones' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make 1 account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Line 1 (Maya Jones): bad')
  })
})

describe('Sign-up links', () => {
  beforeEach(() => {
    api.get.mockImplementation(async (url) => {
      if (url.endsWith('/invitations/links')) {
        return { data: { links: [
          { role: 'advisor', invitation_code: 'ccc' },
          { role: 'student', invitation_code: 'aaa' },
          { role: 'parent', invitation_code: 'bbb' },
        ] } }
      }
      if (url.includes('/invitations?status=pending')) {
        return { data: { invitations: [
          { id: 'i-1', email: 'new@teacher.org', role: 'advisor', expires_at: '2026-11-01T00:00:00Z' },
          { id: 'i-2', email: 'link-invite-abc@pending.optio.local', role: 'student' },
        ] } }
      }
      return { data: {} }
    })
    api.delete.mockResolvedValue({ data: {} })
  })

  it('shows one learning-app link per role, students first', async () => {
    render(<SignUpLinks orgId="org-1" />)
    const list = await screen.findByRole('list', { name: 'Sign-up links' })
    const rows = within(list).getAllByRole('listitem').map((li) => li.textContent)
    expect(rows[0]).toContain('Students')
    expect(rows[0]).toContain('https://app.test/invitation/aaa')
    expect(rows[2]).toContain('Teachers')
  })

  it('lists people invited by email, not the standing links, and cancels one', async () => {
    render(<SignUpLinks orgId="org-1" />)
    const list = await screen.findByRole('list', { name: 'Waiting email invitations' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    fireEvent.click(within(list).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/admin/organizations/org-1/invitations/i-1'))
  })
})

describe('The add wizard', () => {
  const wizard = () => render(<AddPeopleWizard orgId="org-1" orgName="Apogee" onClose={vi.fn()} onChanged={vi.fn()} />)

  it('offers the moved doors to an org admin', () => {
    wizard()
    expect(screen.getByRole('button', { name: /Many students, no email/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /People with roles \(CSV\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sign-up links/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /People with roles \(CSV\)/ }))
    expect(screen.getByTestId('csv-import')).toHaveTextContent('csv for org-1')
  })

  it('keeps the CSV import (which can make admins) from a campus coordinator', () => {
    authUser.current = { id: 'kate', role: 'org_managed', org_roles: ['campus_coordinator'] }
    wizard()
    expect(screen.getByRole('button', { name: /Many students, no email/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /People with roles \(CSV\)/ })).not.toBeInTheDocument()
  })
})
