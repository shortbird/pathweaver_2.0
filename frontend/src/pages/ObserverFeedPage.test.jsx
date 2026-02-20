import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ObserverFeedPage from './ObserverFeedPage'

const mockNavigate = vi.fn()
let authState = {}

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

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('../services/api', () => ({
  observerAPI: {
    getMyStudents: vi.fn(),
    getFeed: vi.fn()
  }
}))

// Mock FeedCard
vi.mock('../components/observer', () => ({
  FeedCard: ({ item }) => (
    <div data-testid={`feed-card-${item.id}`}>
      <span>{item.title || item.type}</span>
    </div>
  )
}))

vi.mock('@heroicons/react/24/outline', () => ({
  UsersIcon: (props) => <svg data-testid="users-icon" {...props} />,
  SparklesIcon: (props) => <svg data-testid="sparkles-icon" {...props} />,
  ArrowRightOnRectangleIcon: (props) => <svg data-testid="logout-icon" {...props} />,
  ChevronDownIcon: (props) => <svg data-testid="chevron-down" {...props} />,
  ArrowRightIcon: (props) => <svg data-testid="arrow-right" {...props} />
}))

import { observerAPI } from '../services/api'

function renderObserverFeed() {
  return render(
    <MemoryRouter initialEntries={['/observer/feed']}>
      <Routes>
        <Route path="/observer/feed" element={<ObserverFeedPage />} />
        <Route path="/login" element={<div>Login</div>} />
      </Routes>
    </MemoryRouter>
  )
}

const mockStudents = [
  { student_id: 'stu-1', student: { display_name: 'Alex Chen', first_name: 'Alex', last_name: 'Chen' } },
  { student_id: 'stu-2', student: { display_name: 'Sarah Park', first_name: 'Sarah', last_name: 'Park' } }
]

const mockFeedItems = [
  { id: 'feed-1', type: 'task_completion', title: 'Completed Math Quiz' },
  { id: 'feed-2', type: 'learning_event', title: 'Science Experiment' }
]

describe('ObserverFeedPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = {
      user: { id: 'observer-1', role: 'observer' },
      logout: vi.fn()
    }

    // Mock fetch for settings
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ site_name: 'Optio', logo_url: null })
    })

    observerAPI.getMyStudents.mockResolvedValue({
      data: { students: mockStudents }
    })
    observerAPI.getFeed.mockResolvedValue({
      data: { items: mockFeedItems, has_more: false, next_cursor: null }
    })
  })

  // --- Loading state ---
  describe('loading state', () => {
    it('shows spinner while loading', () => {
      observerAPI.getMyStudents.mockImplementation(() => new Promise(() => {}))
      renderObserverFeed()
      expect(document.querySelector('.animate-spin')).toBeTruthy()
    })
  })

  // --- Empty state (no students) ---
  describe('empty state', () => {
    it('shows no students message when empty', async () => {
      observerAPI.getMyStudents.mockResolvedValue({ data: { students: [] } })
      renderObserverFeed()
      await waitFor(() => {
        expect(screen.getByText('No Students Linked Yet')).toBeInTheDocument()
      })
    })

    it('shows invitation instructions', async () => {
      observerAPI.getMyStudents.mockResolvedValue({ data: { students: [] } })
      renderObserverFeed()
      await waitFor(() => {
        expect(screen.getByText(/Ask a parent to send you an invitation/)).toBeInTheDocument()
      })
    })
  })

  // --- Rendering with students ---
  describe('rendering with students', () => {
    it('renders Recent Activity heading', async () => {
      renderObserverFeed()
      await waitFor(() => {
        expect(screen.getByText('Recent Activity')).toBeInTheDocument()
      })
    })

    it('renders student filter dropdown', async () => {
      renderObserverFeed()
      await waitFor(() => {
        expect(screen.getByText(/All Students/)).toBeInTheDocument()
      })
    })

    it('shows student names in dropdown options', async () => {
      renderObserverFeed()
      await waitFor(() => {
        expect(screen.getByText('Alex Chen')).toBeInTheDocument()
        expect(screen.getByText('Sarah Park')).toBeInTheDocument()
      })
    })

    it('renders feed cards', async () => {
      renderObserverFeed()
      await waitFor(() => {
        expect(screen.getByTestId('feed-card-feed-1')).toBeInTheDocument()
        expect(screen.getByTestId('feed-card-feed-2')).toBeInTheDocument()
      })
    })

    it('shows Observer Feed header for observer role', async () => {
      renderObserverFeed()
      await waitFor(() => {
        expect(screen.getByText('Observer Feed')).toBeInTheDocument()
      })
    })

    it('shows Family Activity Feed header for parent role', async () => {
      authState = { user: { id: 'parent-1', role: 'parent' }, logout: vi.fn() }
      renderObserverFeed()
      await waitFor(() => {
        expect(screen.getByText('Family Activity Feed')).toBeInTheDocument()
      })
    })
  })

  // --- Empty feed ---
  describe('empty feed', () => {
    it('shows No Activity Yet when feed is empty', async () => {
      observerAPI.getFeed.mockResolvedValue({
        data: { items: [], has_more: false, next_cursor: null }
      })
      renderObserverFeed()
      await waitFor(() => {
        expect(screen.getByText('No Activity Yet')).toBeInTheDocument()
      })
    })
  })

  // --- Observer-only features ---
  describe('observer-only features', () => {
    it('shows Tips link for observer role', async () => {
      renderObserverFeed()
      await waitFor(() => {
        expect(screen.getByText('Tips')).toBeInTheDocument()
      })
    })

    it('shows Log out button for observer role', async () => {
      renderObserverFeed()
      await waitFor(() => {
        expect(screen.getByTitle('Log out')).toBeInTheDocument()
      })
    })

    it('shows Access Platform link for observer role', async () => {
      renderObserverFeed()
      await waitFor(() => {
        expect(screen.getByText('Access Platform')).toBeInTheDocument()
      })
    })
  })
})
