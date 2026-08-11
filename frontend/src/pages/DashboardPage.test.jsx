import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DashboardPage from './DashboardPage'
import api from '../services/api'

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
  useUserDashboard: () => dashboardHookData
}))

vi.mock('../hooks/api/useQuests', () => ({
  useGlobalEngagement: () => ({ data: engagementData }),
  useUnarchiveEnrollment: () => ({ mutate: vi.fn(), isPending: false })
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

  // --- School strip ---
  describe('school strip', () => {
    const emptyDashboard = () => ({
      data: { active_quests: [], enrolled_courses: [], stats: {} },
      isLoading: false,
      error: null,
      refetch: vi.fn()
    })

    it('renders nothing for students with no school', () => {
      dashboardHookData = emptyDashboard()
      renderDashboard()
      expect(screen.queryByText('See all')).not.toBeInTheDocument()
      expect(api.get).not.toHaveBeenCalledWith('/api/announcements/archive', expect.anything())
    })

    it('renders school name linking to /school with latest announcements', async () => {
      dashboardHookData = emptyDashboard()
      orgState = { school: { id: 'org-1', name: 'iCreate Academy' }, loading: false }
      api.get.mockResolvedValue({
        data: {
          success: true,
          announcements: [
            { id: 'a-1', title: 'Picture Day', content: '<p>Bring your <strong>smile</strong></p>', created_at: '2026-08-01T00:00:00Z' },
            { id: 'a-2', title: 'Fall Registration', message: 'Opens Monday', created_at: '2026-07-28T00:00:00Z' }
          ]
        }
      })
      renderDashboard()
      const schoolLink = screen.getByText('iCreate Academy')
      expect(schoolLink.closest('a')).toHaveAttribute('href', '/school')
      expect(screen.getByText('See all').closest('a')).toHaveAttribute('href', '/school')
      await waitFor(() => {
        expect(screen.getByText('Picture Day')).toBeInTheDocument()
        expect(screen.getByText('Fall Registration')).toBeInTheDocument()
      })
      // HTML bodies are stripped to text for the preview
      expect(screen.getByText('Bring your smile')).toBeInTheDocument()
      expect(api.get).toHaveBeenCalledWith('/api/announcements/archive', { params: { limit: 3 } })
    })

    it('degrades silently when the announcements read fails', async () => {
      dashboardHookData = emptyDashboard()
      orgState = { school: { id: 'org-1', name: 'iCreate Academy' }, loading: false }
      api.get.mockRejectedValue(new Error('down'))
      renderDashboard()
      // The strip still shows the school name and link, with no error UI
      expect(screen.getByText('iCreate Academy')).toBeInTheDocument()
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled()
      })
      expect(screen.getByText('See all')).toBeInTheDocument()
      expect(screen.queryByText(/failed to load announcements/i)).not.toBeInTheDocument()
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
})
