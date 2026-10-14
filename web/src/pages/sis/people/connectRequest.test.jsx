import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import AddFamilyForm from './AddFamilyForm'
import AddChildForm from '../familyDetail/AddChildForm'
import ConnectRequestView from '../../ConnectRequestView'

/**
 * "Ask to connect" (ticket af8469aa).
 *
 * The add wizard used to stop at "already has an Optio account outside this
 * school. Email support". Now a platform account is offered a request to join,
 * sent from the same form, and the owner (or a minor's parent) accepts on the
 * invitation page. Nothing joins on the school's word alone.
 */

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../../services/api', () => ({ default: api }))
vi.mock('../../../services/authService', () => ({ default: { checkAuthStatus: vi.fn() } }))
vi.mock('../../../contexts/ConfirmContext', () => ({ useConfirm: () => () => Promise.resolve(true) }))
vi.mock('../useSisOrg', () => ({ useSisOrg: () => ({ orgId: 'org-1', activeOrg: { name: 'Apogee Cache Valley' } }) }))

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)
const typeInto = (label, value, index = 0) =>
  fireEvent.change(screen.getAllByLabelText(label)[index], { target: { value } })

const CONNECTABLE = (email, role, householdId = null) => ({
  response: { status: 409, data: { success: false, code: 'connectable',
    error: `${email} already has an Optio account. You can send them a request to join your school.`,
    connect: { email, role, household_id: householdId } } },
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Ask to connect from the add doors', () => {
  it('offers to ask a parent with a platform account, and sends the request', async () => {
    api.post.mockImplementation(async (url) => {
      if (url === '/api/sis/families') throw CONNECTABLE('dana@example.com', 'parent')
      return { data: { success: true, request_id: 'inv-1', sent_to: 'owner' } }
    })
    render(<AddFamilyForm orgId="org-1" onBack={vi.fn()} />)
    typeInto('First name', 'Dana')
    typeInto('Last name', 'Downs')
    typeInto('Email', 'dana@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create family' }))

    const prompt = await screen.findByTestId('connect-request-prompt')
    expect(prompt).toHaveTextContent('dana@example.com already has an Optio account')
    expect(prompt).toHaveTextContent('Send them a request to join Apogee Cache Valley')
    expect(screen.getByLabelText('Join as')).toHaveValue('parent')
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/connect-requests', {
      email: 'dana@example.com', role: 'parent', household_id: null, organization_id: 'org-1',
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('Request sent')
  })

  it('a teen on a family record is asked for that family', async () => {
    api.post.mockImplementation(async (url) => {
      if (url.endsWith('/children')) throw CONNECTABLE('tess@example.com', 'student', 'hh-1')
      return { data: { success: true, sent_to: 'parent' } }
    })
    const d = new Date()
    d.setFullYear(d.getFullYear() - 15)
    render(<AddChildForm householdId="hh-1" orgId="org-1" onDone={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Tess' } })
    fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'Downs' } })
    fireEvent.change(document.querySelector('input[type="date"]'), { target: { value: d.toISOString().slice(0, 10) } })
    fireEvent.change(screen.getByPlaceholderText('Their own email address'), { target: { value: 'tess@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add child' }))
    await screen.findByTestId('connect-request-prompt')
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(api.post).toHaveBeenLastCalledWith('/api/sis/connect-requests', {
      email: 'tess@example.com', role: 'student', household_id: 'hh-1', organization_id: 'org-1',
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('asked the parent')
  })

  it('an account at another school gets no offer', async () => {
    api.post.mockRejectedValue({ response: { status: 409, data: { success: false, code: 'other_school',
      error: 'dana@example.com belongs to an account at another school, so it cannot be added here.' } } })
    render(<AddFamilyForm orgId="org-1" onBack={vi.fn()} />)
    typeInto('First name', 'Dana')
    typeInto('Last name', 'Downs')
    typeInto('Email', 'dana@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create family' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('another school')
    expect(screen.queryByTestId('connect-request-prompt')).not.toBeInTheDocument()
  })
})

describe('The accept page for a connect request', () => {
  const INVITATION = { is_connect_request: true, for_parent: true, person_name: 'Tess Downs',
    role: 'student', organization: { name: 'Apogee Cache Valley' } }

  it('asks a signed-out visitor to sign in, and offers no Accept', () => {
    render(<ConnectRequestView code="c1" invitation={INVITATION} currentUser={null} />)
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?redirect=%2Finvitation%2Fc1')
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()
  })

  it('accepts as the signed-in account', async () => {
    api.post.mockResolvedValue({ data: { success: true, status: 'accepted' } })
    render(<ConnectRequestView code="c1" invitation={INVITATION} currentUser={{ id: 'mum-1' }} />)
    expect(screen.getByText(/add Tess Downs to the school on Optio as a student/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/connect-requests/c1/accept', {}))
    expect(await screen.findByText(/Tess Downs is now part of Apogee Cache Valley/)).toBeInTheDocument()
  })

  it('shows the refusal when the wrong account is signed in', async () => {
    api.post.mockRejectedValue({ response: { status: 403, data: {
      error: 'This request was sent to a different Optio account. Sign out, then sign in with the account the email went to.' } } })
    render(<ConnectRequestView code="c1" invitation={INVITATION} currentUser={{ id: 'someone' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('different Optio account')
  })
})
