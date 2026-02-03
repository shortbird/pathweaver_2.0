import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CurriculumEditor from '../CurriculumEditor'

global.fetch = vi.fn()

describe('CurriculumEditor Component', () => {
  const defaultProps = {
    questId: 'quest-123',
    initialLessons: [],
    onSave: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Rendering', () => {
    it('renders editor interface', () => {
      render(<CurriculumEditor {...defaultProps} />)
      expect(screen.getByRole('button', { name: /add lesson/i })).toBeInTheDocument()
    })

    it('renders existing lessons', () => {
      const lessons = [{ id: '1', title: 'Test Lesson', content: {} }]
      render(<CurriculumEditor {...defaultProps} initialLessons={lessons} />)
      expect(screen.getByText('Test Lesson')).toBeInTheDocument()
    })
  })

  describe('Lesson Creation', () => {
    it('opens lesson form when add button clicked', async () => {
      const user = userEvent.setup()
      render(<CurriculumEditor {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /add lesson/i }))

      expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
    })

    it('creates new lesson with valid data', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, lesson: { id: '1', title: 'New Lesson' } })
      })

      render(<CurriculumEditor {...defaultProps} onSave={onSave} />)

      await user.click(screen.getByRole('button', { name: /add lesson/i }))
      await user.type(screen.getByLabelText(/title/i), 'New Lesson')
      await user.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })
    })
  })

  describe('Lesson Editing', () => {
    it('allows editing existing lessons', async () => {
      const user = userEvent.setup()
      const lessons = [{ id: '1', title: 'Edit Me', content: {} }]

      render(<CurriculumEditor {...defaultProps} initialLessons={lessons} />)

      await user.click(screen.getByRole('button', { name: /edit/i }))

      expect(screen.getByDisplayValue('Edit Me')).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('shows error on save failure', async () => {
      const user = userEvent.setup()

      global.fetch.mockRejectedValueOnce(new Error('Save failed'))

      render(<CurriculumEditor {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /add lesson/i }))
      await user.type(screen.getByLabelText(/title/i), 'Test')
      await user.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument()
      })
    })
  })
})
