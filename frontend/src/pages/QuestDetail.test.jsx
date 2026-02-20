import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import QuestDetail from './QuestDetail'

const mockNavigate = vi.fn()
let authState = {}
let questDetailData = {}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

vi.mock('../hooks/useQuestDetailData', () => ({
  useQuestDetailData: () => questDetailData
}))

vi.mock('../hooks/useActivityTracking', () => ({
  useActivityTracking: () => ({
    trackTabSwitch: vi.fn(),
    trackButtonClick: vi.fn(),
    trackModalOpen: vi.fn(),
    trackModalClose: vi.fn()
  })
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('../services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { success: true, members: [] } }), delete: vi.fn(), put: vi.fn() }
}))

vi.mock('../utils/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

vi.mock('../utils/queryKeys', () => ({
  queryKeys: {
    quests: { detail: (id) => ['quests', 'detail', id] },
    invalidateCourses: vi.fn()
  }
}))

vi.mock('../components/quest/QuestDetailHeader', () => ({
  default: ({ quest, earnedXP, isQuestCompleted, onEndQuest }) => (
    <div data-testid="quest-header">
      <h1>{quest.title}</h1>
      <span data-testid="earned-xp">{earnedXP} XP</span>
      {isQuestCompleted && <span data-testid="completed-badge">Completed</span>}
      <button data-testid="end-quest-btn" onClick={onEndQuest}>Finish Quest</button>
    </div>
  )
}))

vi.mock('../components/quest/QuestEnrollment', () => ({
  default: ({ quest, isEnrolling, onEnroll, totalTasks, isQuestCompleted }) => (
    <div data-testid="quest-enrollment">
      {!quest.user_enrollment && (
        <button data-testid="enroll-btn" onClick={() => onEnroll()} disabled={isEnrolling}>
          {isEnrolling ? 'Enrolling...' : 'Start Quest'}
        </button>
      )}
      {quest.user_enrollment && <span data-testid="enrolled-status">Enrolled</span>}
      <span data-testid="total-tasks">{totalTasks} tasks</span>
    </div>
  )
}))

vi.mock('../components/quest/QuestApproachExamples', () => ({
  default: () => <div data-testid="approach-examples">Approach Examples</div>
}))

vi.mock('../components/quest/QuestMetadataCard', () => ({
  default: ({ quest }) => (
    <div data-testid="metadata-card">
      {quest.description && <p>{quest.description}</p>}
    </div>
  )
}))

vi.mock('../components/quest/TaskWorkspace', () => ({
  default: ({ tasks, onTaskSelect, onTaskComplete }) => (
    <div data-testid="task-workspace">
      {tasks.map(task => (
        <div key={task.id} data-testid={`task-${task.id}`}>
          <span>{task.title}</span>
          <span data-testid={`task-xp-${task.id}`}>{task.xp_value} XP</span>
          {task.is_completed && <span data-testid={`task-done-${task.id}`}>Done</span>}
          <button onClick={() => onTaskSelect(task)}>Select</button>
        </div>
      ))}
    </div>
  )
}))

vi.mock('../components/quest/TaskEvidenceModal', () => ({
  default: () => <div data-testid="evidence-modal">Evidence Modal</div>
}))

vi.mock('../components/quest/TaskDetailModal', () => ({
  default: () => <div data-testid="task-detail-modal">Task Detail Modal</div>
}))

vi.mock('../components/quests/QuestPersonalizationWizard', () => ({
  default: () => <div data-testid="wizard">Wizard</div>
}))

vi.mock('../components/quest/QuestCompletionCelebration', () => ({
  default: () => <div data-testid="celebration">Celebration</div>
}))

vi.mock('../components/quest/RestartQuestModal', () => ({
  default: ({ isOpen }) => isOpen ? <div data-testid="restart-modal">Restart Modal</div> : null
}))

const mockQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } }
})

