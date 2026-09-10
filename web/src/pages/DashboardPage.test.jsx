import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DashboardPage from './DashboardPage'
import api from '../services/api'
import { useUserDashboard } from '../hooks/api/useUserData'

let authState = {}
let actingAsState = {}
let dashboardHookData = {}
let engagementData = {}
let orgState = {}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('../contexts/ActingAsContext', () => ({
  useActingAs: () => actingAsState
}))

vi.mock('../contexts/OrganizationContext', () => ({
  useOrganization: () => orgState
}))

vi.mock('../services/api', () => ({
  default: { get: vi.fn() }
}))

vi.mock('../hooks/api/useUserData', () => ({
  // A vi.fn, not a bare arrow: the id this page asks for is the thing that
  // broke twice (see "acting as a child", below), so the call has to be
  // inspectable.
  useUserDashboard: vi.fn(() => dashboardHookData)
}))

const unarchiveMutate = vi.fn()
vi.mock('../hooks/api/useQuests', () => ({
  useGlobalEngagement: () => ({ data: engagementData }),
  useUnarchiveEnrollment: () => ({ mutate: (...a) => unarchiveMutate(...a), isPending: false })
}))

// Mock child components
vi.mock('../components/quest/QuestCardSimple', () => ({
  default: ({ quest }) => (
    <div data-testid={`quest-card-${quest.id}`}>
      <span>{quest.title}</span>
    </div>
  )
}))

vi.mock('../components/course/CourseCardWithQuests', () => ({
  default: ({ course }) => (
    <div data-testid={`course-card-${course.id}`}>
      <span>{course.title}</span>
    </div>
  )
}))

vi.mock('../components/quest/RhythmIndicator', () => ({
  default: ({ stateDisplay }) => <span data-testid="rhythm-indicator">{stateDisplay}</span>
}))

vi.mock('../components/quest/EngagementCalendar', () => ({
  default: () => <div data-testid="engagement-calendar">Calendar</div>
}))

vi.mock('../components/quest/RhythmExplainerModal', () => ({
  default: () => null
}))

vi.mock('../components/learning-events/QuickCaptureButton', () => ({
  default: () => null
}))

vi.mock('@heroicons/react/24/outline', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    RocketLaunchIcon: (props) => <svg data-testid="rocket-icon" {...props} />,
    CheckCircleIcon: (props) => <svg data-testid="check-icon" {...props} />,
    ArrowRightIcon: (props) => <svg data-testid="arrow-icon" {...props} />,
    ClipboardDocumentListIcon: (props) => <svg data-testid="clipboard-icon" {...props} />
  }
})

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } }
})

