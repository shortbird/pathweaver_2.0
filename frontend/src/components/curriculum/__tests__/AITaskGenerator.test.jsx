import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AITaskGenerator from '../AITaskGenerator'
import api from '../../../services/api'

// Mock API service
vi.mock('../../../services/api', () => ({
  default: {
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

describe('AITaskGenerator Component', () => {
  const defaultProps = {
    questId: 'quest-123',
    lessonId: 'lesson-456',
    onTasksAdded: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Rendering', () => {
    it('renders generate button', () => {
      render(<AITaskGenerator {...defaultProps} />)
      expect(screen.getByRole('button', { name: /generate tasks from lesson/i })).toBeInTheDocument()
    })

    it('shows task count input', () => {
      render(<AITaskGenerator {...defaultProps} />)
      expect(screen.getByLabelText(/number of tasks to generate/i)).toBeInTheDocument()
    })

    it('renders AI Task Generator heading', () => {
      render(<AITaskGenerator {...defaultProps} />)
      expect(screen.getByText('AI Task Generator')).toBeInTheDocument()
    })
  })

  describe('Task Generation', () => {
    it('calls API when generate button is clicked', async () => {
      const user = userEvent.setup()
      const mockTasks = [
        { title: 'Task 1', description: 'Description 1', pillar: 'Growth Mindset', xp_value: 50 }
      ]

      api.post.mockResolvedValueOnce({
        data: { success: true, tasks: mockTasks }
      })

      render(<AITaskGenerator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /generate tasks from lesson/i }))

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/api/lessons/lesson-456/generate-tasks',
          expect.objectContaining({
            count: 3,
            quest_id: 'quest-123'
          })
        )
      })
    })

    it('displays generated tasks', async () => {
      const user = userEvent.setup()
      const mockTasks = [
        { title: 'Math Task', description: 'Solve equations', pillar: 'Growth Mindset', xp_value: 50 }
      ]

      api.post.mockResolvedValueOnce({
        data: { success: true, tasks: mockTasks }
      })

      render(<AITaskGenerator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /generate tasks from lesson/i }))

      await waitFor(() => {
        expect(screen.getByText('Math Task')).toBeInTheDocument()
      })
    })

    it('shows loading state during generation', async () => {
      const user = userEvent.setup()

      // Never resolve the promise to keep loading state
      api.post.mockImplementationOnce(() => new Promise(() => {}))

      render(<AITaskGenerator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /generate tasks from lesson/i }))

      expect(screen.getByText(/generating tasks/i)).toBeInTheDocument()
    })

    it('respects task count input', async () => {
      const user = userEvent.setup()

      api.post.mockResolvedValueOnce({
        data: { success: true, tasks: [] }
      })

      render(<AITaskGenerator {...defaultProps} />)

      const input = screen.getByLabelText(/number of tasks to generate/i)
      await user.clear(input)
      await user.type(input, '5')
      await user.click(screen.getByRole('button', { name: /generate tasks from lesson/i }))

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ count: 5 })
        )
      })
    })
  })

  describe('Error Handling', () => {
    it('displays error message on API failure', async () => {
      const user = userEvent.setup()

      api.post.mockRejectedValueOnce(new Error('API Error'))

      render(<AITaskGenerator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /generate tasks from lesson/i }))

      await waitFor(() => {
        expect(screen.getByText(/generation failed/i)).toBeInTheDocument()
      })
    })

    it('shows retry button on error', async () => {
      const user = userEvent.setup()

      api.post.mockRejectedValueOnce(new Error('API Error'))

      render(<AITaskGenerator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /generate tasks from lesson/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
      })
    })
  })

  describe('Task Actions', () => {
    it('allows accepting tasks', async () => {
      const user = userEvent.setup()
      const mockTasks = [
        { title: 'Task 1', description: 'Desc 1', pillar: 'Growth Mindset', xp_value: 50 }
      ]

      api.post.mockResolvedValueOnce({
        data: { success: true, tasks: mockTasks }
      })

      render(<AITaskGenerator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /generate tasks from lesson/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /accept task/i })).toBeInTheDocument()
      })
    })

    it('allows rejecting tasks', async () => {
      const user = userEvent.setup()
      const mockTasks = [
        { title: 'Task 1', description: 'Desc 1', pillar: 'Growth Mindset', xp_value: 50 }
      ]

      api.post.mockResolvedValueOnce({
        data: { success: true, tasks: mockTasks }
      })

      render(<AITaskGenerator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /generate tasks from lesson/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject task/i })).toBeInTheDocument()
      })
    })

    it('shows Add to Quest button after accepting tasks', async () => {
      const user = userEvent.setup()
      const mockTasks = [
        { title: 'Task 1', description: 'Desc 1', pillar: 'Growth Mindset', xp_value: 50 }
      ]

      api.post.mockResolvedValueOnce({
        data: { success: true, tasks: mockTasks }
      })

      render(<AITaskGenerator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /generate tasks from lesson/i }))

      await waitFor(() => {
        expect(screen.getByText('Task 1')).toBeInTheDocument()
      })

      // Accept the task
      await user.click(screen.getByRole('button', { name: /accept task/i }))

      expect(screen.getByRole('button', { name: /add 1 task to quest/i })).toBeInTheDocument()
    })
  })
})
