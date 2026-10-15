import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import StudentDetailModal from '../StudentDetailModal'
import { AuthContext } from '../../../contexts/AuthContext'

/**
 * The student record's Assigned teachers and Linked parents (2026-10-15).
 * Both were the web organization console's, which went
 * away when every org became an SIS org; the endpoints are the console's own.
 */

const { api, confirmFn } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  confirmFn: vi.fn(async () => true),
}))

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}?organization_id=${orgId}`,
}))
vi.mock('../../../contexts/ConfirmContext', () => ({ useConfirm: () => confirmFn }))
vi.mock('../../../utils/appSurface', () => ({
  switchSurfaceInApp: vi.fn(), getLearningOrigin: () => 'https://app.test',
}))
// A plain select stands in for the search picker.
vi.mock('../../../components/ui/SearchSelect', () => ({
  default: ({ value, onChange, options, getId, getLabel, placeholder }) => (
    <select aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {options.map((o) => <option key={getId(o)} value={getId(o)}>{getLabel(o)}</option>)}
    </select>
  ),
}))
vi.mock('../../../contexts/AuthContext', async () => {
  const R = await import('react')
  return { AuthContext: R.createContext(null) }
})
vi.mock('../../../services/api', () => ({ default: api }))

const ADMIN = { id: 'molly', role: 'org_managed', org_roles: ['org_admin'] }
const COORDINATOR = { id: 'kate', role: 'org_managed', org_roles: ['campus_coordinator'] }
const TEACHER = { id: 'tess', role: 'org_managed', org_roles: ['advisor'] }

const STUDENT = { student_id: 'kid-1', name: 'Ava Watson', is_student: true, roles: ['student'],
  email: 'ava@school.org', username: null, is_dependent: false }

const ROSTER = [
  { student_id: 't-1', name: 'Tom Teacher', roles: ['advisor'], is_student: false },
  { student_id: 't-2', name: 'Pat ParentTeacher', roles: ['parent', 'advisor'], is_student: false },
  { student_id: 'p-1', name: 'Paula Parent', roles: ['parent'], is_student: false },
]

const render = (viewer, person = STUDENT) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={{ user: viewer }}>
        <StudentDetailModal student={person} orgId="org-1" onClose={vi.fn()} onSaved={vi.fn()} />
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  confirmFn.mockResolvedValue(true)
  api.get.mockImplementation(async (url) => {
    if (url.includes('/api/sis/roster')) return { data: { roster: ROSTER } }
    if (url.endsWith('/students/kid-1/advisors')) {
      return { data: { advisors: [{ advisor_id: 't-1', display_name: 'Tom Teacher', email: 'tom@s.org' }] } }
    }
    if (url.includes('/parent-connections/links')) {
      return { data: { links: [{ id: 'link-1', parent: { first_name: 'Paula', last_name: 'Parent', email: 'p@x.org' } }] } }
    }
    return { data: {} }
  })
  api.post.mockResolvedValue({ data: { success: true } })
  api.delete.mockResolvedValue({ data: { success: true } })
})

describe('Assigned teachers', () => {
  it("lists the student's teachers and offers only teachers not already assigned", async () => {
    render(ADMIN)
    const section = await screen.findByTestId('assigned-teachers')
    expect(await within(section).findByText('Tom Teacher')).toBeInTheDocument()
    const picker = await within(section).findByLabelText('Search teachers…')
    const options = within(picker).getAllByRole('option').map((o) => o.textContent)
    // A teacher who is also a parent is still a teacher; a parent is not.
    expect(options).toEqual(['—', 'Pat ParentTeacher'])
  })

  it('assigns through the console endpoint', async () => {
    render(ADMIN)
    const section = await screen.findByTestId('assigned-teachers')
    fireEvent.change(await within(section).findByLabelText('Search teachers…'), { target: { value: 't-2' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Assign' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/admin/organizations/org-1/advisors/t-2/students', { student_id: 'kid-1' }))
  })

  it('removes after a confirm', async () => {
    render(ADMIN)
    const section = await screen.findByTestId('assigned-teachers')
    fireEvent.click(await within(section).findByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      '/api/admin/organizations/org-1/advisors/t-1/students/kid-1'))
  })

  it('is not shown to a teacher', async () => {
    render(TEACHER)
    await screen.findByText('Ava Watson')
    expect(screen.queryByTestId('assigned-teachers')).not.toBeInTheDocument()
    expect(screen.queryByTestId('linked-parents')).not.toBeInTheDocument()
  })
})

describe('Linked parents', () => {
  it("reads only this student's links and disconnects one", async () => {
    render(COORDINATOR)
    const section = await screen.findByTestId('linked-parents')
    expect(api.get).toHaveBeenCalledWith(
      '/api/admin/organizations/org-1/parent-connections/links?student_id=kid-1')
    expect(await within(section).findByText('Paula Parent')).toBeInTheDocument()
    fireEvent.click(within(section).getByRole('button', { name: 'Disconnect' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      '/api/admin/organizations/org-1/parent-connections/links/link-1'))
  })

  it('does nothing when the confirm is declined', async () => {
    confirmFn.mockResolvedValue(false)
    render(ADMIN)
    const section = await screen.findByTestId('linked-parents')
    fireEvent.click(await within(section).findByRole('button', { name: 'Disconnect' }))
    await waitFor(() => expect(confirmFn).toHaveBeenCalled())
    expect(api.delete).not.toHaveBeenCalled()
  })
})
