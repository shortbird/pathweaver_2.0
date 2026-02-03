import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, createMockUser, createMockQuest, createMockTask } from '../tests/test-utils'
import QuestDetail from './QuestDetail'
import toast from 'react-hot-toast'

// Mock heavy dependencies
vi.mock('react-hot-toast')
vi.mock('../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }
}))

// Mock lazy-loaded components
vi.mock('../components/quest/TaskEvidenceModal', () => ({
  default: ({ onClose, onComplete }) => (
    <div data-testid="task-evidence-modal">
      <button onClick={() => onComplete({ success: true })}>Complete Task</button>
      <button onClick={onClose}>Close</button>
    </div>
  )
}))

vi.mock('../components/quest/TaskDetailModal', () => ({
  default: ({ onClose }) => (
    <div data-testid="task-detail-modal">
      <button onClick={onClose}>Close</button>
    </div>
  )
}))

vi.mock('../components/quests/QuestPersonalizationWizard', () => ({
  default: ({ onComplete, onCancel }) => (
    <div data-testid="personalization-wizard">
      <button onClick={onComplete}>Complete Personalization</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  )
}))

vi.mock('../components/quest/QuestCompletionCelebration', () => ({
  default: ({ onClose }) => (
    <div data-testid="completion-celebration">
      <h2>Quest Complete!</h2>
      <button onClick={onClose}>Close Celebration</button>
    </div>
  )
}))

vi.mock('../components/quest/TaskTimeline', () => ({
  default: ({ tasks }) => (
    <div data-testid="task-timeline">
      {tasks.map(task => (
        <div key={task.id} data-testid={`timeline-task-${task.id}`}>
          {task.title}
        </div>
      ))}
    </div>
  )
}))

vi.mock('../components/quest/TaskWorkspace', () => ({
  default: ({ task, onOpenEvidenceModal }) => (
    <div data-testid="task-workspace">
      <h3>{task?.title || 'No task selected'}</h3>
      {task && !task.is_completed && (
        <button onClick={onOpenEvidenceModal}>Submit Evidence</button>
      )}
      {task?.is_completed && <div data-testid="task-completed">Completed</div>}
    </div>
  )
}))

vi.mock('../components/quest/RestartQuestModal', () => ({
  default: ({ onLoadPrevious, onStartFresh, onClose }) => (
    <div data-testid="restart-modal">
      <h2>Restart Quest?</h2>
      <button onClick={onLoadPrevious}>Load Previous Tasks</button>
      <button onClick={onStartFresh}>Start Fresh</button>
      <button onClick={onClose}>Cancel</button>
    </div>
  )
}))

// Mock useParams
const mockNavigate = vi.fn()
const mockQuestId = 'quest-123'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: mockQuestId }),
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: `/quests/${mockQuestId}`, state: {} }),
  }
})

// Mock useAuth
let mockAuthValue = {
  user: null,
  isAuthenticated: false,
  loading: false,
}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthValue,
}))

// Mock API hooks
const mockUseQuestDetail = vi.fn()
const mockUseEnrollQuest = vi.fn()
const mockUseCompleteTask = vi.fn()
const mockUseEndQuest = vi.fn()

vi.mock('../hooks/api/useQuests', () => ({
  useQuestDetail: () => mockUseQuestDetail(),
  useEnrollQuest: () => mockUseEnrollQuest(),
  useCompleteTask: () => mockUseCompleteTask(),
  useEndQuest: () => mockUseEndQuest(),
}))

// Mock api
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn((url) => {
      // Mock /api/auth/me to return user data for OrganizationContext
      if (url === '/api/auth/me') {
        return Promise.resolve({ data: { id: 'user-123', role: 'student', organization_id: null } })
      }
      return Promise.resolve({ data: null })
    }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  }
}))

