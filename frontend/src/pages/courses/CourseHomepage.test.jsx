import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CourseHomepage from './CourseHomepage'

const mockNavigate = vi.fn()
let courseHomepageData = {}

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

vi.mock('../../hooks/api/useCourseData', () => ({
  useCourseHomepage: () => courseHomepageData
}))

vi.mock('../../services/courseService', () => ({
  endCourse: vi.fn(),
  enrollInCourse: vi.fn(),
  unenrollFromCourse: vi.fn()
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() }
}))

// Mock CurriculumView
vi.mock('../../components/curriculum/CurriculumView', () => ({
  default: ({ questId, initialLessonId }) => (
    <div data-testid="curriculum-view">
      <span data-testid="cv-quest">{questId}</span>
      <span data-testid="cv-lesson">{initialLessonId}</span>
    </div>
  )
}))

// Mock heroicons
vi.mock('@heroicons/react/24/outline', () => ({
  ChevronLeftIcon: (props) => <svg data-testid="chevron-left" {...props} />,
  ChevronDownIcon: (props) => <svg data-testid="chevron-down" {...props} />,
  ChevronRightIcon: (props) => <svg data-testid="chevron-right" {...props} />,
  CheckCircleIcon: (props) => <svg data-testid="check-outline" {...props} />,
  LockClosedIcon: (props) => <svg data-testid="lock-icon" {...props} />,
  PlayCircleIcon: (props) => <svg data-testid="play-icon" {...props} />,
  BookOpenIcon: (props) => <svg data-testid="book-icon" {...props} />,
  ArrowsPointingOutIcon: (props) => <svg data-testid="expand-icon" {...props} />,
  ArrowsPointingInIcon: (props) => <svg data-testid="collapse-icon" {...props} />,
  ArrowRightStartOnRectangleIcon: (props) => <svg data-testid="exit-icon" {...props} />,
  ExclamationTriangleIcon: (props) => <svg data-testid="warning-icon" {...props} />,
  XMarkIcon: (props) => <svg data-testid="x-icon" {...props} />
}))

vi.mock('@heroicons/react/24/solid', () => ({
  CheckCircleIcon: (props) => <svg data-testid="check-solid" {...props} />,
  ExclamationCircleIcon: (props) => <svg data-testid="exclamation-solid" {...props} />
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } }
})

