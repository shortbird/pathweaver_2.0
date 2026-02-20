import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CurriculumView from './CurriculumView'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useLocation: () => ({ pathname: '/quests/q1' }) }
})

vi.mock('../../services/api', () => ({
  default: { get: vi.fn() }
}))

vi.mock('./utils/contentUtils', () => ({
  parseContentToSteps: (content) => {
    if (!content) return []
    if (content.steps) return content.steps
    return [{ title: 'Step 1', content: 'Hello', type: 'text' }]
  }
}))

vi.mock('./LessonItem', () => ({
  default: ({ lesson, isSelected, onClick }) => (
    <div data-testid={`lesson-item-${lesson.id}`} onClick={onClick}>
      {lesson.title}
    </div>
  )
}))

vi.mock('./LessonSlideViewer', () => ({
  default: ({ steps, currentStepIndex, lesson }) => (
    <div data-testid="slide-viewer">
      <span data-testid="lesson-title">{lesson?.title}</span>
    </div>
  )
}))

vi.mock('../../utils/pillarMappings', () => ({
  getPillarData: () => ({ label: 'Test', color: 'blue', icon: null })
}))

vi.mock('@heroicons/react/24/outline', () => ({
  Bars3Icon: (props) => <svg data-testid="bars-icon" {...props} />,
  CheckCircleIcon: (props) => <svg data-testid="check-icon" {...props} />,
  ClockIcon: (props) => <svg data-testid="clock-icon" {...props} />,
  XMarkIcon: (props) => <svg data-testid="x-icon" {...props} />,
  ArrowPathIcon: (props) => <svg data-testid="refresh-icon" {...props} />,
  AcademicCapIcon: (props) => <svg data-testid="academic-icon" {...props} />
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  PointerSensor: vi.fn(),
  TouchSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: () => []
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }) => <div>{children}</div>,
  verticalListSortingStrategy: 'vertical'
}))

import api from '../../services/api'

const mockLessons = [
  { id: 'l1', title: 'Lesson One', sequence_order: 1, content: { steps: [{ title: 'Step A', content: 'Content A', type: 'text' }] }, linked_task_ids: [] },
  { id: 'l2', title: 'Lesson Two', sequence_order: 2, content: null, linked_task_ids: [] }
]

function renderCurriculumView(props = {}) {
  return render(
    <MemoryRouter>
      <CurriculumView lessons={mockLessons} questId="q1" {...props} />
    </MemoryRouter>
  )
}

describe('CurriculumView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
    // Return proper array format for progress
    api.get.mockResolvedValue({ data: { lessons: [], tasks: [], progress: [] } })
  })

  describe('rendering with lessons prop', () => {
    it('renders lesson items', async () => {
      renderCurriculumView()
      await waitFor(() => {
        expect(screen.getByTestId('lesson-item-l1')).toBeInTheDocument()
        expect(screen.getByTestId('lesson-item-l2')).toBeInTheDocument()
      })
    })

    it('renders slide viewer when lesson is selected', async () => {
      renderCurriculumView({ selectedLessonId: 'l1' })
      await waitFor(() => {
        expect(screen.getByTestId('slide-viewer')).toBeInTheDocument()
      })
    })
  })

  describe('no lessons', () => {
    it('does not render lesson items when empty', async () => {
      renderCurriculumView({ lessons: [] })
      expect(screen.queryByTestId('lesson-item-l1')).not.toBeInTheDocument()
    })
  })

  describe('fetching data', () => {
    it('fetches tasks when questId provided', async () => {
      renderCurriculumView()
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled()
      })
    })
  })
})
