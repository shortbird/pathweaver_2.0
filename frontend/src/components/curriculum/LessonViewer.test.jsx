import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LessonViewer from './LessonViewer'

vi.mock('../../utils/pillarMappings', () => ({
  getPillarData: () => ({ label: 'Create', name: 'Create', color: 'blue', icon: '', text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' })
}))

vi.mock('./LessonContentRenderer', () => ({
  default: ({ content }) => <div data-testid="content-renderer">{content}</div>
}))

vi.mock('@heroicons/react/24/outline', () => ({
  CheckCircleIcon: (props) => <svg data-testid="check-outline" {...props} />,
  ClockIcon: (props) => <svg data-testid="clock-icon" {...props} />,
  PlayIcon: (props) => <svg data-testid="play-icon" {...props} />,
  DocumentTextIcon: (props) => <svg data-testid="doc-icon" {...props} />,
  LinkIcon: (props) => <svg data-testid="link-icon" {...props} />,
  ArrowDownTrayIcon: (props) => <svg data-testid="download-icon" {...props} />,
  VideoCameraIcon: (props) => <svg data-testid="camera-icon" {...props} />,
  AcademicCapIcon: (props) => <svg data-testid="academic-icon" {...props} />,
  XMarkIcon: (props) => <svg data-testid="x-icon" {...props} />
}))

vi.mock('@heroicons/react/24/solid', () => ({
  CheckCircleIcon: (props) => <svg data-testid="check-solid" {...props} />
}))

const mockLesson = {
  id: 'lesson-1',
  title: 'Introduction to Robotics',
  description: 'Learn about building robots',
  content: {
    blocks: [
      { type: 'text', content: 'Welcome to robotics.' }
    ],
    scaffolding: { younger: 'Use simpler terms', older: 'Add more theory' }
  },
  content_format: 'v1',
  estimated_duration_minutes: 15
}

const mockLinkedTasks = [
  { id: 't1', title: 'Build a simple robot', quest_id: 'q1', xp_value: 25, xp_amount: 25, is_completed: false, pillar: 'create' }
]

function renderLessonViewer(props = {}) {
  return render(
    <MemoryRouter>
      <LessonViewer
        lesson={mockLesson}
        linkedTasks={mockLinkedTasks}
        {...props}
      />
    </MemoryRouter>
  )
}

describe('LessonViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders lesson title', () => {
      renderLessonViewer()
      expect(screen.getByText('Introduction to Robotics')).toBeInTheDocument()
    })

    it('renders lesson description', () => {
      renderLessonViewer()
      expect(screen.getByText('Learn about building robots')).toBeInTheDocument()
    })

    it('renders content via LessonContentRenderer', () => {
      renderLessonViewer()
      expect(screen.getByTestId('content-renderer')).toBeInTheDocument()
    })

    it('renders estimated duration', () => {
      renderLessonViewer()
      expect(screen.getByText(/Estimated: 15 min/)).toBeInTheDocument()
    })

    it('renders time spent counter', () => {
      renderLessonViewer()
      expect(screen.getByText(/Time spent:/)).toBeInTheDocument()
    })

    it('renders Mark as Complete button when not completed', () => {
      renderLessonViewer()
      expect(screen.getByText('Mark as Complete')).toBeInTheDocument()
    })
  })

  describe('linked tasks', () => {
    it('renders Related Tasks section when tasks linked', () => {
      renderLessonViewer()
      expect(screen.getByText('Related Tasks')).toBeInTheDocument()
    })

    it('renders task title', () => {
      renderLessonViewer()
      expect(screen.getByText('Build a simple robot')).toBeInTheDocument()
    })

    it('does not show Related Tasks when no tasks linked', () => {
      renderLessonViewer({ linkedTasks: [] })
      expect(screen.queryByText('Related Tasks')).not.toBeInTheDocument()
    })
  })

  describe('no lesson', () => {
    it('renders nothing when lesson is null', () => {
      const { container } = renderLessonViewer({ lesson: null })
      expect(container.textContent).not.toContain('Introduction to Robotics')
    })
  })

  describe('completed state', () => {
    it('shows Completed badge when lesson is completed', () => {
      renderLessonViewer({ progress: { status: 'completed', completed_at: '2025-01-01' } })
      expect(screen.getByText('Completed')).toBeInTheDocument()
    })

    it('shows completed message', () => {
      renderLessonViewer({ progress: { status: 'completed', completed_at: '2025-01-01' } })
      expect(screen.getByText("You've completed this lesson!")).toBeInTheDocument()
    })

    it('hides Mark as Complete button when completed', () => {
      renderLessonViewer({ progress: { status: 'completed' } })
      expect(screen.queryByText('Mark as Complete')).not.toBeInTheDocument()
    })
  })

  describe('empty content', () => {
    it('shows no content message when lesson has no blocks or steps', () => {
      renderLessonViewer({ lesson: { ...mockLesson, content: { blocks: [] } } })
      expect(screen.getByText('No content available for this lesson yet.')).toBeInTheDocument()
    })
  })

  describe('scaffolding', () => {
    it('renders Age Adaptations button when scaffolding present', () => {
      renderLessonViewer()
      expect(screen.getByText('Age Adaptations')).toBeInTheDocument()
    })
  })
})