function renderQuestDetail(questId = 'quest-123') {
  return render(
    <QueryClientProvider client={mockQueryClient}>
      <MemoryRouter initialEntries={[`/quests/${questId}`]}>
        <Routes>
          <Route path="/quests/:id" element={<QuestDetail />} />
          <Route path="/login" element={<div>Login</div>} />
          <Route path="/quests" element={<div>Quest List</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('QuestDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryClient.clear()
    authState = { user: { id: 'user-1', role: 'student' } }

    questDetailData = {
      quest: null,
      isLoading: false,
      error: null,
      refetchQuest: vi.fn(),
      enrollMutation: { mutate: vi.fn(), isPending: false },
      endQuestMutation: { mutate: vi.fn(), isPending: false },
      isEnrolling: false,
      selectedTask: null,
      setSelectedTask: vi.fn(),
      showPersonalizationWizard: false,
      setShowPersonalizationWizard: vi.fn(),
      showQuestCompletionCelebration: false,
      setShowQuestCompletionCelebration: vi.fn(),
      displayMode: 'flexible',
      setDisplayMode: vi.fn(),
      showRestartModal: false,
      setShowRestartModal: vi.fn(),
      restartModalData: { previousTaskCount: 0, questTitle: '' },
      setRestartModalData: vi.fn(),
      xpData: { earnedXP: 0 },
      pillarBreakdown: [],
      completedTasks: 0,
      totalTasks: 0,
      progressPercentage: 0,
      isQuestCompleted: false,
      queryClient: mockQueryClient
    }
  })

  // --- Loading state ---
  describe('loading state', () => {
    it('shows skeleton loader while loading', () => {
      questDetailData.isLoading = true
      renderQuestDetail()
      expect(document.querySelector('.animate-pulse')).toBeTruthy()
    })
  })

  // --- Error state ---
  describe('error state', () => {
    it('shows 404 error message', () => {
      questDetailData.error = { response: { status: 404 } }
      renderQuestDetail()
      expect(screen.getByText('Quest Not Found')).toBeInTheDocument()
      expect(screen.getByText(/could not be found/)).toBeInTheDocument()
    })

    it('shows 403 permission error', () => {
      questDetailData.error = { response: { status: 403 } }
      renderQuestDetail()
      expect(screen.getByText(/do not have permission/)).toBeInTheDocument()
    })

    it('shows generic error for 500', () => {
      questDetailData.error = { response: { status: 500 } }
      renderQuestDetail()
      expect(screen.getByText(/Unable to load quest details/)).toBeInTheDocument()
    })

    it('shows retry button on error', () => {
      questDetailData.error = { response: { status: 500 } }
      renderQuestDetail()
      const retryBtn = screen.getByText('Retry')
      fireEvent.click(retryBtn)
      expect(questDetailData.refetchQuest).toHaveBeenCalled()
    })

    it('shows back to quests button on error', () => {
      questDetailData.error = { response: { status: 404 } }
      renderQuestDetail()
      expect(screen.getByText('Back to Quests')).toBeInTheDocument()
    })
  })

  // --- No quest found ---
  describe('quest not found', () => {
    it('shows quest not found when quest is null', () => {
      questDetailData.quest = null
      renderQuestDetail()
      expect(screen.getByText('Quest not found')).toBeInTheDocument()
    })
  })

  // --- Quest view (not enrolled) ---
  describe('quest view - not enrolled', () => {
    beforeEach(() => {
      questDetailData.quest = {
        id: 'quest-123',
        title: 'Learn React Testing',
        description: 'Master React testing with Vitest',
        user_enrollment: null,
        quest_tasks: [],
        allow_custom_tasks: true,
        preset_tasks: [],
        template_tasks: [],
        has_template_tasks: false,
        big_idea: 'Testing makes code reliable'
      }
      questDetailData.totalTasks = 0
    })

    it('renders quest title', () => {
      renderQuestDetail()
      expect(screen.getByText('Learn React Testing')).toBeInTheDocument()
    })

    it('renders quest metadata card', () => {
      renderQuestDetail()
      expect(screen.getByTestId('metadata-card')).toBeInTheDocument()
    })

    it('shows enroll button when not enrolled', () => {
      renderQuestDetail()
      expect(screen.getByTestId('enroll-btn')).toBeInTheDocument()
    })

    it('shows approach examples for customizable quests', () => {
      renderQuestDetail()
      expect(screen.getByTestId('approach-examples')).toBeInTheDocument()
    })
  })

  // --- Quest view (enrolled with tasks) ---
  describe('quest view - enrolled with tasks', () => {
    beforeEach(() => {
      questDetailData.quest = {
        id: 'quest-123',
        title: 'Learn React Testing',
        description: 'Master React testing',
        user_enrollment: { id: 'enrollment-1', quest_id: 'quest-123' },
        quest_tasks: [
          { id: 'task-1', title: 'Write unit tests', xp_value: 20, is_completed: true, pillar: 'critical_thinking' },
          { id: 'task-2', title: 'Write integration tests', xp_value: 30, is_completed: false, pillar: 'practical_skills' },
          { id: 'task-3', title: 'Set up CI/CD', xp_value: 25, is_completed: false, pillar: 'practical_skills' }
        ],
        allow_custom_tasks: true,
        has_template_tasks: false,
        progress: { percentage: 33, completed_tasks: 1, total_tasks: 3 }
      }
      questDetailData.xpData = { earnedXP: 20 }
      questDetailData.totalTasks = 3
      questDetailData.completedTasks = 1
      questDetailData.progressPercentage = 33
    })

    it('shows task workspace when enrolled with tasks', async () => {
      renderQuestDetail()
      await waitFor(() => {
        expect(screen.getByTestId('task-workspace')).toBeInTheDocument()
      })
    })

    it('displays all tasks in the workspace', async () => {
      renderQuestDetail()
      await waitFor(() => {
        expect(screen.getByText('Write unit tests')).toBeInTheDocument()
      })
      expect(screen.getByText('Write integration tests')).toBeInTheDocument()
      expect(screen.getByText('Set up CI/CD')).toBeInTheDocument()
    })

    it('shows XP values for each task', async () => {
      renderQuestDetail()
      await waitFor(() => {
        expect(screen.getByTestId('task-xp-task-1')).toHaveTextContent('20 XP')
      })
      expect(screen.getByTestId('task-xp-task-2')).toHaveTextContent('30 XP')
    })

    it('marks completed tasks', async () => {
      renderQuestDetail()
      await waitFor(() => {
        expect(screen.getByTestId('task-done-task-1')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('task-done-task-2')).not.toBeInTheDocument()
    })

    it('shows enrolled status', () => {
      renderQuestDetail()
      expect(screen.getByTestId('enrolled-status')).toBeInTheDocument()
    })

    it('displays earned XP in header', () => {
      renderQuestDetail()
      expect(screen.getByTestId('earned-xp')).toHaveTextContent('20 XP')
    })
  })

  // --- Completed quest ---
  describe('completed quest', () => {
    it('shows completed badge when quest is complete', () => {
      questDetailData.quest = {
        id: 'quest-123',
        title: 'Done Quest',
        user_enrollment: { id: 'e-1' },
        quest_tasks: [
          { id: 't-1', title: 'Task 1', xp_value: 20, is_completed: true, pillar: 'creativity' }
        ],
        has_template_tasks: false,
        progress: { percentage: 100, completed_tasks: 1, total_tasks: 1 }
      }
      questDetailData.isQuestCompleted = true
      questDetailData.xpData = { earnedXP: 20 }

      renderQuestDetail()
      expect(screen.getByTestId('completed-badge')).toBeInTheDocument()
    })
  })

  // --- Enrollment ---
  describe('enrollment', () => {
    it('redirects to login if user not authenticated', () => {
      authState = { user: null }
      questDetailData.quest = {
        id: 'quest-123',
        title: 'Test Quest',
        user_enrollment: null,
        quest_tasks: [],
        has_template_tasks: false
      }
      questDetailData.totalTasks = 0

      renderQuestDetail()
      const enrollBtn = screen.getByTestId('enroll-btn')
      fireEvent.click(enrollBtn)

      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })
  })
})
