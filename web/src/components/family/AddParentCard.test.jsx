/**
 * Parent link requests on the web: the student's card and the parent's
 * landing page. What matters is that a student with no parent finds a way to
 * ask, a school's student does not (the school links families), and the
 * parent can only accept while signed in as the invited address.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AddParentCard from './AddParentCard'
import ParentLinkAcceptPage from '../../pages/ParentLinkAcceptPage'

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))
const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))
let authState = { isAuthenticated: false, loading: false, user: null }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))

const ok = (data) => Promise.resolve({ data: { success: true, data } })

beforeEach(() => {
  vi.clearAllMocks()
  authState = { isAuthenticated: false, loading: false, user: null }
})

describe('AddParentCard', () => {
  it('lets a student with no parent send a request', async () => {
    api.get.mockReturnValueOnce(ok({ state: 'available', parents: [], request: null }))
      .mockReturnValueOnce(ok({ state: 'available', parents: [], request: { status: 'invited', parent_email: 'mom@example.com' } }))
    api.post.mockReturnValue(ok({ id: 'r1' }))
    render(<AddParentCard />)

    await userEvent.type(await screen.findByLabelText(/parent.s email address/i), 'mom@example.com')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))

    expect(api.post).toHaveBeenCalledWith('/api/parent-link-requests', { parent_email: 'mom@example.com' })
    expect(await screen.findByText(/we emailed/i)).toBeInTheDocument()
  })

  it('names the linked parent instead of offering the form', async () => {
    api.get.mockReturnValue(ok({ state: 'has_parent', parents: [{ id: 'p', name: 'Sarah Towns' }], request: null }))
    render(<AddParentCard />)
    expect(await screen.findByText('Sarah Towns')).toBeInTheDocument()
    expect(screen.queryByLabelText(/parent.s email address/i)).toBeNull()
  })

  it("renders nothing for a school's student", async () => {
    api.get.mockReturnValue(ok({ state: 'school', parents: [], request: null }))
    const { container } = render(<AddParentCard />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})

const renderAccept = () => render(
  <MemoryRouter initialEntries={['/parent-link/tok123']}>
    <Routes><Route path="/parent-link/:token" element={<ParentLinkAcceptPage />} /></Routes>
  </MemoryRouter>
)

describe('ParentLinkAcceptPage', () => {
  it('sends a signed-out parent to sign in and come back', async () => {
    api.get.mockReturnValue(ok({ student_name: 'Elanor', parent_email: 'mom@example.com', status: 'invited' }))
    renderAccept()
    const signIn = await screen.findByRole('link', { name: /sign in/i })
    expect(signIn).toHaveAttribute('href', `/login?redirect=${encodeURIComponent('/parent-link/tok123')}`)
    expect(screen.getByText('mom@example.com')).toBeInTheDocument()
  })

  it('accepts for the invited address', async () => {
    authState = { isAuthenticated: true, loading: false, user: { email: 'Mom@Example.com' } }
    api.get.mockReturnValue(ok({ student_name: 'Elanor', parent_email: 'mom@example.com', status: 'invited' }))
    api.post.mockReturnValue(ok({ status: 'accepted' }))
    renderAccept()

    await userEvent.click(await screen.findByRole('button', { name: /i am elanor.s parent/i }))
    expect(api.post).toHaveBeenCalledWith('/api/parent-link-requests/invite/tok123/accept', {})
    expect(await screen.findByText(/optio will check and confirm/i)).toBeInTheDocument()
  })

  it('offers no accept button to a different account', async () => {
    authState = { isAuthenticated: true, loading: false, user: { email: 'kid@example.com' } }
    api.get.mockReturnValue(ok({ student_name: 'Elanor', parent_email: 'mom@example.com', status: 'invited' }))
    renderAccept()
    expect(await screen.findByText(/you are signed in as kid@example.com/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /parent or guardian/i })).toBeNull()
  })
})