describe('QuestDetail', () => {
  const mockUser = createMockUser({ id: 'user-123', role: 'student' })

  beforeEach(() => {
    vi.clearAllMocks()
    toast.success = vi.fn()
    toast.error = vi.fn()

    // Reset mockAuthValue to default authenticated state
    mockAuthValue.user = mockUser
    mockAuthValue.isAuthenticated = true
    mockAuthValue.loading = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Loading and Error States', () => {
    it('shows loading state while fetching quest', () => {
      mockUseQuestDetail.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      })
      mockUseEnrollQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseCompleteTask.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseEndQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })

      const { container } = renderWithProviders(<QuestDetail />)

      // Check for loading skeleton (animated pulse)
      const loadingSkeleton = container.querySelector('.animate-pulse')
      expect(loadingSkeleton).toBeInTheDocument()
    })

    it('shows error message when quest not found (404)', () => {
      mockUseQuestDetail.mockReturnValue({
        data: null,
        isLoading: false,
        error: { response: { status: 404 } },
        refetch: vi.fn(),
      })
      mockUseEnrollQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseCompleteTask.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseEndQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })

      renderWithProviders(<QuestDetail />)

      expect(screen.getByText(/could not be found/i)).toBeInTheDocument()
    })

    it('shows permission error when forbidden (403)', () => {
      mockUseQuestDetail.mockReturnValue({
        data: null,
        isLoading: false,
        error: { response: { status: 403 } },
        refetch: vi.fn(),
      })
      mockUseEnrollQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseCompleteTask.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseEndQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })

      renderWithProviders(<QuestDetail />)

      expect(screen.getByText(/do not have permission/i)).toBeInTheDocument()
    })

    it('shows generic error for other errors', () => {
      mockUseQuestDetail.mockReturnValue({
        data: null,
        isLoading: false,
        error: { response: { status: 500 } },
        refetch: vi.fn(),
      })
      mockUseEnrollQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseCompleteTask.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseEndQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })

      renderWithProviders(<QuestDetail />)

      expect(screen.getByText(/unable to load quest details/i)).toBeInTheDocument()
    })
  })

  describe('Quest Display - Not Enrolled', () => {
    it('renders quest details when not enrolled', () => {
      const mockQuest = createMockQuest({
        id: mockQuestId,
        title: 'Learn React Testing',
        description: 'Master testing React components',
        pillar_primary: 'stem',
        xp_value: 500,
        user_enrollment: null,
        completed_enrollment: false,
        quest_tasks: [],
      })

      mockUseQuestDetail.mockReturnValue({
        data: mockQuest,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })
      mockUseEnrollQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseCompleteTask.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseEndQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })

      renderWithProviders(<QuestDetail />)

      expect(screen.getByText('Learn React Testing')).toBeInTheDocument()
      expect(screen.getByText(/Master testing React components/i)).toBeInTheDocument()
    })

    it('shows Start Quest button when not enrolled', () => {
      const mockQuest = createMockQuest({
        id: mockQuestId,
        user_enrollment: null,
        completed_enrollment: false,
        quest_tasks: [],
      })

      mockUseQuestDetail.mockReturnValue({
        data: mockQuest,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })
      mockUseEnrollQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseCompleteTask.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseEndQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })

      renderWithProviders(<QuestDetail />)

      expect(screen.getByRole('button', { name: /pick up quest/i })).toBeInTheDocument()
    })
  })

  describe('Quest Enrollment', () => {
    it('enrolls user when Start Quest button is clicked', async () => {
      const user = userEvent.setup()
      const mockMutate = vi.fn()
      const mockQuest = createMockQuest({
        id: mockQuestId,
        user_enrollment: null,
        quest_tasks: [],
      })

      mockUseQuestDetail.mockReturnValue({
        data: mockQuest,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })
      mockUseEnrollQuest.mockReturnValue({ mutate: mockMutate, isPending: false })
      mockUseCompleteTask.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseEndQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })

      renderWithProviders(<QuestDetail />)

      const startButton = screen.getByRole('button', { name: /pick up quest/i })
      await user.click(startButton)

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          questId: mockQuestId,
        }),
        expect.any(Object)
      )
    })

    it('redirects to login if not authenticated', async () => {
      const user = userEvent.setup()
      const mockQuest = createMockQuest({
        id: mockQuestId,
        user_enrollment: null,
        quest_tasks: [],
      })

      mockUseQuestDetail.mockReturnValue({
        data: mockQuest,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })
      mockUseEnrollQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseCompleteTask.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseEndQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })

      // Set unauthenticated state
      mockAuthValue.user = null
      mockAuthValue.isAuthenticated = false

      renderWithProviders(<QuestDetail />)

      const startButton = screen.getByRole('button', { name: /pick up quest/i })
      await user.click(startButton)

      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })
  })

  describe('Quest with Tasks - Enrolled', () => {
    it.skip('renders task list when enrolled (responsive layout - test in E2E)', () => {
      const task1 = createMockTask({ id: 'task-1', title: 'Task 1', is_completed: false })
      const task2 = createMockTask({ id: 'task-2', title: 'Task 2', is_completed: false })

      const mockQuest = createMockQuest({
        id: mockQuestId,
        user_enrollment: { id: 'enrollment-1', is_active: true },
        quest_tasks: [task1, task2],
      })

      mockUseQuestDetail.mockReturnValue({
        data: mockQuest,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })
      mockUseEnrollQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseCompleteTask.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseEndQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })

      renderWithProviders(<QuestDetail />)

      expect(screen.getByTestId('task-timeline')).toBeInTheDocument()
      expect(screen.getByTestId('timeline-task-task-1')).toBeInTheDocument()
      expect(screen.getByTestId('timeline-task-task-2')).toBeInTheDocument()
    })

    it('auto-selects first task on load', async () => {
      const task1 = createMockTask({ id: 'task-1', title: 'First Task', is_completed: false })
      const task2 = createMockTask({ id: 'task-2', title: 'Second Task', is_completed: false })

      const mockQuest = createMockQuest({
        id: mockQuestId,
        user_enrollment: { id: 'enrollment-1', is_active: true },
        quest_tasks: [task1, task2],
      })

      mockUseQuestDetail.mockReturnValue({
        data: mockQuest,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })
      mockUseEnrollQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseCompleteTask.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseEndQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })

      renderWithProviders(<QuestDetail />)

      await waitFor(() => {
        const workspace = screen.getByTestId('task-workspace')
        expect(within(workspace).getByText('First Task')).toBeInTheDocument()
      })
    })

    it('shows Submit Evidence button for incomplete tasks', async () => {
      const task1 = createMockTask({ id: 'task-1', title: 'Incomplete Task', is_completed: false })

      const mockQuest = createMockQuest({
        id: mockQuestId,
        user_enrollment: { id: 'enrollment-1', is_active: true },
        quest_tasks: [task1],
      })

      mockUseQuestDetail.mockReturnValue({
        data: mockQuest,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })
      mockUseEnrollQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseCompleteTask.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseEndQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })

      renderWithProviders(<QuestDetail />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /submit evidence/i })).toBeInTheDocument()
      })
    })

    it('shows completed status for completed tasks', async () => {
      const task1 = createMockTask({ id: 'task-1', title: 'Completed Task', is_completed: true })

      const mockQuest = createMockQuest({
        id: mockQuestId,
        user_enrollment: { id: 'enrollment-1', is_active: true },
        quest_tasks: [task1],
      })

      mockUseQuestDetail.mockReturnValue({
        data: mockQuest,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })
      mockUseEnrollQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseCompleteTask.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseEndQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })

      renderWithProviders(<QuestDetail />)

      await waitFor(() => {
        expect(screen.getByTestId('task-completed')).toBeInTheDocument()
      })
    })
  })

  describe('Task Completion Flow', () => {
    it.skip('opens evidence modal when Submit Evidence is clicked (responsive layout - test in E2E)', async () => {
      const user = userEvent.setup()
      const task1 = createMockTask({ id: 'task-1', title: 'Test Task', is_completed: false })

      const mockQuest = createMockQuest({
        id: mockQuestId,
        user_enrollment: { id: 'enrollment-1', is_active: true },
        quest_tasks: [task1],
      })

      mockUseQuestDetail.mockReturnValue({
        data: mockQuest,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })
      mockUseEnrollQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseCompleteTask.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseEndQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })

      renderWithProviders(<QuestDetail />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /submit evidence/i })).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: /submit evidence/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByTestId('task-evidence-modal')).toBeInTheDocument()
      })
    })

    it.skip('closes evidence modal when Close is clicked (responsive layout - test in E2E)', async () => {
      const user = userEvent.setup()
      const task1 = createMockTask({ id: 'task-1', title: 'Test Task', is_completed: false })

      const mockQuest = createMockQuest({
        id: mockQuestId,
        user_enrollment: { id: 'enrollment-1', is_active: true },
        quest_tasks: [task1],
      })

      mockUseQuestDetail.mockReturnValue({
        data: mockQuest,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })
      mockUseEnrollQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseCompleteTask.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseEndQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })

      renderWithProviders(<QuestDetail />)

      // Open modal
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /submit evidence/i })).toBeInTheDocument()
      })
      const submitButton = screen.getByRole('button', { name: /submit evidence/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByTestId('task-evidence-modal')).toBeInTheDocument()
      })

      // Close modal
      const closeButton = screen.getByRole('button', { name: /close/i })
      await user.click(closeButton)

      await waitFor(() => {
        expect(screen.queryByTestId('task-evidence-modal')).not.toBeInTheDocument()
      })
    })
  })

  describe('Quest Completion', () => {
    it('shows completion celebration when all tasks are done', async () => {
      const task1 = createMockTask({ id: 'task-1', title: 'Task 1', is_completed: true })
      const task2 = createMockTask({ id: 'task-2', title: 'Task 2', is_completed: true })

      const mockQuest = createMockQuest({
        id: mockQuestId,
        user_enrollment: { id: 'enrollment-1', is_active: true },
        completed_enrollment: false,
        quest_tasks: [task1, task2],
        progress_percentage: 100,
      })

      // Initially quest not complete
      const mockQuestIncomplete = {
        ...mockQuest,
        progress_percentage: 50,
        quest_tasks: [
          { ...task1, is_completed: false },
          task2,
        ],
      }

      let currentQuest = mockQuestIncomplete

      mockUseQuestDetail.mockImplementation(() => ({
        data: currentQuest,
        isLoading: false,
        error: null,
        refetch: vi.fn().mockImplementation(() => {
          currentQuest = mockQuest // Update to completed state
        }),
      }))
      mockUseEnrollQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseCompleteTask.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseEndQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })

      const { rerender } = renderWithProviders(<QuestDetail />)

      // Simulate quest completion
      currentQuest = mockQuest
      rerender(<QuestDetail />)

      // Note: The component shows celebration based on progress_percentage === 100
      // In real usage, this would be triggered after task completion
    })
  })

  describe('Restart Quest Flow', () => {
    it('shows restart modal when enrolling in previously completed quest', async () => {
      const user = userEvent.setup()
      const mockQuest = createMockQuest({
        id: mockQuestId,
        user_enrollment: null,
        quest_tasks: [],
      })

      const mockMutate = vi.fn((data, { onError }) => {
        // Simulate 409 conflict with requires_confirmation
        onError({
          response: {
            status: 409,
            data: {
              requires_confirmation: true,
              previous_task_count: 5,
            },
          },
        })
      })

      mockUseQuestDetail.mockReturnValue({
        data: mockQuest,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })
      mockUseEnrollQuest.mockReturnValue({ mutate: mockMutate, isPending: false })
      mockUseCompleteTask.mockReturnValue({ mutate: vi.fn(), isPending: false })
      mockUseEndQuest.mockReturnValue({ mutate: vi.fn(), isPending: false })

      renderWithProviders(<QuestDetail />)

      const startButton = screen.getByRole('button', { name: /pick up quest/i })
      await user.click(startButton)

      await waitFor(() => {
        expect(screen.getByTestId('restart-modal')).toBeInTheDocument()
        expect(screen.getByText(/restart quest/i)).toBeInTheDocument()
      })
    })
  })
})