function renderDashboard() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()

    authState = {
      user: { id: 'user-1', first_name: 'Alex', role: 'student', created_at: '2025-01-01T00:00:00Z' }
    }
    actingAsState = { actingAsDependent: null }
    orgState = { school: null, organization: null, loading: false }
    api.get.mockResolvedValue({ data: { success: true, announcements: [] } })
    engagementData = {
      rhythm: { state: 'building', state_display: 'Building Momentum', message: 'Keep going!' },
      calendar: { days: [], weeks_active: 2, first_activity_date: '2025-01-01' }
    }
    dashboardHookData = {
      data: null,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    }
  })

  // --- Loading state ---
  describe('loading state', () => {
    it('shows spinner while loading', () => {
      dashboardHookData = { data: null, isLoading: true, error: null, refetch: vi.fn() }
      renderDashboard()
      expect(document.querySelector('.animate-spin')).toBeTruthy()
    })
  })

  // --- Error state ---
  describe('error state', () => {
    it('shows error message on failure', () => {
      dashboardHookData = { data: null, isLoading: false, error: new Error('Server error'), refetch: vi.fn() }
      renderDashboard()
      expect(screen.getByText('Unable to load dashboard')).toBeInTheDocument()
    })

    it('shows retry button on error', () => {
      dashboardHookData = { data: null, isLoading: false, error: new Error('fail'), refetch: vi.fn() }
      renderDashboard()
      expect(screen.getByText('Retry')).toBeInTheDocument()
    })
  })

  // --- Rendering ---
  describe('rendering', () => {
    it('renders welcome message with user name', () => {
      dashboardHookData = {
        data: { active_quests: [], enrolled_courses: [], stats: { completed_quests_count: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      }
      renderDashboard()
      expect(screen.getByText(/Welcome back, Alex!/)).toBeInTheDocument()
    })

    it('renders Your Learning Rhythm section', () => {
      dashboardHookData = {
        data: { active_quests: [], enrolled_courses: [], stats: {} },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      }
      renderDashboard()
      expect(screen.getByText('Your Learning Rhythm')).toBeInTheDocument()
    })

    it('renders rhythm indicator', () => {
      dashboardHookData = {
        data: { active_quests: [], enrolled_courses: [], stats: {} },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      }
      renderDashboard()
      expect(screen.getByTestId('rhythm-indicator')).toBeInTheDocument()
    })

    it('renders engagement calendar', () => {
      dashboardHookData = {
        data: { active_quests: [], enrolled_courses: [], stats: {} },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      }
      renderDashboard()
      expect(screen.getByTestId('engagement-calendar')).toBeInTheDocument()
    })

    it('renders Next Up section', () => {
      dashboardHookData = {
        data: { active_quests: [], enrolled_courses: [], stats: {} },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      }
      renderDashboard()
      expect(screen.getByText('Next Up')).toBeInTheDocument()
    })

    it('renders Current Quests heading', () => {
      dashboardHookData = {
        data: { active_quests: [], enrolled_courses: [], stats: {} },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      }
      renderDashboard()
      expect(screen.getByText('Current Quests')).toBeInTheDocument()
    })

    it('renders Browse All Quests link', () => {
      dashboardHookData = {
        data: { active_quests: [], enrolled_courses: [], stats: {} },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      }
      renderDashboard()
      expect(screen.getByText(/Browse All Quests/)).toBeInTheDocument()
    })

    it('does not render the removed View Portfolio link (overview replaces /diploma)', () => {
      dashboardHookData = {
        data: { active_quests: [], enrolled_courses: [], stats: {} },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      }
      renderDashboard()
      expect(screen.queryByText('View Portfolio')).not.toBeInTheDocument()
    })
  })

  // --- Empty state ---
  describe('empty state', () => {
    it('shows Pick Up Your First Quest for new users', () => {
      dashboardHookData = {
        data: { active_quests: [], enrolled_courses: [], stats: { completed_quests_count: 0 } },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      }
      renderDashboard()
      expect(screen.getByText('Pick Up Your First Quest')).toBeInTheDocument()
    })

    it('shows Pick Up a New Quest for returning users', () => {
      dashboardHookData = {
        data: { active_quests: [], enrolled_courses: [], stats: { completed_quests_count: 3 } },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      }
      renderDashboard()
      expect(screen.getByText('Pick Up a New Quest')).toBeInTheDocument()
    })

    it('shows tasks-will-appear message when no active quests', () => {
      dashboardHookData = {
        data: { active_quests: [], enrolled_courses: [], stats: {} },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      }
      renderDashboard()
      expect(screen.getByText('Your tasks will appear here')).toBeInTheDocument()
    })
  })

  // --- Active quests ---
  describe('active quests', () => {
    it('renders quest cards when quests are active', () => {
      dashboardHookData = {
        data: {
          active_quests: [
            {
              id: 'eq-1',
              quest_id: 'q-1',
              quests: { title: 'Build a Robot', quest_tasks: [] },
              tasks_completed: 2,
              status: 'active',
              is_active: true
            }
          ],
          enrolled_courses: [],
          stats: { completed_quests_count: 0 }
        },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      }
      renderDashboard()
      expect(screen.getByText('Build a Robot')).toBeInTheDocument()
    })

    it('renders course cards when enrolled in courses', () => {
      dashboardHookData = {
        data: {
          active_quests: [],
          enrolled_courses: [
            { id: 'course-1', title: 'Intro to CS' }
          ],
          stats: { completed_quests_count: 0 }
        },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      }
      renderDashboard()
      expect(screen.getByText('Intro to CS')).toBeInTheDocument()
    })
  })

  // --- School strip (removed) ---
  // The dashboard used to carry a school strip linking to /school. It's gone:
  // the school lives in the sidebar, and the home page stays about the student's
  // own work. Regression guard so it doesn't creep back in.
  describe('no school strip', () => {
    it('renders no school link or announcements read for a student in a school', async () => {
      dashboardHookData = {
        data: { active_quests: [], enrolled_courses: [], stats: {} },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      }
      orgState = { school: { id: 'org-1', name: 'iCreate Academy' }, loading: false }
      renderDashboard()
      expect(screen.queryByText('iCreate Academy')).not.toBeInTheDocument()
      expect(screen.queryByText('See all')).not.toBeInTheDocument()
      expect(api.get).not.toHaveBeenCalledWith('/api/announcements/archive', expect.anything())
    })
  })

  // --- Assigned class quests ---
  describe('quests assigned through a class', () => {
    /**
     * There is no separate section for these any more (2026-09-02: "rory
     * already sees the science quest in a separate section in his homepage. I
     * just want it to appear like other quests instead of different").
     *
     * Assigning a quest now ENROLLS the class's students in it
     * (services/class_quest_enrollment), so it arrives in active_quests like a
     * quest the student started themselves, and the backend's
     * assigned_class_quests — which only ever listed assignments with no
     * enrollment — has nothing left to report.
     */
    it('shows an assigned quest in the ordinary quest list, not a tray of its own', () => {
      dashboardHookData = {
        data: {
          active_quests: [
            { id: 'uq-1', quest_id: 'q-assigned', quests: { id: 'q-assigned', title: 'Tide Pool Field Guide' } }
          ],
          enrolled_courses: [],
          stats: {},
        },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      }
      renderDashboard()
      expect(screen.getByText('Tide Pool Field Guide')).toBeInTheDocument()
      expect(screen.queryByText('From Your Classes')).not.toBeInTheDocument()
    })

    it('renders no separate section even if the API still sends assignments', () => {
      // The field is still on the payload for the mobile app; web must ignore it
      // rather than grow the tray back.
      dashboardHookData = {
        data: {
          active_quests: [],
          enrolled_courses: [],
          stats: {},
          assigned_class_quests: [
            {
              class_id: 'cls-1',
              class_name: 'Marine Biology',
              due_date: '2026-09-01',
              quest: { id: 'q-assigned', title: 'Tide Pool Field Guide' }
            }
          ]
        },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      }
      renderDashboard()
      expect(screen.queryByText('From Your Classes')).not.toBeInTheDocument()
      expect(screen.queryByText('Tide Pool Field Guide')).not.toBeInTheDocument()
    })
  })

  // --- Recently completed ---
  describe('recently completed', () => {
    it('renders Completed Quests section when present', () => {
      dashboardHookData = {
        data: {
          active_quests: [],
          enrolled_courses: [],
          stats: { completed_quests_count: 1 },
          recent_completed_quests: [
            {
              id: 'cq-1',
              quest_id: 'q-done',
              completed_at: '2025-06-01T12:00:00Z',
              quests: { title: 'Finished Quest', image_url: null, header_image_url: null }
            }
          ]
        },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      }
      renderDashboard()
      expect(screen.getByText('Completed Quests')).toBeInTheDocument()
      expect(screen.getByText('Finished Quest')).toBeInTheDocument()
    })
  })

  // ── Acting as a child ─────────────────────────────────────────────────────
  //
  // Broken twice: "Fix: Show dependent's dashboard when acting as dependent",
  // then "Fix: Display dependent's name and prevent parent API calls when
  // acting as dependent". Both halves matter and they fail differently. The
  // wrong id means the parent is looking at their own quests believing they
  // are the child's; the wrong name means the page greets the parent while
  // showing the child's work, which is how you stop trusting either.
  describe('acting as a child', () => {
    const withData = (over = {}) => ({
      data: { active_quests: [], enrolled_courses: [], stats: {}, ...over },
      isLoading: false,
      error: null,
      refetch: vi.fn()
    })

    it('asks for the child\'s dashboard, not the parent\'s', () => {
      authState = { user: { id: 'parent-1', first_name: 'Dana', created_at: '2020-01-01T00:00:00Z' } }
      actingAsState = { actingAsDependent: { id: 'kid-7', first_name: 'Rory' } }
      dashboardHookData = withData()

      renderDashboard()

      expect(useUserDashboard).toHaveBeenCalledWith('kid-7', expect.anything())
      expect(useUserDashboard).not.toHaveBeenCalledWith('parent-1', expect.anything())
    })

    it('greets the child by name', () => {
      authState = { user: { id: 'parent-1', first_name: 'Dana', created_at: '2020-01-01T00:00:00Z' } }
      actingAsState = { actingAsDependent: { id: 'kid-7', first_name: 'Rory' } }
      dashboardHookData = withData()

      renderDashboard()

      expect(screen.getByText(/Welcome back, Rory!/)).toBeInTheDocument()
      expect(screen.queryByText(/Dana/)).not.toBeInTheDocument()
    })

    it('asks for the logged-in user when nobody is being acted as', () => {
      dashboardHookData = withData()
      renderDashboard()
      expect(useUserDashboard).toHaveBeenCalledWith('user-1', expect.anything())
    })
  })

  // ── In progress vs finished ───────────────────────────────────────────────
  //
  // Two commits: "Fix: Trust backend active_quests array in dashboard (remove
  // frontend filter)" and "Fix: Check is_active for quest completion status in
  // dashboard display". active_quests carries both -- a restarted quest has
  // is_active true AND a completed_at from last time -- so the page splits the
  // one array into the two sections. Get it wrong and a student's finished
  // work sits in Current Quests forever, or work they are mid-way through is
  // filed as done.
  describe('splitting active quests into current and finished', () => {
    const quest = (id, over = {}) => ({
      id: `uq-${id}`,
      quest_id: id,
      quests: { id, title: `Quest ${id}` },
      ...over
    })

    const withQuests = (quests) => ({
      data: { active_quests: quests, enrolled_courses: [], stats: {} },
      isLoading: false,
      error: null,
      refetch: vi.fn()
    })

    it('files a quest with every task done under Completed', () => {
      dashboardHookData = withQuests([
        quest('q-done', { tasks_completed: 3, quests: { id: 'q-done', title: 'Finished', total_tasks: 3 } })
      ])
      renderDashboard()

      expect(screen.getByText('Completed Quests')).toBeInTheDocument()
      // No card in Current Quests -- the empty state is showing there instead.
      expect(screen.getByText('Pick Up Your First Quest')).toBeInTheDocument()
    })

    it('files a quest the backend marked completed under Completed', () => {
      dashboardHookData = withQuests([
        quest('q-x', { status: 'completed', quests: { id: 'q-x', title: 'Marked done', total_tasks: 5 }, tasks_completed: 1 })
      ])
      renderDashboard()
      expect(screen.getByText('Completed Quests')).toBeInTheDocument()
      expect(screen.getByText('Pick Up Your First Quest')).toBeInTheDocument()
    })

    it('keeps a part-finished quest in Current Quests', () => {
      dashboardHookData = withQuests([
        quest('q-wip', { tasks_completed: 1, quests: { id: 'q-wip', title: 'Halfway', total_tasks: 4 } })
      ])
      renderDashboard()
      expect(screen.getByText('Halfway')).toBeInTheDocument()
      expect(screen.queryByText('Completed Quests')).not.toBeInTheDocument()
    })

    it('keeps a quest with no tasks yet in Current Quests', () => {
      // 0 of 0 is not "all done" -- it is a quest the student has just picked
      // up and not personalized. Treating it as finished hides it on day one.
      dashboardHookData = withQuests([
        quest('q-new', { tasks_completed: 0, quests: { id: 'q-new', title: 'Just started', total_tasks: 0 } })
      ])
      renderDashboard()
      expect(screen.getByText('Just started')).toBeInTheDocument()
      expect(screen.queryByText('Completed Quests')).not.toBeInTheDocument()
    })

    it('shows both sections when the student has one of each', () => {
      dashboardHookData = withQuests([
        quest('q-wip', { tasks_completed: 1, quests: { id: 'q-wip', title: 'Halfway', total_tasks: 4 } }),
        quest('q-done', { tasks_completed: 2, quests: { id: 'q-done', title: 'Finished', total_tasks: 2 } })
      ])
      renderDashboard()
      expect(screen.getByText('Halfway')).toBeInTheDocument()
      expect(screen.getByText('Finished')).toBeInTheDocument()
      expect(screen.getByText('Completed Quests')).toBeInTheDocument()
    })

    it('renders every current quest, with no cap', () => {
      // 61a7caaa removed a 6-quest limit. A student with eight going should
      // see eight.
      const many = Array.from({ length: 8 }, (_, i) =>
        quest(`q-${i}`, { tasks_completed: 0, quests: { id: `q-${i}`, title: `Quest ${i}`, total_tasks: 3 } })
      )
      dashboardHookData = withQuests(many)
      renderDashboard()
      for (let i = 0; i < 8; i++) {
        expect(screen.getByTestId(`quest-card-q-${i}`)).toBeInTheDocument()
      }
    })
  })

  // ── Next Up ───────────────────────────────────────────────────────────────
  //
  // One task per quest, then four slots filled for pillar variety before
  // anything else. The rule is here so a student with four maths quests does
  // not get a panel of four maths tasks.
  describe('Next Up picks for variety', () => {
    const questWith = (id, tasks) => ({
      id: `uq-${id}`,
      quest_id: id,
      quests: { id, title: `Quest ${id}`, total_tasks: tasks.length, quest_tasks: tasks }
    })
    const task = (id, pillar) => ({ id, title: `Task ${id}`, pillar, is_completed: false })

    const withQuests = (quests) => ({
      data: { active_quests: quests, enrolled_courses: [], stats: {} },
      isLoading: false, error: null, refetch: vi.fn()
    })

    it('offers the first unfinished task of each quest', () => {
      dashboardHookData = withQuests([
        questWith('q1', [task('t1', 'stem'), task('t2', 'stem')])
      ])
      renderDashboard()
      expect(screen.getByText('Task t1')).toBeInTheDocument()
      expect(screen.queryByText('Task t2')).not.toBeInTheDocument()
    })

    it('skips over tasks that are already done', () => {
      dashboardHookData = withQuests([
        questWith('q1', [{ ...task('t1', 'stem'), is_completed: true }, task('t2', 'art')])
      ])
      renderDashboard()
      expect(screen.getByText('Task t2')).toBeInTheDocument()
    })

    it('shows at most four', () => {
      dashboardHookData = withQuests([
        questWith('q1', [task('t1', 'stem')]),
        questWith('q2', [task('t2', 'art')]),
        questWith('q3', [task('t3', 'civics')]),
        questWith('q4', [task('t4', 'wellness')]),
        questWith('q5', [task('t5', 'communication')])
      ])
      renderDashboard()
      const shown = ['t1', 't2', 't3', 't4', 't5']
        .filter(t => screen.queryByText(`Task ${t}`))
      expect(shown).toHaveLength(4)
    })

    it('reaches past a second quest of the same pillar to a new one', () => {
      // Five quests, four slots. The variety pass takes one per pillar, so the
      // SECOND stem quest loses its slot to the civics one further down the
      // list -- which is the whole point: a student with two maths quests and
      // a civics one should be offered the civics task.
      dashboardHookData = withQuests([
        questWith('q1', [task('t1', 'stem')]),
        questWith('q2', [task('t2', 'stem')]),
        questWith('q3', [task('t3', 'art')]),
        questWith('q4', [task('t4', 'wellness')]),
        questWith('q5', [task('t5', 'civics')])
      ])
      renderDashboard()

      expect(screen.getByText('Task t1')).toBeInTheDocument()
      expect(screen.getByText('Task t3')).toBeInTheDocument()
      expect(screen.getByText('Task t4')).toBeInTheDocument()
      expect(screen.getByText('Task t5')).toBeInTheDocument()
      expect(screen.queryByText('Task t2')).not.toBeInTheDocument()
    })

    it('still fills the panel when every quest is the same pillar', () => {
      // The variety pass takes one stem task and stops. The second pass exists
      // precisely so a single-subject student is not left with one suggestion.
      dashboardHookData = withQuests([
        questWith('q1', [task('t1', 'stem')]),
        questWith('q2', [task('t2', 'stem')]),
        questWith('q3', [task('t3', 'stem')])
      ])
      renderDashboard()
      expect(screen.getByText('Task t1')).toBeInTheDocument()
      expect(screen.getByText('Task t2')).toBeInTheDocument()
      expect(screen.getByText('Task t3')).toBeInTheDocument()
    })

    it('says the student is caught up rather than showing the new-user copy', () => {
      // "Your tasks will appear here" is for someone who has never started a
      // quest. Someone who finished everything gets told they finished.
      dashboardHookData = withQuests([
        questWith('q1', [{ ...task('t1', 'stem'), is_completed: true }])
      ])
      renderDashboard()
      expect(screen.getByText(/All caught up/)).toBeInTheDocument()
      expect(screen.queryByText('Your tasks will appear here')).not.toBeInTheDocument()
    })

    it('does not suggest tasks from a quest that is finished', () => {
      // Next Up reads the in-progress list, not the whole array.
      dashboardHookData = withQuests([
        { ...questWith('q1', [task('t1', 'stem')]), status: 'completed' }
      ])
      renderDashboard()
      expect(screen.queryByText('Task t1')).not.toBeInTheDocument()
    })
  })

  // ── Saved for Later ───────────────────────────────────────────────────────
  describe('saved-for-later quests', () => {
    const withArchived = (archived) => ({
      data: { active_quests: [], enrolled_courses: [], stats: {}, archived_quests: archived },
      isLoading: false, error: null, refetch: vi.fn()
    })

    it('keeps set-aside quests out of Completed', () => {
      // A paused quest is not a finished one. Filing it under Completed tells
      // a family the work is done.
      dashboardHookData = withArchived([
        { id: 'a-1', quest_id: 'q-1', archived_at: '2026-05-01T00:00:00Z', quests: { title: 'Set aside' } }
      ])
      renderDashboard()
      expect(screen.getByText('Saved for Later')).toBeInTheDocument()
      expect(screen.getByText('Set aside')).toBeInTheDocument()
      expect(screen.queryByText('Completed Quests')).not.toBeInTheDocument()
    })

    it('says the progress is safe', () => {
      dashboardHookData = withArchived([
        { id: 'a-1', quest_id: 'q-1', archived_at: '2026-05-01T00:00:00Z', quests: { title: 'Set aside' } }
      ])
      renderDashboard()
      expect(screen.getByText(/Your progress is safe/)).toBeInTheDocument()
    })

    it('resumes the quest that was clicked', () => {
      dashboardHookData = withArchived([
        { id: 'a-1', quest_id: 'q-1', archived_at: '2026-05-01T00:00:00Z', quests: { title: 'First' } },
        { id: 'a-2', quest_id: 'q-2', archived_at: '2026-05-02T00:00:00Z', quests: { title: 'Second' } }
      ])
      renderDashboard()

      fireEvent.click(screen.getAllByRole('button', { name: 'Resume' })[1])

      expect(unarchiveMutate).toHaveBeenCalledTimes(1)
      expect(unarchiveMutate).toHaveBeenCalledWith({ questId: 'q-2' })
    })

    it('shows no section when nothing is set aside', () => {
      dashboardHookData = withArchived([])
      renderDashboard()
      expect(screen.queryByText('Saved for Later')).not.toBeInTheDocument()
    })
  })

  // ── First visit ───────────────────────────────────────────────────────────
  describe('the first five minutes of an account', () => {
    const base = {
      data: { active_quests: [], enrolled_courses: [], stats: {} },
      isLoading: false, error: null, refetch: vi.fn()
    }

    it('welcomes a brand-new account', () => {
      authState = { user: { id: 'u', first_name: 'Alex', created_at: new Date().toISOString() } }
      dashboardHookData = base
      renderDashboard()
      expect(screen.getByText('Welcome to Optio, Alex!')).toBeInTheDocument()
      expect(screen.getByText(/Start your learning journey/)).toBeInTheDocument()
    })

    it('welcomes an established account back', () => {
      const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      authState = { user: { id: 'u', first_name: 'Alex', created_at: anHourAgo } }
      dashboardHookData = base
      renderDashboard()
      expect(screen.getByText('Welcome back, Alex!')).toBeInTheDocument()
    })

    it('treats an account with no created_at as established', () => {
      authState = { user: { id: 'u', first_name: 'Alex' } }
      dashboardHookData = base
      renderDashboard()
      expect(screen.getByText('Welcome back, Alex!')).toBeInTheDocument()
    })
  })

  // ── SSO landing ───────────────────────────────────────────────────────────
  describe('the sso_pending flag left in the URL', () => {
    // 0b20bb1d. The SSO handshake lands here with ?sso_pending=1. Leaving it in
    // the address bar means the flag survives a bookmark and a refresh, and
    // the next visit re-enters a handshake that already finished.
    it('removes the flag and keeps everything else', () => {
      window.history.replaceState({}, '', '/dashboard?sso_pending=1&ref=email')
      dashboardHookData = {
        data: { active_quests: [], enrolled_courses: [], stats: {} },
        isLoading: false, error: null, refetch: vi.fn()
      }

      renderDashboard()

      expect(window.location.search).not.toContain('sso_pending')
      expect(window.location.search).toContain('ref=email')
      window.history.replaceState({}, '', '/')
    })

    it('leaves an ordinary URL alone', () => {
      window.history.replaceState({}, '', '/dashboard?ref=email')
      dashboardHookData = {
        data: { active_quests: [], enrolled_courses: [], stats: {} },
        isLoading: false, error: null, refetch: vi.fn()
      }

      renderDashboard()

      expect(window.location.search).toBe('?ref=email')
      window.history.replaceState({}, '', '/')
    })
  })
})
