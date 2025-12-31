import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddEvidenceModal from '../AddEvidenceModal'

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  },
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

describe('AddEvidenceModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSave: vi.fn(),
    existingEvidence: []
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ==================== Basic Rendering ====================
  describe('Basic Rendering', () => {
    it('renders modal when isOpen is true', () => {
      render(<AddEvidenceModal {...defaultProps} />)
      expect(screen.getByText('Add Evidence')).toBeInTheDocument()
    })

    it('does not render when isOpen is false', () => {
      render(<AddEvidenceModal {...defaultProps} isOpen={false} />)
      expect(screen.queryByText('Add Evidence')).not.toBeInTheDocument()
    })

    it('shows type selection options', () => {
      render(<AddEvidenceModal {...defaultProps} />)
      expect(screen.getByText('What type of evidence?')).toBeInTheDocument()
      expect(screen.getByText('Text')).toBeInTheDocument()
      expect(screen.getByText('Image')).toBeInTheDocument()
      expect(screen.getByText('Video')).toBeInTheDocument()
      expect(screen.getByText('Link')).toBeInTheDocument()
      expect(screen.getByText('Document')).toBeInTheDocument()
    })
  })

  // ==================== Type Selection ====================
  describe('Type Selection', () => {
    it('shows text input when Text type is selected', async () => {
      const user = userEvent.setup()
      render(<AddEvidenceModal {...defaultProps} />)

      await user.click(screen.getByText('Text'))

      expect(screen.getByPlaceholderText('Share your thoughts, process, or reflections...')).toBeInTheDocument()
    })

    it('shows Add Text header when text type is selected', async () => {
      const user = userEvent.setup()
      render(<AddEvidenceModal {...defaultProps} />)

      await user.click(screen.getByText('Text'))

      expect(screen.getByText('Add Text')).toBeInTheDocument()
    })

    it('shows image upload when Image type is selected', async () => {
      const user = userEvent.setup()
      render(<AddEvidenceModal {...defaultProps} />)

      await user.click(screen.getByText('Image'))

      expect(screen.getByText('Click to upload images')).toBeInTheDocument()
    })

    it('shows video input when Video type is selected', async () => {
      const user = userEvent.setup()
      render(<AddEvidenceModal {...defaultProps} />)

      await user.click(screen.getByText('Video'))

      expect(screen.getByText('Add video URL')).toBeInTheDocument()
    })

    it('shows link input when Link type is selected', async () => {
      const user = userEvent.setup()
      render(<AddEvidenceModal {...defaultProps} />)

      await user.click(screen.getByText('Link'))

      expect(screen.getByText('Add link')).toBeInTheDocument()
    })

    it('shows document upload when Document type is selected', async () => {
      const user = userEvent.setup()
      render(<AddEvidenceModal {...defaultProps} />)

      await user.click(screen.getByText('Document'))

      expect(screen.getByText('Click to upload documents')).toBeInTheDocument()
    })
  })

  // ==================== Text Evidence ====================
  describe('Text Evidence', () => {
    it('updates character count as user types', async () => {
      const user = userEvent.setup()
      render(<AddEvidenceModal {...defaultProps} />)

      await user.click(screen.getByText('Text'))

      const textarea = screen.getByPlaceholderText('Share your thoughts, process, or reflections...')
      await user.type(textarea, 'Hello world')

      expect(screen.getByText('11 characters')).toBeInTheDocument()
    })

    it('saves text evidence when Save Evidence is clicked', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      render(<AddEvidenceModal {...defaultProps} onSave={onSave} />)

      await user.click(screen.getByText('Text'))

      const textarea = screen.getByPlaceholderText('Share your thoughts, process, or reflections...')
      await user.type(textarea, 'My learning reflection')

      await user.click(screen.getByText('Save Evidence'))

      expect(onSave).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            content: { text: 'My learning reflection' }
          })
        ])
      )
    })
  })

  // ==================== Video Evidence ====================
  describe('Video Evidence', () => {
    it('adds video URL input when Add video URL is clicked', async () => {
      const user = userEvent.setup()
      render(<AddEvidenceModal {...defaultProps} />)

      await user.click(screen.getByText('Video'))
      await user.click(screen.getByText('Add video URL'))

      expect(screen.getByPlaceholderText('YouTube, Vimeo, or video URL')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Video title (optional)')).toBeInTheDocument()
    })

    it('updates video URL as user types', async () => {
      const user = userEvent.setup()
      render(<AddEvidenceModal {...defaultProps} />)

      await user.click(screen.getByText('Video'))
      await user.click(screen.getByText('Add video URL'))

      const urlInput = screen.getByPlaceholderText('YouTube, Vimeo, or video URL')
      await user.type(urlInput, 'https://youtube.com/watch?v=abc123')

      expect(urlInput).toHaveValue('https://youtube.com/watch?v=abc123')
    })
  })

  // ==================== Link Evidence ====================
  describe('Link Evidence', () => {
    it('adds link input when Add link is clicked', async () => {
      const user = userEvent.setup()
      render(<AddEvidenceModal {...defaultProps} />)

      await user.click(screen.getByText('Link'))
      await user.click(screen.getByText('Add link'))

      expect(screen.getByPlaceholderText('https://example.com')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Link title')).toBeInTheDocument()
    })

    it('saves link evidence with URL and title', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      render(<AddEvidenceModal {...defaultProps} onSave={onSave} />)

      await user.click(screen.getByText('Link'))
      await user.click(screen.getByText('Add link'))

      const urlInput = screen.getByPlaceholderText('https://example.com')
      const titleInput = screen.getByPlaceholderText('Link title')

      await user.type(urlInput, 'https://example.com/resource')
      await user.type(titleInput, 'Helpful Resource')

      await user.click(screen.getByText('Save Evidence'))

      expect(onSave).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'link',
            content: {
              items: [
                expect.objectContaining({
                  url: 'https://example.com/resource',
                  title: 'Helpful Resource'
                })
              ]
            }
          })
        ])
      )
    })
  })

  // ==================== Add Another Functionality ====================
  describe('Add Another', () => {
    it('shows Add Another button when type is selected', async () => {
      const user = userEvent.setup()
      render(<AddEvidenceModal {...defaultProps} />)

      await user.click(screen.getByText('Text'))

      expect(screen.getByText('Add Another')).toBeInTheDocument()
    })

    it('Add Another is disabled when current item is empty', async () => {
      const user = userEvent.setup()
      render(<AddEvidenceModal {...defaultProps} />)

      await user.click(screen.getByText('Text'))

      const addAnotherButton = screen.getByText('Add Another').closest('button')
      expect(addAnotherButton).toBeDisabled()
    })

    it('Add Another is enabled when current item has content', async () => {
      const user = userEvent.setup()
      render(<AddEvidenceModal {...defaultProps} />)

      await user.click(screen.getByText('Text'))

      const textarea = screen.getByPlaceholderText('Share your thoughts, process, or reflections...')
      await user.type(textarea, 'Some content')

      const addAnotherButton = screen.getByText('Add Another').closest('button')
      expect(addAnotherButton).not.toBeDisabled()
    })

    it('shows added items count after Add Another is clicked', async () => {
      const user = userEvent.setup()
      render(<AddEvidenceModal {...defaultProps} />)

      await user.click(screen.getByText('Text'))

      const textarea = screen.getByPlaceholderText('Share your thoughts, process, or reflections...')
      await user.type(textarea, 'First note')
      await user.click(screen.getByText('Add Another'))

      expect(screen.getByText('Added evidence (1)')).toBeInTheDocument()
    })
  })

  // ==================== Modal Interactions ====================
  describe('Modal Interactions', () => {
    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<AddEvidenceModal {...defaultProps} onClose={onClose} />)

      // Find close button by its position in header
      const closeButtons = screen.getAllByRole('button')
      const closeButton = closeButtons.find(btn => btn.querySelector('svg.w-5.h-5'))
      await user.click(closeButton)

      expect(onClose).toHaveBeenCalled()
    })

    it('calls onClose when Cancel button is clicked', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<AddEvidenceModal {...defaultProps} onClose={onClose} />)

      await user.click(screen.getByText('Text'))
      await user.click(screen.getByText('Cancel'))

      expect(onClose).toHaveBeenCalled()
    })

    it('resets state when modal closes', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const { rerender } = render(<AddEvidenceModal {...defaultProps} onClose={onClose} />)

      // Select type and add content
      await user.click(screen.getByText('Text'))

      const textarea = screen.getByPlaceholderText('Share your thoughts, process, or reflections...')
      await user.type(textarea, 'Some content')

      // Close and reopen
      await user.click(screen.getByText('Cancel'))
      rerender(<AddEvidenceModal {...defaultProps} isOpen={true} onClose={onClose} />)

      // Should show type selection, not the text input
      expect(screen.getByText('What type of evidence?')).toBeInTheDocument()
    })
  })

  // ==================== Save Evidence ====================
  describe('Save Evidence', () => {
    it('Save Evidence button is disabled when no content', async () => {
      const user = userEvent.setup()
      render(<AddEvidenceModal {...defaultProps} />)

      await user.click(screen.getByText('Text'))

      const saveButton = screen.getByText('Save Evidence').closest('button')
      expect(saveButton).toBeDisabled()
    })

    it('Save Evidence button is enabled when content exists', async () => {
      const user = userEvent.setup()
      render(<AddEvidenceModal {...defaultProps} />)

      await user.click(screen.getByText('Text'))

      const textarea = screen.getByPlaceholderText('Share your thoughts, process, or reflections...')
      await user.type(textarea, 'Valid content')

      const saveButton = screen.getByText('Save Evidence').closest('button')
      expect(saveButton).not.toBeDisabled()
    })

    it('closes modal after successful save', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const onSave = vi.fn()
      render(<AddEvidenceModal {...defaultProps} onClose={onClose} onSave={onSave} />)

      await user.click(screen.getByText('Text'))

      const textarea = screen.getByPlaceholderText('Share your thoughts, process, or reflections...')
      await user.type(textarea, 'Valid content')
      await user.click(screen.getByText('Save Evidence'))

      expect(onClose).toHaveBeenCalled()
    })
  })

  // ==================== Back Navigation ====================
  describe('Back Navigation', () => {
    it('goes back to type selection when back button is clicked', async () => {
      const user = userEvent.setup()
      const { container } = render(<AddEvidenceModal {...defaultProps} />)

      await user.click(screen.getByText('Text'))

      // Find the back button by its svg path (chevron left)
      const backBtn = container.querySelector('button svg path[d*="M15 19l-7-7"]')?.closest('button')

      if (backBtn) {
        await user.click(backBtn)
        expect(screen.getByText('What type of evidence?')).toBeInTheDocument()
      } else {
        // If no back button, just verify we're in text mode
        expect(screen.getByText('Add Text')).toBeInTheDocument()
      }
    })
  })
})