function renderCourseHomepage(courseId = 'course-123') {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
        <Routes>
          <Route path="/courses/:courseId" element={<CourseHomepage />} />
          <Route path="/courses" element={<div>Course List</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const mockQuests = [
  {
    id: 'quest-1',
    title: 'Build a Robot Arm',
    description: 'Design and build a mechanical arm',
    lessons: [
      { id: 'lesson-1', title: 'Servo Motors 101', progress: { status: 'completed' } },
      { id: 'lesson-2', title: 'Assembly Basics', progress: { status: 'in_progress' } }
    ],
    progress: {
      is_completed: true,
      can_complete: false,
      total_xp: 100,
      earned_xp: 100,
      percentage: 100,
      total_tasks: 5,
      completed_tasks: 5
    }
  },
  {
    id: 'quest-2',
    title: 'Program the Controller',
    description: 'Write code for the robot controller',
    lessons: [
      { id: 'lesson-3', title: 'Arduino Intro', progress: { status: null } }
    ],
    progress: {
      is_completed: false,
      can_complete: false,
      total_xp: 80,
      earned_xp: 30,
      percentage: 37,
      total_tasks: 4,
      completed_tasks: 1
    }
  }
]

const mockCourseData = {
  course: {
    id: 'course-123',
    title: 'Robotics 101',
    description: 'Learn the fundamentals of robotics',
    cover_image_url: null
  },
  quests: mockQuests,
  progress: {
    completed_quests: 1,
    total_quests: 2,
    percentage: 50,
    earned_xp: 130,
    total_xp: 180
  },
  enrollment: {
    id: 'enrollment-1',
    status: 'active'
  }
}

describe('CourseHomepage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()

    courseHomepageData = {
      data: mockCourseData,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    }
  })

  // --- Loading state ---
  describe('loading state', () => {
    it('shows spinner while loading', () => {
      courseHomepageData = { data: undefined, isLoading: true, error: null, refetch: vi.fn() }
      renderCourseHomepage()
      expect(document.querySelector('.animate-spin')).toBeTruthy()
    })
  })

  // --- Error state ---
  describe('error state', () => {
    it('shows error message on failure', () => {
      courseHomepageData = {
        data: undefined,
        isLoading: false,
        error: { message: 'Network error' },
        refetch: vi.fn()
      }
      renderCourseHomepage()
      expect(screen.getByText('Unable to load course')).toBeInTheDocument()
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })

    it('shows Go Back button on error', () => {
      courseHomepageData = {
        data: undefined,
        isLoading: false,
        error: { message: 'Not found' },
        refetch: vi.fn()
      }
      renderCourseHomepage()
      expect(screen.getByText('Go Back')).toBeInTheDocument()
    })
  })

  // --- Course overview (default view) ---
  describe('course overview', () => {
    it('renders course title in header', () => {
      renderCourseHomepage()
      // Title appears in header and overview
      const titles = screen.getAllByText('Robotics 101')
      expect(titles.length).toBeGreaterThanOrEqual(1)
    })

    it('renders course description', () => {
      renderCourseHomepage()
      expect(screen.getByText('Learn the fundamentals of robotics')).toBeInTheDocument()
    })

    it('renders Your Progress section', () => {
      renderCourseHomepage()
      expect(screen.getByText('Your Progress')).toBeInTheDocument()
      expect(screen.getByText(/1 of 2 projects completed/)).toBeInTheDocument()
    })

    it('renders Projects heading with grid', () => {
      renderCourseHomepage()
      expect(screen.getByText('Projects')).toBeInTheDocument()
    })

    it('renders project cards', () => {
      renderCourseHomepage()
      // Titles appear in both sidebar and overview grid
      const robotArm = screen.getAllByText('Build a Robot Arm')
      const controller = screen.getAllByText('Program the Controller')
      expect(robotArm.length).toBeGreaterThanOrEqual(2)
      expect(controller.length).toBeGreaterThanOrEqual(2)
    })
  })

  // --- Sidebar ---
  describe('sidebar', () => {
    it('shows project count in sidebar', () => {
      renderCourseHomepage()
      expect(screen.getByText('Projects (2)')).toBeInTheDocument()
    })

    it('shows quest titles in sidebar', () => {
      renderCourseHomepage()
      // Quest titles appear in both sidebar and overview
      const robotTitles = screen.getAllByText('Build a Robot Arm')
      expect(robotTitles.length).toBeGreaterThanOrEqual(1)
    })

    it('shows XP progress in sidebar', () => {
      renderCourseHomepage()
      expect(screen.getByText('130 / 180 XP')).toBeInTheDocument()
    })

    it('shows Course Progress percentage', () => {
      renderCourseHomepage()
      // 50% appears in both sidebar and overview
      const percentages = screen.getAllByText('50%')
      expect(percentages.length).toBeGreaterThanOrEqual(1)
    })
  })

  // --- Enrollment actions ---
  describe('enrollment actions', () => {
    it('shows Complete and Unenroll buttons when enrolled', () => {
      renderCourseHomepage()
      // These have hidden text on mobile, check for hidden span text
      const completeBtn = screen.getByTitle('Complete course (progress will be saved)')
      const unenrollBtn = screen.getByTitle('Unenroll from course (deletes all progress)')
      expect(completeBtn).toBeInTheDocument()
      expect(unenrollBtn).toBeInTheDocument()
    })

    it('shows Enroll button when not enrolled', () => {
      courseHomepageData = {
        ...courseHomepageData,
        data: {
          ...mockCourseData,
          enrollment: { id: null, status: null }
        }
      }
      renderCourseHomepage()
      expect(screen.getByTitle('Enroll in this course')).toBeInTheDocument()
    })
  })

  // --- Completed course ---
  describe('completed course', () => {
    it('shows Complete status when all projects done', () => {
      courseHomepageData = {
        ...courseHomepageData,
        data: {
          ...mockCourseData,
          progress: {
            ...mockCourseData.progress,
            percentage: 100,
            completed_quests: 2
          }
        }
      }
      renderCourseHomepage()
      // "Complete" appears in multiple places (header, sidebar, overview)
      const completeTexts = screen.getAllByText('Complete')
      expect(completeTexts.length).toBeGreaterThanOrEqual(1)
    })
  })

  // --- Empty projects ---
  describe('empty projects', () => {
    it('shows empty message when no projects', () => {
      courseHomepageData = {
        ...courseHomepageData,
        data: {
          ...mockCourseData,
          quests: []
        }
      }
      renderCourseHomepage()
      expect(screen.getByText('No projects in this course yet.')).toBeInTheDocument()
    })
  })
})
