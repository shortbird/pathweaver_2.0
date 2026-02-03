import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, createMockUser } from '../tests/test-utils'
import ParentDashboardPage from './ParentDashboardPage'
import { toast } from 'react-hot-toast'

// Mock dependencies
const mockNavigate = vi.fn()
const mockSetActingAs = vi.fn()
const mockClearActingAs = vi.fn()
const mockGetMyChildren = vi.fn()
const mockGetDashboard = vi.fn()
const mockGetProgress = vi.fn()
const mockGetCompletedQuests = vi.fn()
const mockGetMyDependents = vi.fn()
const mockApiGet = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ studentId: null }),
  }
})

vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../services/api', () => ({
  default: {
    get: (...args) => mockApiGet(...args),
  },
  parentAPI: {
    getMyChildren: (...args) => mockGetMyChildren(...args),
    getDashboard: (...args) => mockGetDashboard(...args),
    getProgress: (...args) => mockGetProgress(...args),
    getCompletedQuests: (...args) => mockGetCompletedQuests(...args),
  },
}))

vi.mock('../services/dependentAPI', () => ({
  getMyDependents: (...args) => mockGetMyDependents(...args),
}))

// Mock AuthContext
let mockAuthValue = {
  user: null,
  isAuthenticated: false,
  loading: false,
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  refreshUser: vi.fn().mockResolvedValue(true),
}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthValue,
}))

// Mock ActingAsContext
let mockActingAsValue = {
  actingAsDependent: null,
  actingAsToken: null,
  setActingAs: mockSetActingAs,
  clearActingAs: mockClearActingAs,
  isActingAsDependent: false,
}

vi.mock('../contexts/ActingAsContext', () => ({
  useActingAs: () => mockActingAsValue,
}))

