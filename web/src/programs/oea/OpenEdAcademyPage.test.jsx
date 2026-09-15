import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

// The one family list every parent surface shares.
const fetchFamilyChildren = vi.fn()
vi.mock('../../hooks/api/useFamilyChildren', () => ({
  fetchFamilyChildren: (...args) => fetchFamilyChildren(...args),
}))

const enrollments = vi.fn()
const markHelpVideoOpened = vi.fn()
vi.mock('../../services/api', () => ({
  oeaAPI: {
    enrollments: (...args) => enrollments(...args),
    markHelpVideoOpened: (...args) => markHelpVideoOpened(...args),
  },
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
    fetchFamilyChildren.mockResolvedValue([{ id: 'stu-1', name: 'Ada Lovelace' }])
    enrollments.mockResolvedValue({ data: { enrollments: [] } })
    markHelpVideoOpened.mockResolvedValue({ data: { success: true } })
  })

  it('parent sees the management view with their students and no credits dashboard', async () => {
    authState = { user: { id: 'p-1' }, effectiveRole: 'parent' }
    renderPage()

    expect(screen.getByText('Welcome to Hearthwood Academy')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument())
    // The editable/read-only credits dashboard is not rendered in the parent landing.
    expect(screen.queryByTestId('credits-view')).not.toBeInTheDocument()
    // Parent never fetches their own credits as a student.
    expect(fetchFamilyChildren).toHaveBeenCalled()
  })

  it('student sees a read-only view of their own diploma', async () => {
    authState = { user: { id: 'stu-9', first_name: 'Grace' }, effectiveRole: 'student' }
    renderPage()

    expect(screen.getByText('My Hearthwood Academy diploma')).toBeInTheDocument()
    const view = screen.getByTestId('credits-view')
    expect(view).toHaveTextContent('read-only')
    // Students do not load the parent student list.
    expect(fetchFamilyChildren).not.toHaveBeenCalled()
  })

  it('records the open when a parent clicks through to the getting-started video', async () => {
    authState = { user: { id: 'p-1' }, effectiveRole: 'parent' }
    enrollments.mockResolvedValue({
      data: { enrollments: [], help_video_url: 'https://example.com/intro' },
    })
    renderPage()

    const link = await screen.findByText('New here? Watch the getting-started video')
    await userEvent.click(link)
    expect(markHelpVideoOpened).toHaveBeenCalledTimes(1)
  })

  it('a failed recording never blocks the video link', async () => {
    authState = { user: { id: 'p-1' }, effectiveRole: 'parent' }
    enrollments.mockResolvedValue({
      data: { enrollments: [], help_video_url: 'https://example.com/intro' },
    })
    markHelpVideoOpened.mockRejectedValue(new Error('offline'))
    renderPage()

    const link = await screen.findByText('New here? Watch the getting-started video')
    await userEvent.click(link)
    // The anchor still carries the href — the click is not intercepted.
    expect(link.closest('a')).toHaveAttribute('href', 'https://example.com/intro')
  })
})
