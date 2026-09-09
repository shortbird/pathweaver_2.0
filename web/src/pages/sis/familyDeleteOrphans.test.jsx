import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Deleting a family leaves the people it grouped behind, and says so afterwards.
 *
 * iCreate, 2026-09-01: "once I delete a family...how can I delete the children?
 * I deleted 'Tester' family but now the kids still show and I don't know how to
 * remove them from certain reports (like allergies)..."
 *
 * The pre-delete dialog has explained this since July, which is the wrong
 * moment: it is read while deciding to delete, not an hour later when the
 * allergy report still lists two children. The names come back from the DELETE
 * now, and the offer is to go and deal with them.
 */

const navigate = vi.fn()
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()), useNavigate: () => navigate,
}))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'org_admin' } }),
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

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

const HOUSEHOLD = { id: 'h1', name: 'Tester Family', members: [] }

const open = () => rtlRender(withConfirm(
  <MemoryRouter>
    <FamilyDetailModal household={HOUSEHOLD} orgId="org-1" members={[]}
      onClose={vi.fn()} onSaved={vi.fn()} />
  </MemoryRouter>,
))

const ORPHANS = [
  { id: 's1', name: 'Ada Tester', role: 'student' },
  { id: 's2', name: 'Blaise Tester', role: 'student' },
]

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(() => Promise.resolve({ data: {} }))
})

describe('deleting a family', () => {
  it('names the accounts it left behind and offers to go and remove them', async () => {
    api.delete.mockResolvedValue({ data: { success: true, orphaned_members: ORPHANS } })
    open()

    fireEvent.click(screen.getByRole('button', { name: 'Delete family' }))
    await answerConfirm()   // yes, delete the family
    await waitFor(() => expect(api.delete).toHaveBeenCalled())

    const text = await confirmText()
    expect(text).toContain('Ada Tester, Blaise Tester')
    expect(text).toMatch(/still have an account at the school/i)
    expect(text).toMatch(/why they still appear on rosters and reports/i)

    await answerConfirm()
    // People › Everyone, with the family's name already in the search box.
    expect(navigate).toHaveBeenCalledWith('/people?q=Tester%20Family')
  })

  it('stays put when the admin says no', async () => {
    api.delete.mockResolvedValue({ data: { success: true, orphaned_members: ORPHANS } })
    open()

    fireEvent.click(screen.getByRole('button', { name: 'Delete family' }))
    await answerConfirm()
    await waitFor(() => expect(api.delete).toHaveBeenCalled())
    await answerConfirm(false)

    expect(navigate).not.toHaveBeenCalled()
  })

  it('says nothing more when the family had nobody in it', async () => {
    api.delete.mockResolvedValue({ data: { success: true, orphaned_members: [] } })
    open()

    fireEvent.click(screen.getByRole('button', { name: 'Delete family' }))
    await answerConfirm()
    await waitFor(() => expect(api.delete).toHaveBeenCalled())

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(navigate).not.toHaveBeenCalled()
  })
})
