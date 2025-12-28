import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CurriculumView from '../CurriculumView'

// Mock dependencies
vi.mock('../../utils/pillarMappings', () => ({
  getPillarData: vi.fn(() => ({ color: '#8B5CF6', icon: 'AcademicCapIcon' }))
}))

describe('CurriculumView Component', () => {
  const mockLessons = [
    { id: '1', title: 'Lesson 1', pillar: 'stem', duration_minutes: 30, is_completed: false },
    { id: '2', title: 'Lesson 2', pillar: 'art', duration_minutes: 45, is_completed: true },
    { id: '3', title: 'Lesson 3', pillar: 'wellness', duration_minutes: 20, is_completed: false }
  ]

  const defaultProps = {
    lessons: mockLessons,
    selectedLessonId: null,
    isAdmin: false,
    onLessonSelect: vi.fn(),
    onLessonsReorder: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Rendering', () => {
    it('renders curriculum view with lessons', () => {
      render(<CurriculumView {...defaultProps} />)
      expect(screen.getByText('Lesson 1')).toBeInTheDocument()
      expect(screen.getByText('Lesson 2')).toBeInTheDocument()
      expect(screen.getByText('Lesson 3')).toBeInTheDocument()
    })

    it('renders empty state when no lessons', () => {
      render(<CurriculumView {...defaultProps} lessons={[]} />)
      expect(screen.queryByText('Lesson 1')).not.toBeInTheDocument()
    })

    it('renders lesson durations', () => {
      render(<CurriculumView {...defaultProps} />)
      expect(screen.getByText('30 min')).toBeInTheDocument()
      expect(screen.getByText('45 min')).toBeInTheDocument()
      expect(screen.getByText('20 min')).toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    it('calls onLessonSelect when lesson is clicked', async () => {
      const user = userEvent.setup()
      const onLessonSelect = vi.fn()

      render(<CurriculumView {...defaultProps} onLessonSelect={onLessonSelect} />)

      await user.click(screen.getByText('Lesson 1'))

      expect(onLessonSelect).toHaveBeenCalledWith('1')
    })

    it('highlights selected lesson', () => {
      const { container } = render(
        <CurriculumView {...defaultProps} selectedLessonId="1" />
      )

      const selectedLesson = container.querySelector('[class*="border-2"]')
      expect(selectedLesson).toBeInTheDocument()
    })
  })

  describe('Admin Features', () => {
    it('shows drag handles when isAdmin is true', () => {
      const { container } = render(
        <CurriculumView {...defaultProps} isAdmin={true} />
      )

      const dragHandles = container.querySelectorAll('[class*="cursor-grab"]')
      expect(dragHandles.length).toBeGreaterThan(0)
    })

    it('hides drag handles when isAdmin is false', () => {
      const { container } = render(
        <CurriculumView {...defaultProps} isAdmin={false} />
      )

      const dragHandles = container.querySelectorAll('[class*="cursor-grab"]')
      expect(dragHandles.length).toBe(0)
    })
  })

  describe('Completion Status', () => {
    it('shows completed status for completed lessons', () => {
      const { container } = render(<CurriculumView {...defaultProps} />)

      const completedIcons = container.querySelectorAll('[class*="text-green"]')
      expect(completedIcons.length).toBeGreaterThan(0)
    })

    it('applies completed styling to completed lessons', () => {
      const { container } = render(<CurriculumView {...defaultProps} />)

      const completedLesson = screen.getByText('Lesson 2').closest('div')
      expect(completedLesson).toHaveStyle({ backgroundColor: 'rgb(240, 253, 244)' })
    })
  })

  describe('Error States', () => {
    it('handles null lessons gracefully', () => {
      render(<CurriculumView {...defaultProps} lessons={null} />)
      expect(screen.queryByText('Lesson 1')).not.toBeInTheDocument()
    })

    it('handles undefined onLessonSelect', () => {
      render(<CurriculumView {...defaultProps} onLessonSelect={undefined} />)
      expect(screen.getByText('Lesson 1')).toBeInTheDocument()
    })
  })
})
