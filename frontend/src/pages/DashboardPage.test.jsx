import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DashboardPage from './DashboardPage'

let authState = {}
let actingAsState = {}
let dashboardHookData = {}
let engagementData = {}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('../contexts/ActingAsContext', () => ({
  useActingAs: () => actingAsState
}))

vi.mock('../hooks/api/useUserData', () => ({
  useUserDashboard: () => dashboardHookData
}))

vi.mock('../hooks/api/useQuests', () => ({
  useGlobalEngagement: () => ({ data: engagementData })
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

vi.mock('@heroicons/react/24/outline', () => ({
  RocketLaunchIcon: (props) => <svg data-testid="rocket-icon" {...props} />,
  CheckCircleIcon: (props) => <svg data-testid="check-icon" {...props} />,
  ArrowRightIcon: (props) => <svg data-testid="arrow-icon" {...props} />,
  ClipboardDocumentListIcon: (props) => <svg data-testid="clipboard-icon" {...props} />
}))

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

    it('renders View Portfolio link', () => {
      dashboardHookData = {
        data: { active_quests: [], enrolled_courses: [], stats: {} },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      }
      renderDashboard()
      expect(screen.getByText('View Portfolio')).toBeInTheDocument()
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

  // --- Recently completed ---
  describe('recently completed', () => {
    it('renders Recently Completed section when present', () => {
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
      expect(screen.getByText('Recently Completed')).toBeInTheDocument()
      expect(screen.getByText('Finished Quest')).toBeInTheDocument()
    })
  })
})
