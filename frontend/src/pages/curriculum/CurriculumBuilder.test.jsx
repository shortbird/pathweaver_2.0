import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CurriculumBuilder from './CurriculumBuilder'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}))

vi.mock('../../components/curriculum/LessonBlockEditor', () => ({
  default: ({ lesson }) => (
    <div data-testid="lesson-editor">
      <span>Editing: {lesson?.title}</span>
    </div>
  )
}))

vi.mock('@heroicons/react/24/outline', () => ({
  PlusIcon: (props) => <svg data-testid="plus-icon" {...props} />,
  TrashIcon: (props) => <svg data-testid="trash-icon" {...props} />,
  Bars3Icon: (props) => <svg data-testid="bars-icon" {...props} />,
  EyeIcon: (props) => <svg data-testid="eye-icon" {...props} />,
  CheckCircleIcon: (props) => <svg data-testid="check-icon" {...props} />,
  ExclamationCircleIcon: (props) => <svg data-testid="exclamation-icon" {...props} />,
  ChevronLeftIcon: (props) => <svg data-testid="chevron-left" {...props} />,
  DocumentTextIcon: (props) => <svg data-testid="doc-icon" {...props} />,
  GlobeAltIcon: (props) => <svg data-testid="globe-icon" {...props} />,
  EyeSlashIcon: (props) => <svg data-testid="eye-slash-icon" {...props} />
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: () => []
}))

vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: (arr, from, to) => {
    const result = [...arr]
    const [item] = result.splice(from, 1)
    result.splice(to, 0, item)
    return result
  },
  SortableContext: ({ children }) => <div>{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: null,
    isDragging: false
  }),
  verticalListSortingStrategy: 'vertical'
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } }
}))

import api from '../../services/api'

const mockQuest = { id: 'q1', title: 'Robotics 101' }
const mockLessons = [
  { id: 'l1', title: 'Getting Started', sequence_order: 1, is_published: true, content: { blocks: [] } },
  { id: 'l2', title: 'Building Basics', sequence_order: 2, is_published: false, content: { blocks: [] } }
]

function renderBuilder() {
  return render(
    <MemoryRouter initialEntries={['/curriculum/q1/build']}>
      <Routes>
        <Route path="/curriculum/:questId/build" element={<CurriculumBuilder />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('CurriculumBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockImplementation((url) => {
      if (url.includes('/curriculum/lessons')) {
        return Promise.resolve({ data: { lessons: mockLessons } })
      }
      return Promise.resolve({ data: { quest: mockQuest } })
    })
  })

  describe('loading state', () => {
    it('shows spinner while loading', () => {
      api.get.mockImplementation(() => new Promise(() => {}))
      renderBuilder()
      expect(document.querySelector('.animate-spin')).toBeTruthy()
    })
  })

  describe('rendering', () => {
    it('renders Curriculum Builder heading', async () => {
      renderBuilder()
      await waitFor(() => {
        expect(screen.getByText('Curriculum Builder')).toBeInTheDocument()
      })
    })

    it('shows quest title subtitle', async () => {
      renderBuilder()
      await waitFor(() => {
        expect(screen.getByText('Robotics 101')).toBeInTheDocument()
      })
    })

    it('renders lesson titles in sidebar', async () => {
      renderBuilder()
      await waitFor(() => {
        // Lessons appear in both mobile and desktop sidebars
        const gettingStarted = screen.getAllByText('Getting Started')
        expect(gettingStarted.length).toBeGreaterThanOrEqual(1)
      })
    })

    it('renders lesson editor for first lesson', async () => {
      renderBuilder()
      await waitFor(() => {
        expect(screen.getByTestId('lesson-editor')).toBeInTheDocument()
      })
    })

    it('shows editing context for selected lesson', async () => {
      renderBuilder()
      await waitFor(() => {
        expect(screen.getByText('Editing: Getting Started')).toBeInTheDocument()
      })
    })

    it('renders back button', async () => {
      renderBuilder()
      await waitFor(() => {
        expect(screen.getByLabelText('Go back')).toBeInTheDocument()
      })
    })

    it('renders Add Lesson buttons', async () => {
      renderBuilder()
      await waitFor(() => {
        const addButtons = screen.getAllByText('Add Lesson')
        expect(addButtons.length).toBeGreaterThanOrEqual(1)
      })
    })

    it('shows Lessons count', async () => {
      renderBuilder()
      await waitFor(() => {
        expect(screen.getByText('2 total')).toBeInTheDocument()
      })
    })
  })
})
