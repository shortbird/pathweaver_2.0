import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskLinker from '../TaskLinker'

global.fetch = vi.fn()

describe('TaskLinker Component', () => {
  const defaultProps = {
    questId: 'quest-123',
    lessonId: 'lesson-456',
    linkedTaskIds: [],
    onTaskLinked: vi.fn(),
    onTaskUnlinked: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch.mockReset()
  })

  describe('Basic Rendering', () => {
    it('renders task linker interface', () => {
      render(<TaskLinker {...defaultProps} />)
      expect(screen.getByText(/link tasks/i)).toBeInTheDocument()
    })

    it('shows available tasks', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          tasks: [{ id: 'task-1', title: 'Available Task' }]
        })
      })

      render(<TaskLinker {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Available Task')).toBeInTheDocument()
      })
    })
  })

  describe('Task Linking', () => {
    it('links task when selected', async () => {
      const user = userEvent.setup()
      const onTaskLinked = vi.fn()

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            tasks: [{ id: 'task-1', title: 'Task to Link' }]
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true })
        })

      render(<TaskLinker {...defaultProps} onTaskLinked={onTaskLinked} />)

      await waitFor(() => screen.getByText('Task to Link'))

      await user.click(screen.getByRole('button', { name: /link/i }))

      await waitFor(() => {
        expect(onTaskLinked).toHaveBeenCalled()
      })
    })

    it('unlinks task when requested', async () => {
      const user = userEvent.setup()
      const onTaskUnlinked = vi.fn()

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      })

      render(<TaskLinker {...defaultProps} linkedTaskIds={['task-1']} onTaskUnlinked={onTaskUnlinked} />)

      await user.click(screen.getByRole('button', { name: /unlink/i }))

      await waitFor(() => {
        expect(onTaskUnlinked).toHaveBeenCalledWith('task-1')
      })
    })
  })

  describe('Error Handling', () => {
    it('shows error on link failure', async () => {
      const user = userEvent.setup()

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            tasks: [{ id: 'task-1', title: 'Task' }]
          })
        })
        .mockRejectedValueOnce(new Error('Link failed'))

      render(<TaskLinker {...defaultProps} />)

      await waitFor(() => screen.getByText('Task'))

      await user.click(screen.getByRole('button', { name: /link/i }))

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument()
      })
    })
  })

  describe('Loading States', () => {
    it('shows loading indicator while fetching tasks', () => {
      global.fetch.mockImplementationOnce(() => new Promise(() => {}))

      render(<TaskLinker {...defaultProps} />)

      expect(screen.getByText(/loading/i)).toBeInTheDocument()
    })
  })
})