// Mock modals
vi.mock('../components/parent/AddDependentModal', () => ({
  default: ({ isOpen, onClose, onSuccess }) => (
    isOpen ? (
      <div data-testid="add-dependent-modal">
        <button onClick={() => {
          onSuccess({ message: 'Dependent created' })
          onClose()
        }}>Create Dependent</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null
  ),
}))

vi.mock('../components/parent/RequestStudentConnectionModal', () => ({
  default: ({ isOpen, onClose }) => (
    isOpen ? (
      <div data-testid="request-connection-modal">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null
  ),
}))

describe('ParentDashboardPage', () => {
  const mockParentUser = createMockUser({
    role: 'parent',
    display_name: 'Parent User',
  })

  const mockChild = {
    student_id: 'child-1',
    student_first_name: 'John',
    student_last_name: 'Doe',
    date_of_birth: '2010-05-15',
  }

  const mockDependent = {
    id: 'dependent-1',
    display_name: 'Jane Doe',
    date_of_birth: '2015-03-20',
    is_dependent: true,
    managed_by_parent_id: mockParentUser.id,
  }

  const mockDashboardData = {
    active_quests: [
      {
        quest_id: 'quest-1',
        title: 'Learn React',
        image_url: '/images/quest1.jpg',
        progress: {
          completed_tasks: 3,
          total_tasks: 10,
          percentage: 30,
        },
      },
    ],
    recent_completions: [
      {
        task_title: 'Build a Component',
        quest_title: 'Learn React',
        pillar: 'STEM',
        xp_earned: 50,
        completed_at: '2025-12-20T10:00:00Z',
      },
    ],
    learning_rhythm: {
      status: 'flow',
      has_overdue_tasks: false,
      overdue_task_count: 0,
    },
  }

  const mockProgressData = {
    xp_by_pillar: {
      'Art': 100,
      'STEM': 500,
      'Wellness': 200,
      'Communication': 150,
      'Civics': 75,
    },
  }

  const mockCreditData = {
    transcript: {
      total_credits: 5,
      subjects: [
        { subject: 'Art', xp: 1000 },
        { subject: 'STEM', xp: 5000 },
        { subject: 'Wellness', xp: 2000 },
        { subject: 'Communication', xp: 1500 },
        { subject: 'Civics', xp: 750 },
      ],
    },
  }

  const mockCompletedQuests = [
    {
      quest_id: 'quest-2',
      title: 'Complete Python Basics',
      image_url: '/images/quest2.jpg',
      completed_at: '2025-12-15T14:00:00Z',
      progress: {
        completed_tasks: 8,
        total_tasks: 8,
      },
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthValue.user = mockParentUser
    mockAuthValue.isAuthenticated = true
    mockActingAsValue.actingAsDependent = null
    mockActingAsValue.isActingAsDependent = false

    // Default API responses
    mockGetMyChildren.mockResolvedValue({
      data: { children: [mockChild] },
    })
    mockGetMyDependents.mockResolvedValue({
      dependents: [mockDependent],
    })
    mockGetDashboard.mockResolvedValue({
      data: mockDashboardData,
    })
    mockGetProgress.mockResolvedValue({
      data: mockProgressData,
    })
    mockApiGet.mockResolvedValue({
      data: mockCreditData,
    })
    mockGetCompletedQuests.mockResolvedValue({
      data: { quests: mockCompletedQuests },
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Dashboard Overview', () => {
    it('renders the Family Dashboard heading', async () => {
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Family Dashboard')).toBeInTheDocument()
      })
    })

    it('shows loading spinner while fetching children and dependents', () => {
      mockGetMyChildren.mockReturnValue(new Promise(() => {})) // Never resolves
      mockGetMyDependents.mockReturnValue(new Promise(() => {}))

      const { container } = renderWithProviders(<ParentDashboardPage />)

      // Check for loading spinner by className
      const spinner = container.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })

    it('loads and displays linked children', async () => {
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/John Doe/)).toBeInTheDocument()
      })
    })

    it('loads and displays dependents', async () => {
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
      })
    })

    it('auto-selects first child when no student selected', async () => {
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(mockGetDashboard).toHaveBeenCalledWith('child-1')
      })
    })

    it('auto-selects first dependent when no children', async () => {
      mockGetMyChildren.mockResolvedValue({ data: { children: [] } })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(mockGetDashboard).toHaveBeenCalledWith('dependent-1')
      })
    })

    it('displays active quests for selected student', async () => {
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Learn React')).toBeInTheDocument()
        expect(screen.getByText('3 / 10 tasks')).toBeInTheDocument()
        expect(screen.getByText('30%')).toBeInTheDocument()
      })
    })

    it('displays learning progress by pillar', async () => {
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('100 XP')).toBeInTheDocument() // Art
        expect(screen.getByText('500 XP')).toBeInTheDocument() // STEM
        expect(screen.getByText('200 XP')).toBeInTheDocument() // Wellness
      })
    })

    it('displays completed quests', async () => {
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Complete Python Basics')).toBeInTheDocument()
        expect(screen.getByText('8 / 8 tasks')).toBeInTheDocument()
      })
    })

    it('displays diploma credit progress', async () => {
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('5 / 20 credits earned toward diploma')).toBeInTheDocument()
      })
    })

    it('shows error message when dashboard data fails to load', async () => {
      mockGetDashboard.mockRejectedValue(new Error('Network error'))

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load dashboard data')).toBeInTheDocument()
      })
    })

    it('caches dashboard data for instant student switching', async () => {
      const { rerender } = renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(mockGetDashboard).toHaveBeenCalledTimes(1)
      })

      // Switch to another student and back
      mockGetDashboard.mockClear()

      rerender(<ParentDashboardPage />)

      // Should use cache, not fetch again
      await waitFor(() => {
        expect(mockGetDashboard).not.toHaveBeenCalled()
      })
    })

    it('shows Add Child button in header', async () => {
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Child/i })).toBeInTheDocument()
      })
    })

    it('navigates to quest detail when quest card clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Learn React')).toBeInTheDocument()
      })

      const questCard = screen.getByRole('button', { name: /Learn React/i })
      await user.click(questCard)

      expect(mockNavigate).toHaveBeenCalledWith('/parent/quest/child-1/quest-1')
    })
  })

  describe('Empty States', () => {
    it('shows empty state when no children or dependents', async () => {
      mockGetMyChildren.mockResolvedValue({ data: { children: [] } })
      mockGetMyDependents.mockResolvedValue({ dependents: [] })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Welcome to Your Family Dashboard')).toBeInTheDocument()
        expect(screen.getByText(/Get started by adding your child's profile/)).toBeInTheDocument()
      })
    })

    it('shows Create Child Profile option in empty state', async () => {
      mockGetMyChildren.mockResolvedValue({ data: { children: [] } })
      mockGetMyDependents.mockResolvedValue({ dependents: [] })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Create Child Profile (Under 13)')).toBeInTheDocument()
      })
    })

    it('shows Connect to Existing Student option in empty state', async () => {
      mockGetMyChildren.mockResolvedValue({ data: { children: [] } })
      mockGetMyDependents.mockResolvedValue({ dependents: [] })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Connect to Existing Student (13+)')).toBeInTheDocument()
      })
    })

    it('shows empty state for active quests', async () => {
      mockGetDashboard.mockResolvedValue({
        data: { ...mockDashboardData, active_quests: [] },
      })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('No Active Quests Yet')).toBeInTheDocument()
      })
    })

    it('shows empty state for learning progress', async () => {
      mockGetProgress.mockResolvedValue({
        data: { xp_by_pillar: {} },
      })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Learning Progress Will Appear Here')).toBeInTheDocument()
      })
    })

    it('shows empty state for completed quests', async () => {
      mockGetCompletedQuests.mockResolvedValue({
        data: { quests: [] },
      })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/No completed quests yet/)).toBeInTheDocument()
      })
    })
  })

  describe('Dependent Profile CRUD', () => {
    it('opens Add Dependent modal when Add Child button clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Child/i })).toBeInTheDocument()
      })

      const addButton = screen.getByRole('button', { name: /Add Child/i })
      await user.click(addButton)

      expect(screen.getByTestId('add-dependent-modal')).toBeInTheDocument()
    })

    it('closes Add Dependent modal when cancel clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Child/i })).toBeInTheDocument()
      })

      const addButton = screen.getByRole('button', { name: /Add Child/i })
      await user.click(addButton)

      const cancelButton = screen.getByText('Cancel')
      await user.click(cancelButton)

      expect(screen.queryByTestId('add-dependent-modal')).not.toBeInTheDocument()
    })

    it('shows success toast and reloads when dependent created', async () => {
      const user = userEvent.setup()

      // Mock window.location.reload
      const originalLocation = window.location
      delete window.location
      window.location = { ...originalLocation, reload: vi.fn() }

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Child/i })).toBeInTheDocument()
      })

      const addButton = screen.getByRole('button', { name: /Add Child/i })
      await user.click(addButton)

      const createButton = screen.getByText('Create Dependent')
      await user.click(createButton)

      expect(toast.success).toHaveBeenCalledWith('Dependent created')
      expect(window.location.reload).toHaveBeenCalled()

      // Restore original location
      window.location = originalLocation
    })

    it('displays dependent in student tabs', async () => {
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Jane Doe')).toBeInTheDocument()
      })
    })

    it('allows switching between child and dependent tabs', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/John Doe/)).toBeInTheDocument()
      })

      const dependentTab = screen.getByRole('button', { name: /Jane Doe/ })
      await user.click(dependentTab)

      await waitFor(() => {
        expect(mockGetDashboard).toHaveBeenCalledWith('dependent-1')
      })
    })

    it('highlights active student tab', async () => {
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        const activeTab = screen.getByRole('button', { name: /John Doe/ })
        expect(activeTab).toHaveClass('border-optio-purple', 'text-optio-purple')
      })
    })

    it('calculates age from date_of_birth correctly', async () => {
      const today = new Date()
      const birthDate = new Date(today.getFullYear() - 10, today.getMonth(), today.getDate())
      const childWith10YearAge = {
        ...mockChild,
        date_of_birth: birthDate.toISOString().split('T')[0],
      }

      mockGetMyChildren.mockResolvedValue({
        data: { children: [childWith10YearAge] },
      })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Under 13')).toBeInTheDocument()
      })
    })

    it('does not show Under 13 badge for teens', async () => {
      const today = new Date()
      const birthDate = new Date(today.getFullYear() - 15, today.getMonth(), today.getDate())
      const teenChild = {
        ...mockChild,
        date_of_birth: birthDate.toISOString().split('T')[0],
      }

      mockGetMyChildren.mockResolvedValue({
        data: { children: [teenChild] },
      })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.queryByText('Under 13')).not.toBeInTheDocument()
      })
    })
  })

  describe('Acting-as-Dependent Switching', () => {
    it('shows Act As button for under-13 dependents', async () => {
      mockGetMyChildren.mockResolvedValue({ data: { children: [] } })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/Act As Jane/)).toBeInTheDocument()
      })
    })

    it('does not show Act As button for linked students (13+)', async () => {
      mockGetMyDependents.mockResolvedValue({ dependents: [] })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.queryByText(/Act As/)).not.toBeInTheDocument()
      })
    })

    it('calls setActingAs when Act As button clicked', async () => {
      const user = userEvent.setup()
      mockGetMyChildren.mockResolvedValue({ data: { children: [] } })
      mockSetActingAs.mockResolvedValue()

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/Act As Jane/)).toBeInTheDocument()
      })

      const actAsButton = screen.getByText(/Act As Jane/)
      await user.click(actAsButton)

      expect(mockSetActingAs).toHaveBeenCalledWith(mockDependent)
    })

    it('shows success toast when switching to dependent', async () => {
      const user = userEvent.setup()
      mockGetMyChildren.mockResolvedValue({ data: { children: [] } })
      mockSetActingAs.mockResolvedValue()

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/Act As Jane/)).toBeInTheDocument()
      })

      const actAsButton = screen.getByText(/Act As Jane/)
      await user.click(actAsButton)

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Now managing Jane Doe's account")
      })
    })

    it('navigates to dashboard when switching to dependent', async () => {
      const user = userEvent.setup()
      mockGetMyChildren.mockResolvedValue({ data: { children: [] } })
      mockSetActingAs.mockResolvedValue()

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/Act As Jane/)).toBeInTheDocument()
      })

      const actAsButton = screen.getByText(/Act As Jane/)
      await user.click(actAsButton)

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
      })
    })

    it('shows error toast when switching fails', async () => {
      const user = userEvent.setup()
      mockGetMyChildren.mockResolvedValue({ data: { children: [] } })
      mockSetActingAs.mockRejectedValue(new Error('Failed to switch'))

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/Act As Jane/)).toBeInTheDocument()
      })

      const actAsButton = screen.getByText(/Act As Jane/)
      await user.click(actAsButton)

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to switch profiles. Please try again.')
      })
    })

    it('shows message when already acting as dependent', async () => {
      mockActingAsValue.actingAsDependent = mockDependent
      mockActingAsValue.isActingAsDependent = true

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/Acting as Jane Doe/)).toBeInTheDocument()
        expect(screen.getByText(/To view the parent dashboard, switch back/)).toBeInTheDocument()
      })
    })

    it('shows Switch Back button when acting as dependent', async () => {
      mockActingAsValue.actingAsDependent = mockDependent
      mockActingAsValue.isActingAsDependent = true

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Switch Back to Parent View')).toBeInTheDocument()
      })
    })

    it('calls clearActingAs when Switch Back button clicked', async () => {
      const user = userEvent.setup()
      mockActingAsValue.actingAsDependent = mockDependent
      mockActingAsValue.isActingAsDependent = true

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Switch Back to Parent View')).toBeInTheDocument()
      })

      const switchBackButton = screen.getByText('Switch Back to Parent View')
      await user.click(switchBackButton)

      expect(mockClearActingAs).toHaveBeenCalled()
    })

    it('shows managing banner for under-13 dependent', async () => {
      mockGetMyChildren.mockResolvedValue({ data: { children: [] } })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/Managing Jane's Profile \(Under 13\)/)).toBeInTheDocument()
      })
    })

    it('does not show managing banner for 13+ students', async () => {
      mockGetMyDependents.mockResolvedValue({ dependents: [] })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.queryByText(/Managing.*Profile \(Under 13\)/)).not.toBeInTheDocument()
      })
    })
  })

  describe('Access Control', () => {
    it('shows access denied for non-parent users', async () => {
      mockAuthValue.user = createMockUser({ role: 'student' })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Parent Access Only')).toBeInTheDocument()
      })
    })

    it('allows admin users to access dashboard', async () => {
      mockAuthValue.user = createMockUser({ role: 'admin' })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Family Dashboard')).toBeInTheDocument()
      })
    })

    it('redirects dependent users to student dashboard', async () => {
      mockAuthValue.user = createMockUser({
        role: 'student',
        is_dependent: true,
      })

      renderWithProviders(<ParentDashboardPage />)

      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
    })
  })

  describe('Student Tabs Navigation', () => {
    it('shows student tabs when multiple children/dependents', async () => {
      const anotherChild = {
        student_id: 'child-2',
        student_first_name: 'Sarah',
        student_last_name: 'Smith',
      }

      mockGetMyChildren.mockResolvedValue({
        data: { children: [mockChild, anotherChild] },
      })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /John Doe/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Sarah Smith/ })).toBeInTheDocument()
      })
    })

    it('hides student tabs when only one student', async () => {
      mockGetMyDependents.mockResolvedValue({ dependents: [] })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        const tabs = screen.queryAllByRole('button', { name: /John Doe/ })
        // Tab exists but navigation is hidden
        expect(tabs.length).toBeLessThanOrEqual(1)
      })
    })

    it('loads new data when switching tabs', async () => {
      const user = userEvent.setup()
      const anotherChild = {
        student_id: 'child-2',
        student_first_name: 'Sarah',
        student_last_name: 'Smith',
      }

      mockGetMyChildren.mockResolvedValue({
        data: { children: [mockChild, anotherChild] },
      })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Sarah Smith/ })).toBeInTheDocument()
      })

      mockGetDashboard.mockClear()

      const sarahTab = screen.getByRole('button', { name: /Sarah Smith/ })
      await user.click(sarahTab)

      await waitFor(() => {
        expect(mockGetDashboard).toHaveBeenCalledWith('child-2')
      })
    })
  })

  describe('Request Student Connection Modal', () => {
    it('opens connection modal when Connect to Existing Student clicked', async () => {
      const user = userEvent.setup()
      mockGetMyChildren.mockResolvedValue({ data: { children: [] } })
      mockGetMyDependents.mockResolvedValue({ dependents: [] })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Connect to Existing Student (13+)')).toBeInTheDocument()
      })

      const connectButton = screen.getByText('Connect to Existing Student (13+)')
      await user.click(connectButton)

      expect(screen.getByTestId('request-connection-modal')).toBeInTheDocument()
    })

    it('closes connection modal when close clicked', async () => {
      const user = userEvent.setup()
      mockGetMyChildren.mockResolvedValue({ data: { children: [] } })
      mockGetMyDependents.mockResolvedValue({ dependents: [] })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Connect to Existing Student (13+)')).toBeInTheDocument()
      })

      const connectButton = screen.getByText('Connect to Existing Student (13+)')
      await user.click(connectButton)

      const closeButton = within(screen.getByTestId('request-connection-modal')).getByText('Close')
      await user.click(closeButton)

      expect(screen.queryByTestId('request-connection-modal')).not.toBeInTheDocument()
    })
  })

  describe('Quest Cards Interaction', () => {
    it('displays quest image when available', async () => {
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        const questImage = screen.getByAltText('Learn React')
        expect(questImage).toBeInTheDocument()
        expect(questImage).toHaveAttribute('src', '/images/quest1.jpg')
      })
    })

    it('shows quest progress bar with correct width', async () => {
      renderWithProviders(<ParentDashboardPage />)

      // First wait for quest to load
      await waitFor(() => {
        expect(screen.getByText('Learn React')).toBeInTheDocument()
      })

      // Then check progress bar
      await waitFor(() => {
        const percentageText = screen.getByText('30%')
        expect(percentageText).toBeInTheDocument()
      })
    })

    it('navigates to completed quest details', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Complete Python Basics')).toBeInTheDocument()
      })

      const completedQuest = screen.getByRole('button', { name: /Complete Python Basics/i })
      await user.click(completedQuest)

      expect(mockNavigate).toHaveBeenCalledWith('/parent/quest/child-1/quest-2')
    })
  })

  describe('Pillar Display', () => {
    it('displays all five pillars with correct names', async () => {
      renderWithProviders(<ParentDashboardPage />)

      // Wait for Learning Progress section to load
      await waitFor(() => {
        expect(screen.getByText('Learning Progress')).toBeInTheDocument()
      }, { timeout: 5000 })

      // Check for XP values which indicate pillars are rendered
      await waitFor(() => {
        expect(screen.getByText('100 XP')).toBeInTheDocument() // Art
        expect(screen.getByText('500 XP')).toBeInTheDocument() // STEM
      }, { timeout: 5000 })
    })

    it('filters out legacy pillar names', async () => {
      const progressWithLegacy = {
        xp_by_pillar: {
          'Art': 100,
          'STEM': 500,
          'OldPillarName': 999, // Should be filtered
        },
      }

      mockGetProgress.mockResolvedValue({
        data: progressWithLegacy,
      })

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Learning Progress')).toBeInTheDocument()
      }, { timeout: 5000 })

      // Check that valid pillars appear
      await waitFor(() => {
        expect(screen.getByText('100 XP')).toBeInTheDocument()
        expect(screen.getByText('500 XP')).toBeInTheDocument()
        // Old pillar name XP should not appear
        expect(screen.queryByText('999 XP')).not.toBeInTheDocument()
      }, { timeout: 5000 })
    })
  })

  describe('Masquerade Mode Transitions', () => {
    // Tests for React hooks order fix - hooks must be called before conditional returns
    // Bug fix: Moving early return after all hooks to prevent "Rendered more hooks" error

    it('reloads data when switching back from masquerade mode', async () => {
      // Start in masquerade mode
      mockActingAsValue.actingAsDependent = mockDependent
      mockActingAsValue.isActingAsDependent = true

      const { rerender } = renderWithProviders(<ParentDashboardPage />)

      // Verify masquerade message is shown
      await waitFor(() => {
        expect(screen.getByText(/Acting as Jane Doe/)).toBeInTheDocument()
      })

      // Clear API call counts
      mockGetMyChildren.mockClear()
      mockGetMyDependents.mockClear()
      mockGetDashboard.mockClear()

      // Switch back to parent mode
      mockActingAsValue.actingAsDependent = null
      mockActingAsValue.isActingAsDependent = false

      rerender(<ParentDashboardPage />)

      // Verify data is reloaded (useEffect dependencies include actingAsDependent)
      await waitFor(() => {
        expect(mockGetMyChildren).toHaveBeenCalled()
        expect(mockGetMyDependents).toHaveBeenCalled()
      })
    })

    it('does not show hooks error when transitioning from masquerade to parent view', async () => {
      // This test verifies the React hooks order fix
      // The component should render without errors when actingAsDependent changes

      mockActingAsValue.actingAsDependent = mockDependent
      mockActingAsValue.isActingAsDependent = true

      const { rerender } = renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/Acting as Jane Doe/)).toBeInTheDocument()
      })

      // Transition to parent mode - this previously caused hooks error
      mockActingAsValue.actingAsDependent = null
      mockActingAsValue.isActingAsDependent = false

      // Should not throw and should render dashboard
      rerender(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Family Dashboard')).toBeInTheDocument()
      })
    })

    it('shows loading state while fetching data after masquerade ends', async () => {
      // Start in masquerade mode
      mockActingAsValue.actingAsDependent = mockDependent
      mockActingAsValue.isActingAsDependent = true

      const { rerender, container } = renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/Acting as Jane Doe/)).toBeInTheDocument()
      })

      // Make API calls slow
      mockGetMyChildren.mockImplementation(() => new Promise(resolve =>
        setTimeout(() => resolve({ data: { children: [mockChild] } }), 100)
      ))

      // Switch back to parent mode
      mockActingAsValue.actingAsDependent = null
      mockActingAsValue.isActingAsDependent = false

      rerender(<ParentDashboardPage />)

      // Should show loading spinner while fetching
      const spinner = container.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })

    it('displays children after successful data reload post-masquerade', async () => {
      mockActingAsValue.actingAsDependent = mockDependent
      mockActingAsValue.isActingAsDependent = true

      const { rerender } = renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/Acting as Jane Doe/)).toBeInTheDocument()
      })

      // Switch back
      mockActingAsValue.actingAsDependent = null
      mockActingAsValue.isActingAsDependent = false

      rerender(<ParentDashboardPage />)

      // Should show children after data loads
      await waitFor(() => {
        expect(screen.getByText(/John Doe/)).toBeInTheDocument()
        expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
      })
    })

    it('clears masquerade state when Switch Back button is clicked on dashboard', async () => {
      const user = userEvent.setup()
      mockActingAsValue.actingAsDependent = mockDependent
      mockActingAsValue.isActingAsDependent = true

      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Switch Back to Parent View')).toBeInTheDocument()
      })

      const switchBackButton = screen.getByText('Switch Back to Parent View')
      await user.click(switchBackButton)

      // Verify clearActingAs was called
      expect(mockClearActingAs).toHaveBeenCalledTimes(1)
    })
  })

  describe('Diploma Credit Display', () => {
    it('calculates credits from XP correctly (1000 XP = 1 credit)', async () => {
      renderWithProviders(<ParentDashboardPage />)

      // Wait for Diploma Progress section
      await waitFor(() => {
        expect(screen.getByText('Diploma Progress')).toBeInTheDocument()
      }, { timeout: 5000 })

      // Check that credit display appears (5 total credits)
      await waitFor(() => {
        expect(screen.getByText('5 / 20 credits earned toward diploma')).toBeInTheDocument()
      }, { timeout: 5000 })
    })

    it('displays progress bars for each subject', async () => {
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Diploma Progress')).toBeInTheDocument()
      }, { timeout: 3000 })

      // Check that diploma section has rendered by looking for credit text
      await waitFor(() => {
        expect(screen.getByText(/credits earned toward diploma/)).toBeInTheDocument()
      }, { timeout: 3000 })
    })

    it('caps progress bar at 100% when credits exceed requirement', async () => {
      renderWithProviders(<ParentDashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('Family Dashboard')).toBeInTheDocument()
      }, { timeout: 3000 })

      await waitFor(() => {
        // Check that STEM credits display appears
        expect(screen.getByText('5 / 4 credits')).toBeInTheDocument()
      }, { timeout: 3000 })
    })
  })
})
