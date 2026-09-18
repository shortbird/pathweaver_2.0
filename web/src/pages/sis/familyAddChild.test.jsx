import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Adding a child a family has no Optio account for, from the family record.
 *
 * iCreate, 2026-09-18: "We have a family that wants to add a child to their
 * registration they didn't initially add. Is there a way to add a person
 * manually on our end? ... we are not seeing it for Admins or CCs." They were
 * not missing it: Add member connects an account that already exists, the
 * registration funnel refuses a completed registration, and nothing in between
 * could create a child.
 */

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()), useNavigate: () => vi.fn(),
}))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'org_admin' } }),
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))

const { toast } = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: { success: true, kind: 'dependent' } })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import FamilyDetailModal from './FamilyDetailModal'
import { withConfirm, answerConfirm } from '../../tests/confirmTestUtils'

const HOUSEHOLD = {
  id: 'h1',
  name: 'Watson Family',
  members: [
    { user_id: 's1', name: 'Reece Watson', relationship: 'student' },
    { user_id: 'p1', name: 'Shelby Watson', relationship: 'guardian' },
  ],
}

const open = () => {
  const onSaved = vi.fn()
  rtlRender(withConfirm(
    <MemoryRouter>
      <FamilyDetailModal household={HOUSEHOLD} orgId="org-1" members={HOUSEHOLD.members}
        onClose={vi.fn()} onSaved={onSaved} />
    </MemoryRouter>,
  ))
  return onSaved
}

const openForm = () => {
  const onSaved = open()
  fireEvent.click(screen.getByRole('button', { name: '+ Add a child' }))
  return onSaved
}

const fill = ({ first = 'Nora', last = 'Watson', dob = '2019-04-19' } = {}) => {
  fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: first } })
  fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: last } })
  fireEvent.change(screen.getByLabelText(/Date of birth/i), { target: { value: dob } })
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(() => Promise.resolve({ data: {} }))
  api.post.mockImplementation(() => Promise.resolve({ data: { success: true, kind: 'dependent' } }))
})

describe('adding a child to an existing family', () => {
  it('offers the door beside the one that connects an existing account', () => {
    open()
    expect(screen.getByRole('button', { name: '+ Add a child' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add member' })).toBeInTheDocument()
  })

  it('creates the child under this family', async () => {
    const onSaved = openForm()
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Add child' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/api/sis/households/h1/children')
    expect(body).toMatchObject({
      first_name: 'Nora', last_name: 'Watson', date_of_birth: '2019-04-19',
      organization_id: 'org-1',
    })
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('says which kind of account is about to exist, before it does', () => {
    openForm()
    fill({ dob: '2019-04-19' })
    expect(screen.getByText(/a profile their parent manages/i)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Their own email address')).not.toBeInTheDocument()

    // 13+ is the teen's own login, so the form asks for the email that goes with it.
    fill({ dob: '2009-04-19' })
    expect(screen.getByPlaceholderText('Their own email address')).toBeInTheDocument()
    expect(screen.getByText(/their own Optio login/i)).toBeInTheDocument()
  })

  it('will not send a 13-plus child without their email', async () => {
    openForm()
    fill({ dob: '2009-04-19' })
    fireEvent.click(screen.getByRole('button', { name: 'Add child' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(api.post).not.toHaveBeenCalled()
  })

  it('asks before adding a child who looks like one already in the family', async () => {
    openForm()
    api.post.mockRejectedValueOnce({
      response: { data: { needs_confirmation: true, error: 'This family already includes Reece Watson' } },
    })
    fill({ first: 'Reece' })
    fireEvent.click(screen.getByRole('button', { name: 'Add child' }))
    await screen.findByText(/already includes Reece Watson/i)

    answerConfirm(true)
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(api.post.mock.calls[1][1]).toMatchObject({ confirm_duplicate: true })
  })

  it('leaves the family alone when the duplicate prompt is declined', async () => {
    openForm()
    api.post.mockRejectedValueOnce({
      response: { data: { needs_confirmation: true, error: 'This family already includes Reece Watson' } },
    })
    fill({ first: 'Reece' })
    fireEvent.click(screen.getByRole('button', { name: 'Add child' }))
    await screen.findByText(/already includes Reece Watson/i)

    answerConfirm(false)
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
  })
})
