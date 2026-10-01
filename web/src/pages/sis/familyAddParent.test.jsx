import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// vi.mock calls below are hoisted above these imports.
import FamilyDetailModal from './FamilyDetailModal'
import { withConfirm } from '../../tests/confirmTestUtils'

/**
 * Adding a parent a family has no Optio account for, from the family record.
 *
 * iCreate, 2026-09-30: a father wanted his own login next to his wife's, and
 * the office "wasn't sure how to make that happen" -- Add member only connects
 * an account the school already has.
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
    post: vi.fn(() => Promise.resolve({ data: { success: true, kind: 'invited', invite_sent: true } })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))


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
  fireEvent.click(screen.getByRole('button', { name: '+ Add a parent' }))
  return onSaved
}

describe('FamilyDetailModal - add a parent', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('sends name and email to the guardians endpoint and refreshes the family', async () => {
    const onSaved = openForm()
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Andrew' } })
    fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'Watson' } })
    fireEvent.change(screen.getByPlaceholderText('Their email address'), { target: { value: 'andrew@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add parent' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/households/h1/guardians', {
      first_name: 'Andrew', last_name: 'Watson', email: 'andrew@example.com', organization_id: 'org-1',
    }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('emailed them a link'))
  })

  it('refuses to send without an email', () => {
    openForm()
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Andrew' } })
    fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'Watson' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add parent' }))
    expect(api.post).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('An email address is required')
  })

  it('shows the backend refusal for an account outside the school', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { error: 'An Optio account already uses that email outside this school.' } } })
    openForm()
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Andrew' } })
    fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'Watson' } })
    fireEvent.change(screen.getByPlaceholderText('Their email address'), { target: { value: 'a@b.co' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add parent' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('An Optio account already uses that email outside this school.'))
  })
})
