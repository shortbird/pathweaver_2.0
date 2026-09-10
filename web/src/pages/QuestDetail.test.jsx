import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import QuestDetail from './QuestDetail'
import { ConfirmProvider } from '../contexts/ConfirmContext'
import { OrganizationContext } from '../contexts/OrganizationContext'
import toast from 'react-hot-toast'
import api from '../services/api'

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
  },
  mutationKeys: {
    deleteEnrollment: 'deleteEnrollment',
    endQuest: 'endQuest',
    completeTask: 'completeTask',
    submitEvidence: 'submitEvidence',
    enrollQuest: 'enrollQuest',
    abandonQuest: 'abandonQuest'
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
  default: ({ tasks, onTaskSelect, onTaskComplete, onRemoveTask, onAddTask }) => (
    <div data-testid="task-workspace">
      {onAddTask && <button data-testid="add-task" onClick={onAddTask}>Add a task</button>}
      {tasks.map(task => (
        <div key={task.id} data-testid={`task-${task.id}`}>
          <span>{task.title}</span>
          <span data-testid={`task-xp-${task.id}`}>{task.xp_value} XP</span>
          {task.is_completed && <span data-testid={`task-done-${task.id}`}>Done</span>}
          <button onClick={() => onTaskSelect(task)}>Select</button>
          <button data-testid={`remove-${task.id}`} onClick={() => onRemoveTask(task.id)}>Remove</button>
          <button data-testid={`complete-${task.id}`} onClick={() => onTaskComplete({ taskId: task.id })}>
            Complete
          </button>
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

vi.mock('../components/discussion/ClassCurriculum', () => ({
  default: () => <div data-testid="class-curriculum">Class materials</div>
}))

vi.mock('../components/quest/RestartQuestModal', () => ({
  default: ({ isOpen, onLoadPreviousTasks, onStartFresh, previousTaskCount }) => isOpen ? (
    <div data-testid="restart-modal">
      <span data-testid="restart-previous-count">{previousTaskCount}</span>
      <button data-testid="restart-load-previous" onClick={onLoadPreviousTasks}>Load previous</button>
      <button data-testid="restart-start-fresh" onClick={onStartFresh}>Start fresh</button>
    </div>
  ) : null
}))

const mockQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } }
})

function renderQuestDetail(questId = 'quest-123', orgContext) {
  const tree = (
    <QueryClientProvider client={mockQueryClient}>
      <ConfirmProvider>
        <MemoryRouter initialEntries={[`/quests/${questId}`]}>
          <Routes>
            <Route path="/quests/:id" element={<QuestDetail />} />
            <Route path="/login" element={<div>Login</div>} />
            <Route path="/quests" element={<div>Quest List</div>} />
          </Routes>
        </MemoryRouter>
      </ConfirmProvider>
    </QueryClientProvider>
  )
  // No provider by default, which is the degrade-to-asking path the page is
  // written for. Pass a value to test what the org actually says.
  return render(orgContext
    ? <OrganizationContext.Provider value={orgContext}>{tree}</OrganizationContext.Provider>
    : tree)
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
      reopenQuestMutation: { mutate: vi.fn(), isPending: false },
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

  // --- Ending a quest ---
  //
  // A Hearthwood parent showing her daughter how to submit a biology lab ended
  // the whole subject instead, four seconds after opening the task, with seven
  // of nine tasks still to do. "End quest" fired on one tap with no warning,
  // and once ended there was no way back from inside the app.
  describe('ending and reopening a quest', () => {
    const enrolledQuest = () => ({
      id: 'quest-123',
      title: 'High School Biology',
      user_enrollment: { id: 'enrollment-1', quest_id: 'quest-123' },
      completed_enrollment: null,
      quest_tasks: [
        { id: 'task-1', title: 'Unit 1 - Workbook', xp_value: 150, is_completed: true, pillar: 'stem_logic' },
        { id: 'task-2', title: 'Unit 1 - Lab 1', xp_value: 150, is_completed: false, pillar: 'stem_logic' },
        { id: 'task-3', title: 'Unit 1 - Test', xp_value: 200, is_completed: false, pillar: 'stem_logic' }
      ],
      has_template_tasks: false,
      progress: { percentage: 33, completed_tasks: 1, total_tasks: 3 }
    })

    it('asks before ending, and says how many tasks are still unfinished', async () => {
      questDetailData.quest = enrolledQuest()
      questDetailData.totalTasks = 3
      questDetailData.completedTasks = 1

      renderQuestDetail()
      fireEvent.click(screen.getByText('End quest'))

      await waitFor(() => {
        expect(screen.getByText('End this quest?')).toBeInTheDocument()
      })
      expect(screen.getByText(/2 tasks are still unfinished/)).toBeInTheDocument()
      expect(questDetailData.endQuestMutation.mutate).not.toHaveBeenCalled()
    })

    it('does not end the quest when the person cancels', async () => {
      questDetailData.quest = enrolledQuest()
      questDetailData.totalTasks = 3
      questDetailData.completedTasks = 1

      renderQuestDetail()
      fireEvent.click(screen.getByText('End quest'))
      await waitFor(() => expect(screen.getByText('Cancel')).toBeInTheDocument())
      fireEvent.click(screen.getByText('Cancel'))

      await waitFor(() => {
        expect(questDetailData.endQuestMutation.mutate).not.toHaveBeenCalled()
      })
    })

    it('ends the quest once confirmed', async () => {
      questDetailData.quest = enrolledQuest()
      questDetailData.totalTasks = 3
      questDetailData.completedTasks = 1

      renderQuestDetail()
      fireEvent.click(screen.getByText('End quest'))
      await waitFor(() => expect(screen.getByText('Confirm')).toBeInTheDocument())
      fireEvent.click(screen.getByText('Confirm'))

      await waitFor(() => {
        expect(questDetailData.endQuestMutation.mutate).toHaveBeenCalledWith('quest-123', expect.any(Object))
      })
    })

    it('offers a reopen button on a quest that was ended', async () => {
      const quest = enrolledQuest()
      quest.completed_enrollment = { id: 'enrollment-1' }
      questDetailData.quest = quest
      questDetailData.isQuestCompleted = true
      questDetailData.totalTasks = 3
      questDetailData.completedTasks = 1

      renderQuestDetail()

      const reopen = screen.getByText('Reopen this quest')
      expect(reopen).toBeInTheDocument()
      expect(screen.queryByText('End quest')).not.toBeInTheDocument()

      fireEvent.click(reopen)
      expect(questDetailData.reopenQuestMutation.mutate).toHaveBeenCalledWith('quest-123', expect.any(Object))
    })

    it('does not offer reopen while the quest is still active', () => {
      questDetailData.quest = enrolledQuest()
      questDetailData.totalTasks = 3
      questDetailData.completedTasks = 1

      renderQuestDetail()
      expect(screen.queryByText('Reopen this quest')).not.toBeInTheDocument()
    })
  })

  // --- Enrollment ---
  describe('class materials gate', () => {
    /**
     * The probe must wait for the org payload to arrive, not race it.
     *
     * OrganizationContext starts `organization` at null and fills it from
     * /api/auth/me. moduleKnownOff answers "not known off" for a payload that
     * cannot speak yet -- deliberately, since hiding a live class's materials
     * is the worse failure -- so on the first render the guard let the probe
     * through and it fired before the answer arrived. Arete Academy was still
     * logging OPTIO-BACKEND-89 against a release that already CONTAINED the
     * guard.
     */
    const ENROLLED = {
      id: 'quest-123',
      title: 'Test Quest',
      user_enrollment: { id: 'e-1' },
      quest_tasks: [],
      has_template_tasks: false
    }

    beforeEach(() => {
      authState = { user: { id: 'user-1', role: 'student', organization_id: 'org-1' } }
      questDetailData.quest = ENROLLED
      questDetailData.totalTasks = 0
    })

    it('does not probe while the org is still loading', () => {
      renderQuestDetail('quest-123', { organization: null, loading: true })
      expect(screen.queryByTestId('class-curriculum')).toBeNull()
    })

    it('does not probe once the org says classes is off', () => {
      renderQuestDetail('quest-123', {
        organization: { id: 'org-1', effective_modules: ['quests', 'xp'] },
        loading: false
      })
      expect(screen.queryByTestId('class-curriculum')).toBeNull()
    })

    it('probes when the org says classes is on', () => {
      renderQuestDetail('quest-123', {
        organization: { id: 'org-1', effective_modules: ['quests', 'classes'] },
        loading: false
      })
      expect(screen.getByTestId('class-curriculum')).toBeInTheDocument()
    })

    it('still probes when the payload cannot answer at all', () => {
      // A null org AFTER loading is not evidence of absence, so ask. This is
      // the rule the loading check must not accidentally break.
      renderQuestDetail('quest-123', { organization: null, loading: false })
      expect(screen.getByTestId('class-curriculum')).toBeInTheDocument()
    })
  })

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

  // ── Enrollment ────────────────────────────────────────────────────────────
  //
  // The single most-repaired path on this page. Six commits are about which
  // enrollment outcome should and should not launch the personalization
  // wizard ("Course quest enrollment now skips personalization wizard",
  // "Course quests without preset tasks now show personalization wizard",
  // "Fix template tasks not loading on quest enrollment", "Fix duplicate
  // template tasks on quest restart"), and each fix was invisible to every
  // other path. The branch is small and the failure is silent: the student
  // either lands in a wizard they should not see, or gets no tasks at all.
  describe('enrollment outcomes', () => {
    const NOT_ENROLLED = () => ({
      id: 'quest-123',
      title: 'Learn React Testing',
      user_enrollment: null,
      quest_tasks: [],
      allow_custom_tasks: true,
      preset_tasks: [],
      template_tasks: [],
      has_template_tasks: false
    })

    /** Make the enroll mutation resolve with `data`, the way React Query would. */
    const resolvesWith = (data) =>
      vi.fn((_vars, opts) => { opts.onSuccess(data) })

    /** Make the enroll mutation reject with `error`. */
    const rejectsWith = (error) =>
      vi.fn((_vars, opts) => { opts.onError(error) })

    beforeEach(() => {
      questDetailData.quest = NOT_ENROLLED()
      questDetailData.totalTasks = 0
    })

    it('sends no click event through as enrollment options', async () => {
      // handleEnroll defaults `options` to {}, and the button passes nothing.
      // A version that wired onClick straight to onEnroll shipped a React
      // synthetic event as the options object, so the backend received a
      // request body of DOM properties. Assert the exact payload.
      questDetailData.enrollMutation = { mutate: resolvesWith({}), isPending: false }
      renderQuestDetail()

      fireEvent.click(screen.getByTestId('enroll-btn'))

      await waitFor(() => {
        expect(questDetailData.enrollMutation.mutate).toHaveBeenCalledWith(
          { questId: 'quest-123', options: {} },
          expect.any(Object)
        )
      })
    })

    it('opens the wizard when the backend seeded no tasks', async () => {
      questDetailData.enrollMutation = { mutate: resolvesWith({}), isPending: false }
      renderQuestDetail()

      fireEvent.click(screen.getByTestId('enroll-btn'))

      await waitFor(() => {
        expect(questDetailData.setShowPersonalizationWizard).toHaveBeenCalledWith(true)
      })
    })

    it('skips the wizard when the backend says skip_wizard', async () => {
      questDetailData.enrollMutation = {
        mutate: resolvesWith({ enrollment: { skip_wizard: true } }),
        isPending: false
      }
      renderQuestDetail()

      fireEvent.click(screen.getByTestId('enroll-btn'))

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Enrolled! Your tasks are ready.')
      })
      expect(questDetailData.setShowPersonalizationWizard).not.toHaveBeenCalled()
    })

    it('skips the wizard when the quest has facilitator-authored tasks', async () => {
      // A course/class quest arrives with its task list already written. The
      // wizard would offer to generate a second, unrelated one.
      questDetailData.enrollMutation = {
        mutate: resolvesWith({ has_template_tasks: true }),
        isPending: false
      }
      renderQuestDetail()

      fireEvent.click(screen.getByTestId('enroll-btn'))

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Enrolled! Your tasks are ready.')
      })
      expect(questDetailData.setShowPersonalizationWizard).not.toHaveBeenCalled()
    })

    it('names the restored task count when a restart reloaded previous tasks', async () => {
      questDetailData.enrollMutation = {
        mutate: resolvesWith({ tasks_loaded: 5 }),
        isPending: false
      }
      renderQuestDetail()

      fireEvent.click(screen.getByTestId('enroll-btn'))

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Restarted quest with 5 previous tasks!')
      })
      expect(questDetailData.setShowPersonalizationWizard).not.toHaveBeenCalled()
    })

    it('offers the restart choice instead of an error on a 409', async () => {
      // Re-enrolling in a quest you already did is not a failure. The backend
      // answers 409 + requires_confirmation and the page asks whether to bring
      // the old tasks back -- it must not surface this as a red toast.
      questDetailData.enrollMutation = {
        mutate: rejectsWith({
          response: {
            status: 409,
            data: { requires_confirmation: true, previous_task_count: 4 }
          }
        }),
        isPending: false
      }
      renderQuestDetail()

      fireEvent.click(screen.getByTestId('enroll-btn'))

      await waitFor(() => {
        expect(questDetailData.setShowRestartModal).toHaveBeenCalledWith(true)
      })
      expect(questDetailData.setRestartModalData).toHaveBeenCalledWith({
        previousTaskCount: 4,
        questTitle: 'Learn React Testing'
      })
      expect(toast.error).not.toHaveBeenCalled()
    })

    it('shows the refusal the backend gave, not a generic failure', async () => {
      // A parent is told the school assigns their quests. Falling back to
      // "Could not start this quest" leaves a button that appears to do nothing.
      questDetailData.enrollMutation = {
        mutate: rejectsWith({
          response: { status: 403, data: { message: 'Your school assigns quests for you.' } }
        }),
        isPending: false
      }
      renderQuestDetail()

      fireEvent.click(screen.getByTestId('enroll-btn'))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Your school assigns quests for you.')
      })
      expect(questDetailData.setShowRestartModal).not.toHaveBeenCalled()
    })

    it('falls back to a readable message when the error carries none', async () => {
      questDetailData.enrollMutation = {
        mutate: rejectsWith({ response: { status: 500, data: {} } }),
        isPending: false
      }
      renderQuestDetail()

      fireEvent.click(screen.getByTestId('enroll-btn'))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Could not start this quest.')
      })
    })

    it('re-enrolls with load_previous_tasks when the student keeps their old work', async () => {
      questDetailData.showRestartModal = true
      questDetailData.restartModalData = { previousTaskCount: 4, questTitle: 'Learn React Testing' }
      questDetailData.enrollMutation = { mutate: resolvesWith({ tasks_loaded: 4 }), isPending: false }
      renderQuestDetail()

      fireEvent.click(screen.getByTestId('restart-load-previous'))

      await waitFor(() => {
        expect(questDetailData.enrollMutation.mutate).toHaveBeenCalledWith(
          { questId: 'quest-123', options: { load_previous_tasks: true, force_new: true } },
          expect.any(Object)
        )
      })
    })

    it('re-enrolls with force_new alone when the student starts over', async () => {
      questDetailData.showRestartModal = true
      questDetailData.restartModalData = { previousTaskCount: 4, questTitle: 'Learn React Testing' }
      questDetailData.enrollMutation = { mutate: resolvesWith({}), isPending: false }
      renderQuestDetail()

      fireEvent.click(screen.getByTestId('restart-start-fresh'))

      await waitFor(() => {
        expect(questDetailData.enrollMutation.mutate).toHaveBeenCalledWith(
          { questId: 'quest-123', options: { force_new: true } },
          expect.any(Object)
        )
      })
    })
  })

  // ── Removing a task ───────────────────────────────────────────────────────
  //
  // "Stop the quest page from putting back a task the student deleted"
  // (347e85b0): removing the LAST task used to be indistinguishable from an
  // enrollment that was never seeded, so the next read copied the template
  // tasks back in and the deleted task reappeared. The client half of that fix
  // is that the completion flow now opens on the backend's `quest_now_empty`
  // rather than on the page racing its own refetch and reading an empty cache.
  describe('removing a task', () => {
    const CACHE_KEY = ['quests', 'detail', 'quest-123']

    const enrolledQuest = () => ({
      id: 'quest-123',
      title: 'Learn React Testing',
      user_enrollment: { id: 'enrollment-1' },
      quest_tasks: [
        { id: 'task-1', title: 'Write unit tests', xp_value: 20, is_completed: false },
        { id: 'task-2', title: 'Write integration tests', xp_value: 30, is_completed: false }
      ],
      has_template_tasks: false,
      progress: { percentage: 0, completed_tasks: 0, total_tasks: 2 }
    })

    beforeEach(() => {
      questDetailData.quest = enrolledQuest()
      questDetailData.totalTasks = 2
      mockQueryClient.setQueryData(CACHE_KEY, enrolledQuest())
    })

    const clickRemoveAndConfirm = async (taskId) => {
      fireEvent.click(await screen.findByTestId(`remove-${taskId}`))
      fireEvent.click(await screen.findByText('Confirm'))
    }

    it('asks before removing, and removes nothing if the student says no', async () => {
      renderQuestDetail()
      fireEvent.click(await screen.findByTestId('remove-task-1'))

      fireEvent.click(await screen.findByText('Cancel'))

      await waitFor(() => {
        expect(api.delete).not.toHaveBeenCalled()
      })
    })

    it('deletes the task and takes it out of the cache immediately', async () => {
      api.delete.mockResolvedValue({ data: { quest_now_empty: false } })
      renderQuestDetail()

      await clickRemoveAndConfirm('task-1')

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith('/api/tasks/task-1')
      })
      const cached = mockQueryClient.getQueryData(CACHE_KEY)
      expect(cached.quest_tasks.map(t => t.id)).toEqual(['task-2'])
      expect(cached.progress.total_tasks).toBe(1)
    })

    it('opens the completion flow when the backend says that was the last task', async () => {
      api.delete.mockResolvedValue({ data: { quest_now_empty: true } })
      renderQuestDetail()

      await clickRemoveAndConfirm('task-1')

      await waitFor(() => {
        expect(questDetailData.setShowQuestCompletionCelebration).toHaveBeenCalledWith(true)
      })
    })

    it('does not open it just because the cache looks empty', async () => {
      // This is the regression. The optimistic update above empties
      // quest_tasks locally, so a page that reads the cache to decide would
      // fire the completion flow after removing ANY task from a one-task list
      // -- including one the backend still counts. The backend counted the
      // remaining rows in the same request that did the delete; believe it.
      const oneTask = enrolledQuest()
      oneTask.quest_tasks = [oneTask.quest_tasks[0]]
      questDetailData.quest = oneTask
      questDetailData.totalTasks = 1
      mockQueryClient.setQueryData(CACHE_KEY, oneTask)
      api.delete.mockResolvedValue({ data: { quest_now_empty: false } })

      renderQuestDetail()
      await clickRemoveAndConfirm('task-1')

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalled()
      })
      expect(mockQueryClient.getQueryData(CACHE_KEY).quest_tasks).toEqual([])
      expect(questDetailData.setShowQuestCompletionCelebration).not.toHaveBeenCalled()
    })

    it('puts the task back when the delete fails', async () => {
      // Without the revert the task is gone from the screen and still on the
      // server, and the student only finds out on the next page load.
      api.delete.mockRejectedValue({ response: { data: { error: 'Task is locked' } } })
      renderQuestDetail()

      await clickRemoveAndConfirm('task-1')

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Task is locked')
      })
      expect(mockQueryClient.getQueryData(CACHE_KEY).quest_tasks.map(t => t.id))
        .toEqual(['task-1', 'task-2'])
    })
  })

  // ── Ending a class ────────────────────────────────────────────────────────
  describe('ending a credit class', () => {
    const classQuest = () => ({
      id: 'quest-123',
      title: 'High School Biology',
      quest_type: 'class',
      transcript_subject: 'science',
      user_enrollment: { id: 'enrollment-1' },
      quest_tasks: [{ id: 'task-1', title: 'Unit 1', xp_value: 150, is_completed: false }],
      has_template_tasks: false,
      progress: { percentage: 0, completed_tasks: 0, total_tasks: 1 }
    })

    it('calls a class a class, not a quest', async () => {
      questDetailData.quest = classQuest()
      questDetailData.totalTasks = 1
      questDetailData.completedTasks = 0

      renderQuestDetail()
      fireEvent.click(screen.getByText('End class'))

      await waitFor(() => {
        expect(screen.getByText('End this class?')).toBeInTheDocument()
      })
      expect(screen.getByText(/1 task is still unfinished/)).toBeInTheDocument()
    })

    it('says which requirements are missing when the backend refuses', async () => {
      // A course project with unmet requirements gets its own reason. The
      // generic "Failed to finish quest. Please try again." tells a student to
      // retry something that will never succeed.
      questDetailData.quest = classQuest()
      questDetailData.totalTasks = 1
      questDetailData.endQuestMutation = {
        mutate: vi.fn((_id, opts) => opts.onError({
          response: {
            data: {
              reason: 'INCOMPLETE_REQUIREMENTS',
              message: 'Finish the lab report before ending this class.'
            }
          }
        })),
        isPending: false
      }

      renderQuestDetail()
      fireEvent.click(screen.getByText('End class'))
      fireEvent.click(await screen.findByText('Confirm'))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Finish the lab report before ending this class.')
      })
      expect(mockNavigate).not.toHaveBeenCalledWith('/dashboard')
    })

    it('does not ask twice when the header already did', async () => {
      // QuestDetailHeader's LMS "Mark Complete" runs its own confirmation, so
      // the page is called with skipConfirm and must go straight through.
      questDetailData.quest = classQuest()
      questDetailData.totalTasks = 1

      renderQuestDetail()
      fireEvent.click(screen.getByTestId('end-quest-btn'))

      await waitFor(() => {
        expect(questDetailData.endQuestMutation.mutate)
          .toHaveBeenCalledWith('quest-123', expect.any(Object))
      })
      expect(screen.queryByText('End this class?')).not.toBeInTheDocument()
    })
  })

  // ── The bottom End button's own visibility rules ──────────────────────────
  describe('when the end action is offered at all', () => {
    const enrolled = (extra = {}) => ({
      id: 'quest-123',
      title: 'Learn React Testing',
      user_enrollment: { id: 'e-1' },
      quest_tasks: [],
      has_template_tasks: false,
      ...extra
    })

    it('is hidden on an LMS quest, where the LMS owns completion', () => {
      questDetailData.quest = enrolled({ lms_platform: 'canvas' })
      renderQuestDetail()
      expect(screen.queryByText('End quest')).not.toBeInTheDocument()
    })

    it('is hidden while the student is mid-task inside a course lesson', () => {
      // They came from a lesson and are going back to it. Ending the whole
      // quest from here is never what that student meant.
      sessionStorage.setItem('courseTaskReturnInfo', JSON.stringify({ pathname: '/courses/1' }))
      try {
        questDetailData.quest = enrolled()
        renderQuestDetail()
        expect(screen.queryByText('End quest')).not.toBeInTheDocument()
      } finally {
        sessionStorage.removeItem('courseTaskReturnInfo')
      }
    })

    it('says how many tasks reopening would bring back', () => {
      questDetailData.quest = enrolled({ completed_enrollment: { id: 'e-1' } })
      questDetailData.isQuestCompleted = true
      questDetailData.totalTasks = 5
      questDetailData.completedTasks = 2

      renderQuestDetail()
      expect(screen.getByText(/3 tasks still/)).toBeInTheDocument()
    })
  })

  // ── Returning to a course lesson ──────────────────────────────────────────
  describe('finishing a task that was started from a course lesson', () => {
    it('goes back to the lesson and forgets the way back', async () => {
      // The key must be cleared, or every later completion on any quest
      // navigates the student into a lesson they are no longer in.
      sessionStorage.setItem(
        'courseTaskReturnInfo',
        JSON.stringify({ pathname: '/courses/c-1/lessons/l-2', search: '?tab=tasks' })
      )
      try {
        questDetailData.quest = {
          id: 'quest-123',
          title: 'Learn React Testing',
          user_enrollment: { id: 'e-1' },
          quest_tasks: [{ id: 'task-1', title: 'Read the brief', xp_value: 10, is_completed: false }],
          has_template_tasks: false,
          progress: { percentage: 0, completed_tasks: 0, total_tasks: 1 }
        }
        questDetailData.totalTasks = 1
        renderQuestDetail()

        fireEvent.click(await screen.findByTestId('complete-task-1'))

        await waitFor(() => {
          expect(sessionStorage.getItem('courseTaskReturnInfo')).toBeNull()
        })
        await waitFor(() => {
          expect(mockNavigate).toHaveBeenCalledWith('/courses/c-1/lessons/l-2?tab=tasks')
        }, { timeout: 3000 })
      } finally {
        sessionStorage.removeItem('courseTaskReturnInfo')
      }
    })
  })

  // ── Error state ───────────────────────────────────────────────────────────
  describe('the way out of an error, in focus mode', () => {
    // Focus mode hides the sidebar, the navbar and the quest browser, so
    // "Back to Quests" is a dead end: the kiosk student lands on a page with
    // no navigation and nothing to press. The program that entered focus mode
    // supplies its own home route.
    it('sends a kiosk student to the program home, not the quest browser', () => {
      localStorage.setItem('treehouse_focus', 'true')
      localStorage.setItem('focus_mode_config', JSON.stringify({ homeRoute: '/treehouse' }))
      questDetailData.error = { response: { status: 404 } }

      renderQuestDetail()

      expect(screen.queryByText('Back to Quests')).not.toBeInTheDocument()
      fireEvent.click(screen.getByText('Go Home'))
      expect(mockNavigate).toHaveBeenCalledWith('/treehouse')
    })

    it('sends everyone else to the quest browser', () => {
      questDetailData.error = { response: { status: 404 } }

      renderQuestDetail()

      expect(screen.queryByText('Go Home')).not.toBeInTheDocument()
      fireEvent.click(screen.getByText('Back to Quests'))
      expect(mockNavigate).toHaveBeenCalledWith('/quests')
    })
  })
})
