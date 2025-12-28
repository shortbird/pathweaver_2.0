import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AITaskGenerator from '../AITaskGenerator'

// Mock API
global.fetch = vi.fn()

describe('AITaskGenerator Component', () => {
  const defaultProps = {
    questId: 'quest-123',
    lessonId: 'lesson-456',
    lessonContent: 'Sample lesson content about mathematics',
    onTasksGenerated: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch.mockReset()
  })

  describe('Basic Rendering', () => {
    it('renders generate button', () => {
      render(<AITaskGenerator {...defaultProps} />)
      expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument()
    })

    it('shows task count selector', () => {
      render(<AITaskGenerator {...defaultProps} />)
      expect(screen.getByLabelText(/number of tasks/i)).toBeInTheDocument()
    })
  })

  describe('Task Generation', () => {
    it('calls API when generate button is clicked', async () => {
      const user = userEvent.setup()
      const mockTasks = [
        { title: 'Task 1', description: 'Description 1', pillar: 'stem', estimated_xp: 100 }
      ]

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, tasks: mockTasks })
      })

      render(<AITaskGenerator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /generate/i }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/curriculum/lessons/lesson-456/generate-tasks'),
          expect.objectContaining({ method: 'POST' })
        )
      })
    })

    it('displays generated tasks', async () => {
      const user = userEvent.setup()
      const mockTasks = [
        { title: 'Math Task', description: 'Solve equations', pillar: 'stem', estimated_xp: 100 }
      ]

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, tasks: mockTasks })
      })

      render(<AITaskGenerator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /generate/i }))

      await waitFor(() => {
        expect(screen.getByText('Math Task')).toBeInTheDocument()
      })
    })

    it('shows loading state during generation', async () => {
      const user = userEvent.setup()

      global.fetch.mockImplementationOnce(() => new Promise(() => {}))

      render(<AITaskGenerator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /generate/i }))

      expect(screen.getByText(/generating/i)).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('displays error message on API failure', async () => {
      const user = userEvent.setup()

      global.fetch.mockRejectedValueOnce(new Error('API Error'))

      render(<AITaskGenerator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /generate/i }))

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument()
      })
    })

    it('handles missing lesson content', () => {
      render(<AITaskGenerator {...defaultProps} lessonContent="" />)
      expect(screen.getByRole('button')).toBeDisabled()
    })
  })

  describe('Task Selection', () => {
    it('allows selecting individual tasks', async () => {
      const user = userEvent.setup()
      const mockTasks = [
        { title: 'Task 1', description: 'Desc 1', pillar: 'stem', estimated_xp: 100 }
      ]

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, tasks: mockTasks })
      })

      render(<AITaskGenerator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /generate/i }))

      await waitFor(() => {
        const checkbox = screen.getByRole('checkbox')
        expect(checkbox).toBeInTheDocument()
      })
    })
  })
})
