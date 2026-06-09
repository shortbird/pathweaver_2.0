import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OpenEdAcademyPage from './OpenEdAcademyPage'

let authState = {}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const getMyDependents = vi.fn()
vi.mock('../../services/dependentAPI', () => ({
  getMyDependents: (...args) => getMyDependents(...args),
}))

const enrollments = vi.fn()
const getMyChildren = vi.fn()
vi.mock('../../services/api', () => ({
  oeaAPI: { enrollments: (...args) => enrollments(...args) },
  parentAPI: { getMyChildren: (...args) => getMyChildren(...args) },
}))

// Mock the credits dashboard so its own fetch doesn't run; surface the readOnly
// prop so we can assert the student view is read-only.
vi.mock('./OEACreditsView', () => ({
  default: ({ readOnly }) => (
    <div data-testid="credits-view">{readOnly ? 'read-only' : 'editable'}</div>
  ),
}))

const renderPage = () =>
  render(
    <MemoryRouter>
      <OpenEdAcademyPage />
    </MemoryRouter>
  )

describe('OpenEdAcademyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMyDependents.mockResolvedValue({ dependents: [{ id: 'stu-1', display_name: 'Ada Lovelace' }] })
    getMyChildren.mockResolvedValue({ data: { children: [] } })
    enrollments.mockResolvedValue({ data: { enrollments: [] } })
  })

  it('parent sees the management view with their students and no credits dashboard', async () => {
    authState = { user: { id: 'p-1' }, effectiveRole: 'parent' }
    renderPage()

    expect(screen.getByText('Welcome to OpenEd Academy')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument())
    // The editable/read-only credits dashboard is not rendered in the parent landing.
    expect(screen.queryByTestId('credits-view')).not.toBeInTheDocument()
    // Parent never fetches their own credits as a student.
    expect(getMyDependents).toHaveBeenCalled()
  })

  it('student sees a read-only view of their own diploma', async () => {
    authState = { user: { id: 'stu-9', first_name: 'Grace' }, effectiveRole: 'student' }
    renderPage()

    expect(screen.getByText('My OpenEd Academy diploma')).toBeInTheDocument()
    const view = screen.getByTestId('credits-view')
    expect(view).toHaveTextContent('read-only')
    // Students do not load the parent student list.
    expect(getMyDependents).not.toHaveBeenCalled()
  })
})
