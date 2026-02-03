import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { createMockUser } from '../../../tests/test-utils'
import CourseCatalog from '../CourseCatalog'
import api from '../../../services/api'

// Mock API
vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}))

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

// Mock navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

// Mock user for auth context
let mockUser = null

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: !!mockUser,
    loading: false
  })
}))

// Helper to render with router
const renderWithRouter = (component) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  )
}

describe('CourseCatalog', () => {
  const mockCourses = [
    {
      id: 'course-1',
      title: 'Introduction to Programming',
      description: 'Learn the basics of coding',
      status: 'published',
      cover_image_url: 'https://example.com/cover1.jpg',
      quest_count: 5,
      is_enrolled: false
    },
    {
      id: 'course-2',
      title: 'Advanced Mathematics',
      description: 'Deep dive into calculus',
      status: 'published',
      quest_count: 8,
      is_enrolled: true
    },
    {
      id: 'course-3',
      title: 'Draft Course',
      description: 'Work in progress',
      status: 'draft',
      quest_count: 2,
      is_enrolled: false
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockUser = null
    api.get.mockResolvedValue({ data: { courses: mockCourses } })
  })

  // ==================== Basic Rendering ====================
  describe('Basic Rendering', () => {
    it('renders course catalog header', async () => {
      mockUser = createMockUser({ role: 'student' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByText('Course Catalog')).toBeInTheDocument()
      })
    })

    it('renders search input', async () => {
      mockUser = createMockUser({ role: 'student' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search courses...')).toBeInTheDocument()
      })
    })

    it('renders course cards', async () => {
      mockUser = createMockUser({ role: 'student' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByText('Introduction to Programming')).toBeInTheDocument()
        expect(screen.getByText('Advanced Mathematics')).toBeInTheDocument()
      })
    })

    it('shows loading skeleton while fetching', async () => {
      api.get.mockImplementation(() => new Promise(() => {}))
      mockUser = createMockUser({ role: 'student' })

      renderWithRouter(<CourseCatalog />)

      // Should show loading skeletons
      const skeletons = document.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  // ==================== Role-based Display ====================
  describe('Role-based Display', () => {
    it('shows Create Course button for advisors', async () => {
      mockUser = createMockUser({ role: 'advisor' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create course/i })).toBeInTheDocument()
      })
    })

    it('shows Create Course button for org admins', async () => {
      mockUser = createMockUser({ role: 'org_admin' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create course/i })).toBeInTheDocument()
      })
    })

    it('shows Create Course button for superadmins', async () => {
      mockUser = createMockUser({ role: 'superadmin' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create course/i })).toBeInTheDocument()
      })
    })

    it('hides Create Course button for students', async () => {
      mockUser = createMockUser({ role: 'student' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByText('Introduction to Programming')).toBeInTheDocument()
      })
      expect(screen.queryByRole('button', { name: /create course/i })).not.toBeInTheDocument()
    })

    it('shows draft courses to admins', async () => {
      mockUser = createMockUser({ role: 'advisor' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByText('Draft Course')).toBeInTheDocument()
      })
    })

    it('hides draft courses from students', async () => {
      mockUser = createMockUser({ role: 'student' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByText('Introduction to Programming')).toBeInTheDocument()
      })
      // Draft course should be filtered out for students
      expect(screen.queryByText('Draft Course')).not.toBeInTheDocument()
    })

    it('shows Edit and View buttons for admins', async () => {
      mockUser = createMockUser({ role: 'advisor' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /edit/i }).length).toBeGreaterThan(0)
        expect(screen.getAllByRole('button', { name: /view|preview/i }).length).toBeGreaterThan(0)
      })
    })
  })

  // ==================== Search Functionality ====================
  describe('Search Functionality', () => {
    it('filters courses by title', async () => {
      const user = userEvent.setup()
      mockUser = createMockUser({ role: 'student' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByText('Introduction to Programming')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('Search courses...')
      await user.type(searchInput, 'mathematics')

      expect(screen.getByText('Advanced Mathematics')).toBeInTheDocument()
      expect(screen.queryByText('Introduction to Programming')).not.toBeInTheDocument()
    })

    it('filters courses by description', async () => {
      const user = userEvent.setup()
      mockUser = createMockUser({ role: 'student' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByText('Introduction to Programming')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('Search courses...')
      await user.type(searchInput, 'calculus')

      expect(screen.getByText('Advanced Mathematics')).toBeInTheDocument()
      expect(screen.queryByText('Introduction to Programming')).not.toBeInTheDocument()
    })

    it('shows no results message when search has no matches', async () => {
      const user = userEvent.setup()
      mockUser = createMockUser({ role: 'student' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByText('Introduction to Programming')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('Search courses...')
      await user.type(searchInput, 'nonexistentcourse')

      expect(screen.getByText('No courses found')).toBeInTheDocument()
    })

    it('search is case insensitive', async () => {
      const user = userEvent.setup()
      mockUser = createMockUser({ role: 'student' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByText('Introduction to Programming')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('Search courses...')
      await user.type(searchInput, 'PROGRAMMING')

      expect(screen.getByText('Introduction to Programming')).toBeInTheDocument()
    })
  })

  // ==================== Enrollment ====================
  describe('Enrollment', () => {
    it('shows Enroll Now button for unenrolled courses', async () => {
      mockUser = createMockUser({ role: 'student' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /enroll now/i })).toBeInTheDocument()
      })
    })

    it('shows View Course button for enrolled courses', async () => {
      mockUser = createMockUser({ role: 'student' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /view course/i })).toBeInTheDocument()
      })
    })

    it('enrolls in course and navigates on success', async () => {
      const user = userEvent.setup()
      mockUser = createMockUser({ role: 'student' })
      api.post.mockResolvedValueOnce({ data: { success: true } })

      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /enroll now/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /enroll now/i }))

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/courses/course-1/enroll', {})
        expect(mockNavigate).toHaveBeenCalledWith('/courses/course-1')
      })
    })
  })

  // ==================== Navigation ====================
  describe('Navigation', () => {
    it('navigates to create course page', async () => {
      const user = userEvent.setup()
      mockUser = createMockUser({ role: 'advisor' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create course/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /create course/i }))

      expect(mockNavigate).toHaveBeenCalledWith('/courses/new')
    })

    it('navigates to course edit page for admins', async () => {
      const user = userEvent.setup()
      mockUser = createMockUser({ role: 'advisor' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /edit/i })[0]).toBeInTheDocument()
      })

      await user.click(screen.getAllByRole('button', { name: /edit/i })[0])

      expect(mockNavigate).toHaveBeenCalledWith('/courses/course-1/edit')
    })

    it('navigates to course view page', async () => {
      const user = userEvent.setup()
      mockUser = createMockUser({ role: 'student' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /view course/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /view course/i }))

      expect(mockNavigate).toHaveBeenCalledWith('/courses/course-2')
    })
  })

  // ==================== Empty State ====================
  describe('Empty State', () => {
    it('shows empty state when no courses available', async () => {
      api.get.mockResolvedValueOnce({ data: { courses: [] } })
      mockUser = createMockUser({ role: 'student' })

      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByText('No courses available')).toBeInTheDocument()
        expect(screen.getByText('Check back later for new courses')).toBeInTheDocument()
      })
    })
  })

  // ==================== Course Display ====================
  describe('Course Display', () => {
    it('displays course description', async () => {
      mockUser = createMockUser({ role: 'student' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByText('Learn the basics of coding')).toBeInTheDocument()
      })
    })

    it('displays quest count', async () => {
      mockUser = createMockUser({ role: 'student' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByText('5 projects')).toBeInTheDocument()
      })
    })

    it('shows Draft badge for draft courses (admin only)', async () => {
      mockUser = createMockUser({ role: 'advisor' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByText('Draft')).toBeInTheDocument()
      })
    })

    it('shows Preview button for draft courses (admin)', async () => {
      mockUser = createMockUser({ role: 'advisor' })
      renderWithRouter(<CourseCatalog />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /preview/i })).toBeInTheDocument()
      })
    })
  })
})
