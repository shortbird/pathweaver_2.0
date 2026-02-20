import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CourseDetailPage from './CourseDetailPage'

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
  default: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('../../services/courseService', () => ({
  getCourseById: vi.fn(),
  getCourseProgress: vi.fn(),
  enrollInCourse: vi.fn(),
  unenrollFromCourse: vi.fn()
}))

// Mock heroicons
vi.mock('@heroicons/react/24/outline', () => ({
  ArrowLeftIcon: (props) => <svg data-testid="arrow-left" {...props} />,
  AcademicCapIcon: (props) => <svg data-testid="cap-icon" {...props} />,
  CheckCircleIcon: (props) => <svg data-testid="check-icon" {...props} />
}))

import { getCourseById, getCourseProgress, enrollInCourse } from '../../services/courseService'

const mockCourse = {
  id: 'course-1',
  title: 'Web Development Basics',
  description: 'Learn HTML, CSS, and JavaScript',
  quests: [
    { id: 'q1', title: 'HTML Fundamentals', description: 'Learn HTML tags' },
    { id: 'q2', title: 'CSS Styling', description: 'Style your pages' },
    { id: 'q3', title: 'JavaScript Intro', description: 'Add interactivity' }
  ],
  badge: {
    name: 'Web Developer',
    description: 'Earned by completing Web Development Basics',
    image_url: null
  }
}

const mockProgress = {
  completed_quests: 1,
  quest_statuses: {
    'q1': { completed: true },
    'q2': { completed: false },
    'q3': { completed: false }
  }
}

function renderDetailPage(courseId = 'course-1') {
  return render(
    <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
      <Routes>
        <Route path="/courses/:id" element={<CourseDetailPage />} />
        <Route path="/courses" element={<div>Course List</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('CourseDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: { id: 'user-1', role: 'student' } }

    getCourseById.mockResolvedValue({ course: mockCourse })
    getCourseProgress.mockResolvedValue({ progress: mockProgress })
  })

  // --- Loading state ---
  describe('loading state', () => {
    it('shows spinner while loading', () => {
      getCourseById.mockImplementation(() => new Promise(() => {}))
      renderDetailPage()
      expect(document.querySelector('.animate-spin')).toBeTruthy()
    })
  })

  // --- Course not found ---
  describe('course not found', () => {
    it('shows not found message when course is null', async () => {
      getCourseById.mockRejectedValue(new Error('Not found'))
      renderDetailPage()
      await waitFor(() => {
        expect(screen.getByText('Course not found')).toBeInTheDocument()
      })
    })

    it('shows Back to Courses button', async () => {
      getCourseById.mockRejectedValue(new Error('Not found'))
      renderDetailPage()
      await waitFor(() => {
        expect(screen.getByText('Back to Courses')).toBeInTheDocument()
      })
    })
  })

  // --- Rendering (enrolled) ---
  describe('rendering - enrolled', () => {
    it('renders course title', async () => {
      renderDetailPage()
      await waitFor(() => {
        expect(screen.getByText('Web Development Basics')).toBeInTheDocument()
      })
    })

    it('renders About This Course section', async () => {
      renderDetailPage()
      await waitFor(() => {
        expect(screen.getByText('About This Course')).toBeInTheDocument()
        expect(screen.getByText('Learn HTML, CSS, and JavaScript')).toBeInTheDocument()
      })
    })

    it('renders quest count', async () => {
      renderDetailPage()
      await waitFor(() => {
        expect(screen.getByText('3 quests in this course')).toBeInTheDocument()
      })
    })

    it('renders quest list', async () => {
      renderDetailPage()
      await waitFor(() => {
        expect(screen.getByText('HTML Fundamentals')).toBeInTheDocument()
        expect(screen.getByText('CSS Styling')).toBeInTheDocument()
        expect(screen.getByText('JavaScript Intro')).toBeInTheDocument()
      })
    })

    it('renders progress section when enrolled', async () => {
      renderDetailPage()
      await waitFor(() => {
        expect(screen.getByText('Your Progress')).toBeInTheDocument()
        expect(screen.getByText('1 / 3 Quests')).toBeInTheDocument()
      })
    })

    it('renders badge preview', async () => {
      renderDetailPage()
      await waitFor(() => {
        expect(screen.getByText('Course Badge')).toBeInTheDocument()
        expect(screen.getByText('Web Developer')).toBeInTheDocument()
      })
    })

    it('shows Unenroll button when enrolled', async () => {
      renderDetailPage()
      await waitFor(() => {
        expect(screen.getByText('Unenroll')).toBeInTheDocument()
      })
    })
  })

  // --- Rendering (not enrolled) ---
  describe('rendering - not enrolled', () => {
    beforeEach(() => {
      getCourseProgress.mockRejectedValue({ response: { status: 404 } })
    })

    it('shows Enroll Now button', async () => {
      renderDetailPage()
      await waitFor(() => {
        expect(screen.getByText('Enroll Now')).toBeInTheDocument()
      })
    })

    it('does not show progress section', async () => {
      renderDetailPage()
      await waitFor(() => {
        expect(screen.getByText('Web Development Basics')).toBeInTheDocument()
      })
      expect(screen.queryByText('Your Progress')).not.toBeInTheDocument()
    })
  })

  // --- Enrollment ---
  describe('enrollment', () => {
    it('calls enrollInCourse on enroll click', async () => {
      getCourseProgress.mockRejectedValue({ response: { status: 404 } })
      enrollInCourse.mockResolvedValue({ success: true })
      // After enrollment, getCourseProgress needs to succeed
      getCourseProgress
        .mockRejectedValueOnce({ response: { status: 404 } })

      renderDetailPage()
      await waitFor(() => {
        expect(screen.getByText('Enroll Now')).toBeInTheDocument()
      })

      // Re-mock getCourseProgress for the post-enrollment call
      getCourseProgress.mockResolvedValue({ progress: { completed_quests: 0, quest_statuses: {} } })

      fireEvent.click(screen.getByText('Enroll Now'))

      await waitFor(() => {
        expect(enrollInCourse).toHaveBeenCalledWith('course-1')
      })
    })
  })
})
