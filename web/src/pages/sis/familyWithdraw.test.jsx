import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Withdrawing a family from the school, from the family record.
 *
 * iCreate, 2026-09-08 (e40080a8): "Trying to unenroll family. But the
 * instructions don't explain how to do it" -- filed after opening Delete
 * family and cancelling it three times. Withdrawing was one person at a time
 * on People > Everyone, and nothing on the family record pointed there. The
 * record now does it for every student in the family, and says what stays.
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
    post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import FamilyDetailModal from './FamilyDetailModal'
import { withConfirm, answerConfirm, confirmText } from '../../tests/confirmTestUtils'

const MEMBERS = [
  { user_id: 's1', name: 'Ada Tester', relationship: 'student' },
  { user_id: 's2', name: 'Blaise Tester', relationship: 'student' },
  { user_id: 'p1', name: 'Erin Tester', relationship: 'guardian' },
]
const HOUSEHOLD = { id: 'h1', name: 'Tester Family', members: MEMBERS }

const open = (household = HOUSEHOLD) => {
  const onSaved = vi.fn()
  rtlRender(withConfirm(
    <MemoryRouter>
      <FamilyDetailModal household={household} orgId="org-1" members={household.members}
        onClose={vi.fn()} onSaved={onSaved} />
    </MemoryRouter>,
  ))
  return onSaved
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(() => Promise.resolve({ data: {} }))
})

describe('withdrawing a family', () => {
  it('names the students it will withdraw and says what stays', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw from school' }))
    const text = await confirmText()
    expect(text).toContain('Ada Tester, Blaise Tester')
    expect(text).not.toContain('Erin Tester')
    expect(text).toMatch(/class seats are freed/i)
    expect(text).toMatch(/family record and all history stay/i)
  })

  it('posts the withdrawal and reports who was withdrawn', async () => {
    api.post.mockResolvedValue({ data: { success: true, already: [],
      withdrawn: [{ id: 's1', name: 'Ada Tester', seats_released: 3 },
                  { id: 's2', name: 'Blaise Tester', seats_released: 0 }] } })
    const onSaved = open()
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw from school' }))
    await answerConfirm()
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/households/h1/withdraw', { organization_id: 'org-1' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Ada Tester, Blaise Tester withdrawn'))
    expect(onSaved).toHaveBeenCalled()
  })

  it('does nothing when the admin cancels', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw from school' }))
    await answerConfirm(false)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('says so when the family was already withdrawn, instead of claiming a second withdrawal', async () => {
    api.post.mockResolvedValue({ data: { success: true, withdrawn: [], already: ['Ada Tester', 'Blaise Tester'] } })
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw from school' }))
    await answerConfirm()
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Ada Tester, Blaise Tester were already withdrawn'))
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('keeps Delete family as a separate act, labelled for duplicates', () => {
    open()
    expect(screen.getByRole('button', { name: 'Delete family' })).toBeInTheDocument()
    expect(screen.getByText(/for a duplicate or a mistake/i)).toBeInTheDocument()
  })
})
