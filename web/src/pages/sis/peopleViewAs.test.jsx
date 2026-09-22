import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * People › "View as student" for an org admin.
 *
 * iCreate, 2026-09-04 (455ffaf6): "Can you make it so we can view as students
 * as well so we can see what a given student is able to see? I am trying to
 * discover if students can actually see what teachers post in the student
 * chat." The backend had allowed an org admin to open a non-admin member of
 * their own school since August (token_authority.caller_may_masquerade); the
 * roster's menu item was still gated to superadmin, so the school that asked
 * could not see it.
 */

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const ROSTER = [
  { student_id: 's1', name: 'Ryder Swenson', first_name: 'Ryder', last_name: 'Swenson',
    is_student: true, role: 'student', roles: ['student'], age: 9,
    enrollment_status: 'enrolled', household_name: null, total_xp: 40 },
  { student_id: 'p1', name: 'Erin Swenson', first_name: 'Erin', last_name: 'Swenson',
    is_student: false, role: 'parent', roles: ['parent'], age: null,
    enrollment_status: null, household_name: null, total_xp: 0 },
]

const { api, sisOrg, masquerade, surface } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  sisOrg: { orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, canViewAs: true },
  masquerade: { startMasquerade: vi.fn(() => Promise.resolve({ success: true })) },
  surface: { switchSurfaceInApp: vi.fn() },
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({ useSisOrg: () => sisOrg, withOrg: (p) => p }))
vi.mock('./StudentDetailModal', () => ({ default: () => <div /> }))
vi.mock('./FamilyDetailModal', () => ({ default: () => <div /> }))
vi.mock('./teacherPreview', () => ({ setPreviewTeacher: vi.fn(), getPreviewTeacher: () => null }))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => () => Promise.resolve(true) }))
vi.mock('../../components/sis/SisNewUserModal', () => ({ default: () => <div /> }))
vi.mock('../../services/masqueradeService', () => masquerade)
vi.mock('../../utils/appSurface', () => surface)
vi.mock('../../services/api', () => ({ default: api }))

import PeoplePage from './PeoplePage'

const openMenu = async (rowName) => {
  render(<PeoplePage />)
  await screen.findByText(rowName)
  const row = screen.getByText(rowName).closest('tr')
  // Clicking the row opens the actions, since 2026-09-22. The per-row menu
  // and its column are gone.
  fireEvent.click(row)
}

beforeEach(() => {
  vi.clearAllMocks()
  sisOrg.canViewAs = true
  api.get.mockResolvedValue({ data: { roster: ROSTER } })
})

describe('View as student on the roster', () => {
  it('is offered to an org admin on a student row', async () => {
    await openMenu('Ryder Swenson')
    expect(screen.getByText('View as student')).toBeInTheDocument()
  })

  it('opens the student account on the web platform', async () => {
    await openMenu('Ryder Swenson')
    fireEvent.click(screen.getByText('View as student'))
    await waitFor(() => expect(masquerade.startMasquerade).toHaveBeenCalledWith('s1', 'SIS admin view', api))
    expect(surface.switchSurfaceInApp).toHaveBeenCalledWith('learning', '/dashboard')
  })

  it('is never offered on a guardian row', async () => {
    await openMenu('Erin Swenson')
    expect(screen.queryByText('View as student')).not.toBeInTheDocument()
  })

  it('stays hidden for someone the backend would refuse (a coordinator)', async () => {
    sisOrg.canViewAs = false
    await openMenu('Ryder Swenson')
    expect(screen.queryByText('View as student')).not.toBeInTheDocument()
  })
})
