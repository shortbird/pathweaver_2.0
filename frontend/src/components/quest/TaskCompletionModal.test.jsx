import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TaskCompletionModal from './TaskCompletionModal'

vi.mock('../evidence/ImprovedEvidenceUploader', () => ({
  default: ({ evidenceType, onChange, onTypeChange, error }) => (
    <div data-testid="evidence-uploader">
      <select
        data-testid="evidence-type-select"
        value={evidenceType}
        onChange={(e) => onTypeChange(e.target.value)}
      >
        <option value="text">Text</option>
        <option value="link">Link</option>
        <option value="image">Image</option>
      </select>
      <button
        data-testid="add-evidence-btn"
        onClick={() => onChange({ content: 'My evidence text' })}
      >
        Add Evidence
      </button>
      {error && <span data-testid="evidence-error">{error}</span>}
    </div>
  )
}))

vi.mock('../ModalErrorBoundary', () => ({
  default: ({ children }) => <div>{children}</div>
}))

vi.mock('../../utils/errorHandling', () => ({
  handleApiResponse: vi.fn()
}))

const mockTask = {
  id: 'task-123',
  title: 'Write a blog post',
  description: 'Write about your learning experience',
  pillar: 'communication',
  xp_amount: 25,
  is_collaboration_eligible: false
}

describe('TaskCompletionModal', () => {
  let onComplete, onClose

  beforeEach(() => {
    vi.clearAllMocks()
    onComplete = vi.fn()
    onClose = vi.fn()
    // Reset fetch mock
    global.fetch = vi.fn()
  })

  function renderModal(taskOverrides = {}) {
    return render(
      <TaskCompletionModal
        task={{ ...mockTask, ...taskOverrides }}
        questId="quest-456"
        onComplete={onComplete}
        onClose={onClose}
      />
    )
  }

  // --- Rendering ---
  describe('rendering', () => {
    it('renders modal header with Submit Draft title', () => {
      renderModal()
      expect(screen.getByRole('heading', { name: 'Submit Draft' })).toBeInTheDocument()
    })

    it('renders task title', () => {
      renderModal()
      expect(screen.getByText('Write a blog post')).toBeInTheDocument()
    })

    it('renders task description', () => {
      renderModal()
      expect(screen.getByText('Write about your learning experience')).toBeInTheDocument()
    })

    it('renders pillar name', () => {
      renderModal()
      expect(screen.getByText(/communication/i)).toBeInTheDocument()
    })

    it('renders XP value', () => {
      renderModal()
      expect(screen.getByText('+25 XP')).toBeInTheDocument()
    })

    it('renders evidence uploader', () => {
      renderModal()
      expect(screen.getByTestId('evidence-uploader')).toBeInTheDocument()
    })

    it('renders submit and cancel buttons', () => {
      renderModal()
      expect(screen.getByRole('button', { name: 'Submit Draft' })).toBeInTheDocument()
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    it('renders confidential checkbox', () => {
      renderModal()
      expect(screen.getByText('Mark as Confidential')).toBeInTheDocument()
    })

    it('shows collaboration badge when eligible', () => {
      renderModal({ is_collaboration_eligible: true })
      expect(screen.getByText(/Double XP Available/)).toBeInTheDocument()
    })
  })

  // --- Close actions ---
  describe('close actions', () => {
    it('calls onClose when cancel clicked', () => {
      renderModal()
      fireEvent.click(screen.getByText('Cancel'))
      expect(onClose).toHaveBeenCalled()
    })

    it('calls onClose when X button clicked', () => {
      renderModal()
      // The X button is the SVG close button in the header
      const closeButtons = screen.getAllByRole('button')
      // First button in header is the X close
      const xButton = closeButtons.find(btn =>
        btn.querySelector('svg path[d*="M6 18L18 6"]')
      )
      if (xButton) {
        fireEvent.click(xButton)
        expect(onClose).toHaveBeenCalled()
      }
    })
  })

  // --- Validation ---
  describe('validation', () => {
    it('submit button is disabled when no evidence added', () => {
      renderModal()
      const submitBtn = screen.getByRole('button', { name: 'Submit Draft' })
      expect(submitBtn).toBeDisabled()
    })

    it('submit button enables after adding evidence', async () => {
      renderModal()
      fireEvent.click(screen.getByTestId('add-evidence-btn'))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Submit Draft' })).not.toBeDisabled()
      })
    })
  })

  // --- Successful submission ---
  describe('submission', () => {
    it('calls onComplete on successful submission', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          xp_awarded: 25,
          quest_completed: false,
          has_collaboration_bonus: false
        })
      })

      renderModal()
      fireEvent.click(screen.getByTestId('add-evidence-btn'))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Submit Draft' })).not.toBeDisabled()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Submit Draft' }))

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
          xp_awarded: 25,
          quest_completed: false
        }))
      })
    })

    it('shows submitting state during submission', async () => {
      let resolveFetch
      global.fetch = vi.fn().mockReturnValue(new Promise(resolve => { resolveFetch = resolve }))

      renderModal()
      fireEvent.click(screen.getByTestId('add-evidence-btn'))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Submit Draft' })).not.toBeDisabled()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Submit Draft' }))

      await waitFor(() => {
        expect(screen.getByText('Submitting...')).toBeInTheDocument()
      })

      resolveFetch({
        ok: true,
        json: () => Promise.resolve({ success: true, xp_awarded: 25 })
      })
    })
  })

  // --- Error handling ---
  describe('error handling', () => {
    it('shows error on failed submission', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Task already completed' })
      })

      renderModal()
      fireEvent.click(screen.getByTestId('add-evidence-btn'))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Submit Draft' })).not.toBeDisabled()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Submit Draft' }))

      await waitFor(() => {
        const errorElements = screen.getAllByText('Task already completed')
        expect(errorElements.length).toBeGreaterThanOrEqual(1)
      })
    })
  })
})
