import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CourseCatalog from './CourseCatalog'

const mockNavigate = vi.fn()
let authState = {}

vi.mock('../../contexts/AuthContext', () => ({
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
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}))

// Mock heroicons
vi.mock('@heroicons/react/24/outline', () => ({
  MagnifyingGlassIcon: (props) => <svg data-testid="search-icon" {...props} />,
  AcademicCapIcon: (props) => <svg data-testid="cap-icon" {...props} />,
  CheckCircleIcon: (props) => <svg data-testid="check-icon" {...props} />,
  RocketLaunchIcon: (props) => <svg data-testid="rocket-icon" {...props} />,
  PencilSquareIcon: (props) => <svg data-testid="pencil-icon" {...props} />,
  PlusIcon: (props) => <svg data-testid="plus-icon" {...props} />,
  EyeIcon: (props) => <svg data-testid="eye-icon" {...props} />,
  GlobeAltIcon: (props) => <svg data-testid="globe-icon" {...props} />
}))

vi.mock('@heroicons/react/24/solid', () => ({
  CheckCircleIcon: (props) => <svg data-testid="check-solid-icon" {...props} />
}))

import api from '../../services/api'

function renderCatalog() {
  return render(
    <MemoryRouter initialEntries={['/courses']}>
      <Routes>
        <Route path="/courses" element={<CourseCatalog />} />
      </Routes>
    </MemoryRouter>
  )
}

const mockCourses = [
  {
    id: 'c1',
    title: 'Intro to Robotics',
    description: 'Build robots from scratch',
    status: 'published',
    quest_count: 3,
    is_enrolled: false,
    created_by: 'other-user'
  },
  {
    id: 'c2',
    title: 'Creative Writing',
    description: 'Express yourself through words',
    status: 'published',
    quest_count: 5,
    is_enrolled: true,
    created_by: 'other-user'
  },
  {
    id: 'c3',
    title: 'Advanced Math',
    description: 'Explore calculus and beyond',
    status: 'published',
    quest_count: 4,
    is_enrolled: true,
    progress: { percentage: 100, is_completed: true },
    created_by: 'other-user'
  }
]

describe('CourseCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: { id: 'user-1', role: 'student' } }

    api.get.mockResolvedValue({
      data: { courses: mockCourses }
    })
  })

  // --- Loading state ---
  describe('loading state', () => {
    it('shows skeleton cards while loading', () => {
      api.get.mockImplementation(() => new Promise(() => {}))
      renderCatalog()
      expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    })
  })

  // --- Rendering ---
  describe('rendering', () => {
    it('renders page heading', () => {
      renderCatalog()
      expect(screen.getByText('Course Catalog')).toBeInTheDocument()
    })

    it('renders search input', () => {
      renderCatalog()
      expect(screen.getByPlaceholderText('Search courses...')).toBeInTheDocument()
    })

    it('renders course cards after loading', async () => {
      renderCatalog()
      await waitFor(() => {
        expect(screen.getByText('Intro to Robotics')).toBeInTheDocument()
        expect(screen.getByText('Creative Writing')).toBeInTheDocument()
        expect(screen.getByText('Advanced Math')).toBeInTheDocument()
      })
    })

    it('renders course descriptions', async () => {
      renderCatalog()
      await waitFor(() => {
        expect(screen.getByText('Build robots from scratch')).toBeInTheDocument()
      })
    })

    it('renders project counts', async () => {
      renderCatalog()
      await waitFor(() => {
        expect(screen.getByText('3 projects')).toBeInTheDocument()
        expect(screen.getByText('5 projects')).toBeInTheDocument()
      })
    })
  })

  // --- Enrollment states ---
  describe('enrollment states', () => {
    it('shows Enroll Now button for unenrolled courses', async () => {
      renderCatalog()
      await waitFor(() => {
        expect(screen.getByText('Enroll Now')).toBeInTheDocument()
      })
    })

    it('shows View Course button for enrolled courses', async () => {
      renderCatalog()
      await waitFor(() => {
        // c2 and c3 are both enrolled, so multiple View Course buttons
        const viewButtons = screen.getAllByText('View Course')
        expect(viewButtons.length).toBeGreaterThanOrEqual(1)
      })
    })

    it('shows Completed badge for completed courses', async () => {
      renderCatalog()
      await waitFor(() => {
        expect(screen.getByText('Completed')).toBeInTheDocument()
      })
    })
  })

  // --- Admin view ---
  describe('admin view', () => {
    it('shows Create Course button for admins', async () => {
      authState = { user: { id: 'user-1', role: 'superadmin' } }
      api.get.mockResolvedValue({
        data: { courses: mockCourses }
      })
      renderCatalog()
      expect(screen.getByText('Create Course')).toBeInTheDocument()
    })

    it('does not show Create Course button for students', () => {
      authState = { user: { id: 'user-1', role: 'student' } }
      renderCatalog()
      expect(screen.queryByText('Create Course')).not.toBeInTheDocument()
    })

    it('shows draft courses to admins', async () => {
      authState = { user: { id: 'admin-1', role: 'superadmin' } }
      api.get.mockResolvedValue({
        data: {
          courses: [
            ...mockCourses,
            { id: 'c4', title: 'Draft Course', status: 'draft', quest_count: 0, created_by: 'admin-1' }
          ]
        }
      })
      renderCatalog()
      await waitFor(() => {
        expect(screen.getByText('Draft Course')).toBeInTheDocument()
        expect(screen.getByText('Draft')).toBeInTheDocument()
      })
    })
  })

  // --- Empty state ---
  describe('empty state', () => {
    it('shows empty message when no courses', async () => {
      api.get.mockResolvedValue({ data: { courses: [] } })
      renderCatalog()
      await waitFor(() => {
        expect(screen.getByText('No courses available')).toBeInTheDocument()
      })
    })

    it('shows no results message when search has no matches', async () => {
      renderCatalog()
      await waitFor(() => {
        expect(screen.getByText('Intro to Robotics')).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText('Search courses...')
      fireEvent.change(input, { target: { value: 'xyznonexistent' } })

      expect(screen.getByText('No courses found')).toBeInTheDocument()
    })
  })

  // --- Search ---
  describe('search', () => {
    it('filters courses by search term', async () => {
      renderCatalog()
      await waitFor(() => {
        expect(screen.getByText('Intro to Robotics')).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText('Search courses...')
      fireEvent.change(input, { target: { value: 'robot' } })

      expect(screen.getByText('Intro to Robotics')).toBeInTheDocument()
      expect(screen.queryByText('Creative Writing')).not.toBeInTheDocument()
    })
  })

  // --- Enrollment ---
  describe('enrollment action', () => {
    it('calls api.post on enroll and navigates', async () => {
      api.post.mockResolvedValue({ data: { success: true } })
      renderCatalog()
      await waitFor(() => {
        expect(screen.getByText('Enroll Now')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Enroll Now'))

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/courses/c1/enroll', {})
        expect(mockNavigate).toHaveBeenCalledWith('/courses/c1')
      })
    })
  })
})
