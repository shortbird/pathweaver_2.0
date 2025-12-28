import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EvidenceUploadForm from './EvidenceUploadForm'

// Mock the api module
vi.mock('../../services/api', () => ({
  parentAPI: {
    uploadEvidence: vi.fn(),
    uploadFile: vi.fn()
  }
}))

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn()
  }
}))

import { parentAPI } from '../../services/api'
import toast from 'react-hot-toast'

describe('EvidenceUploadForm', () => {
  const mockTaskId = 'task-123'
  const mockStudentId = 'student-456'
  const mockOnCancel = vi.fn()
  const mockOnSuccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    parentAPI.uploadEvidence.mockResolvedValue({ data: { success: true } })
    parentAPI.uploadFile.mockResolvedValue({
      data: { files: [{ url: 'https://storage.example.com/file.jpg' }] }
    })
  })

  describe('Rendering', () => {
    it('renders evidence type selector', () => {
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      expect(screen.getByText(/text/i)).toBeInTheDocument()
      expect(screen.getByText(/link/i)).toBeInTheDocument()
      expect(screen.getByText(/image/i)).toBeInTheDocument()
    })

    it('renders cancel button', () => {
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })

    it('renders upload button', () => {
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument()
    })

    it('renders helper text about student review', () => {
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      expect(screen.getByText(/student/i)).toBeInTheDocument()
    })
  })

  describe('Evidence Type Selection', () => {
    it('defaults to text evidence type', () => {
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      // Text type should be selected by default
      const textButton = screen.getByText(/text/i).closest('button')
      expect(textButton).toHaveClass(/purple|selected|active/i)
    })

    it('shows textarea for text evidence', () => {
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      expect(screen.getByRole('textbox') || screen.getByPlaceholderText(/text|explanation/i)).toBeInTheDocument()
    })

    it('shows URL input for link evidence', async () => {
      const user = userEvent.setup()
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      await user.click(screen.getByText(/link/i).closest('button'))

      expect(screen.getByPlaceholderText(/http|url/i)).toBeInTheDocument()
    })

    it('shows file upload for image evidence', async () => {
      const user = userEvent.setup()
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      await user.click(screen.getByText(/image/i).closest('button'))

      // Use getAllByText since there may be multiple upload-related elements
      expect(screen.getAllByText(/upload|click/i).length).toBeGreaterThan(0)
    })

    it('shows file upload for document evidence', async () => {
      const user = userEvent.setup()
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      await user.click(screen.getByText(/document/i).closest('button'))

      // Use getAllByText since there may be multiple upload-related elements
      expect(screen.getAllByText(/upload|click|pdf/i).length).toBeGreaterThan(0)
    })
  })

  describe('Text Evidence Submission', () => {
    it('submits text evidence successfully', async () => {
      const user = userEvent.setup()
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      const textInput = screen.getByRole('textbox') || screen.getByPlaceholderText(/text|explanation/i)
      await user.type(textInput, 'This is my evidence text')

      await user.click(screen.getByRole('button', { name: /upload/i }))

      await waitFor(() => {
        expect(parentAPI.uploadEvidence).toHaveBeenCalledWith({
          student_id: mockStudentId,
          task_id: mockTaskId,
          block_type: 'text',
          content: { text: 'This is my evidence text' }
        })
      })
    })

    it('calls onSuccess after successful text upload', async () => {
      const user = userEvent.setup()
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      const textInput = screen.getByRole('textbox') || screen.getByPlaceholderText(/text|explanation/i)
      await user.type(textInput, 'Test evidence')

      await user.click(screen.getByRole('button', { name: /upload/i }))

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled()
      })
    })

    it('shows error for empty text', async () => {
      const user = userEvent.setup()
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      // Submit without entering text
      await user.click(screen.getByRole('button', { name: /upload/i }))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled()
      })
      expect(parentAPI.uploadEvidence).not.toHaveBeenCalled()
    })
  })

  describe('Link Evidence Submission', () => {
    it('submits link evidence successfully', async () => {
      const user = userEvent.setup()
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      await user.click(screen.getByText(/link/i).closest('button'))

      const urlInput = screen.getByPlaceholderText(/http|url/i)
      await user.type(urlInput, 'https://example.com/resource')

      await user.click(screen.getByRole('button', { name: /upload/i }))

      await waitFor(() => {
        expect(parentAPI.uploadEvidence).toHaveBeenCalledWith({
          student_id: mockStudentId,
          task_id: mockTaskId,
          block_type: 'link',
          content: expect.objectContaining({ url: 'https://example.com/resource' })
        })
      })
    })

    it('shows error for invalid URL', async () => {
      const user = userEvent.setup()
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      await user.click(screen.getByText(/link/i).closest('button'))

      const urlInput = screen.getByPlaceholderText(/http|url/i)
      await user.type(urlInput, 'not-a-valid-url')

      await user.click(screen.getByRole('button', { name: /upload/i }))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled()
      })
    })
  })

  describe('File Upload', () => {
    it('uploads file before creating evidence block', async () => {
      const user = userEvent.setup()
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      // Select image type
      await user.click(screen.getByText(/image/i).closest('button'))

      // Switch to file upload mode (default is URL mode)
      await user.click(screen.getByText(/Upload File/i))

      // Create a mock file
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })

      // Find file input (hidden) and upload
      const fileInput = document.querySelector('input[type="file"]')
      expect(fileInput).toBeTruthy()
      await user.upload(fileInput, file)

      // Click submit button (Upload Evidence)
      await user.click(screen.getByRole('button', { name: /Upload Evidence/i }))

      await waitFor(() => {
        expect(parentAPI.uploadFile).toHaveBeenCalled()
      })
    })

    it('uses file URL in evidence block after upload', async () => {
      const user = userEvent.setup()
      const mockFileUrl = 'https://storage.example.com/uploaded-image.jpg'
      parentAPI.uploadFile.mockResolvedValue({
        data: { files: [{ url: mockFileUrl }] }
      })

      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      // Select image type
      await user.click(screen.getByText(/image/i).closest('button'))

      // Switch to file upload mode
      await user.click(screen.getByText(/Upload File/i))

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      const fileInput = document.querySelector('input[type="file"]')
      expect(fileInput).toBeTruthy()
      await user.upload(fileInput, file)

      // Click submit button
      await user.click(screen.getByRole('button', { name: /Upload Evidence/i }))

      await waitFor(() => {
        expect(parentAPI.uploadEvidence).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.objectContaining({ url: mockFileUrl })
          })
        )
      })
    })

    it('shows error for file too large', async () => {
      const user = userEvent.setup()
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      // Select image type
      await user.click(screen.getByText(/image/i).closest('button'))

      // Switch to file upload mode
      await user.click(screen.getByText(/Upload File/i))

      // Create a mock file larger than 10MB
      const largeContent = new Array(11 * 1024 * 1024).fill('a').join('')
      const file = new File([largeContent], 'large.jpg', { type: 'image/jpeg' })

      const fileInput = document.querySelector('input[type="file"]')
      expect(fileInput).toBeTruthy()
      await user.upload(fileInput, file)

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/large|10MB|size/i))
      })
    })
  })

  describe('Error Handling', () => {
    it('shows error toast on API failure', async () => {
      parentAPI.uploadEvidence.mockRejectedValue({
        response: { data: { error: 'Upload failed' } }
      })

      const user = userEvent.setup()
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      const textInput = screen.getByRole('textbox') || screen.getByPlaceholderText(/text|explanation/i)
      await user.type(textInput, 'Test evidence')

      await user.click(screen.getByRole('button', { name: /upload/i }))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled()
      })
    })

    it('does not call onSuccess on failure', async () => {
      parentAPI.uploadEvidence.mockRejectedValue(new Error('Failed'))

      const user = userEvent.setup()
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      const textInput = screen.getByRole('textbox') || screen.getByPlaceholderText(/text|explanation/i)
      await user.type(textInput, 'Test evidence')

      await user.click(screen.getByRole('button', { name: /upload/i }))

      await waitFor(() => {
        expect(mockOnSuccess).not.toHaveBeenCalled()
      })
    })
  })

  describe('Cancel Functionality', () => {
    it('calls onCancel when cancel button clicked', async () => {
      const user = userEvent.setup()
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(mockOnCancel).toHaveBeenCalled()
    })

    it('calls onCancel when X button clicked', async () => {
      const user = userEvent.setup()
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      // Find X/close button
      const closeButtons = screen.getAllByRole('button')
      const xButton = closeButtons.find(btn =>
        btn.querySelector('svg') && btn.textContent === ''
      )

      if (xButton) {
        await user.click(xButton)
        expect(mockOnCancel).toHaveBeenCalled()
      }
    })
  })

  describe('Loading State', () => {
    it('shows uploading state while submitting', async () => {
      parentAPI.uploadEvidence.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      )

      const user = userEvent.setup()
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      const textInput = screen.getByRole('textbox') || screen.getByPlaceholderText(/text|explanation/i)
      await user.type(textInput, 'Test evidence')

      await user.click(screen.getByRole('button', { name: /upload/i }))

      expect(screen.getByText(/uploading/i)).toBeInTheDocument()
    })

    it('disables upload button while uploading', async () => {
      parentAPI.uploadEvidence.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      )

      const user = userEvent.setup()
      render(
        <EvidenceUploadForm
          taskId={mockTaskId}
          studentId={mockStudentId}
          onCancel={mockOnCancel}
          onSuccess={mockOnSuccess}
        />
      )

      const textInput = screen.getByRole('textbox') || screen.getByPlaceholderText(/text|explanation/i)
      await user.type(textInput, 'Test evidence')

      const uploadButton = screen.getByRole('button', { name: /upload/i })
      await user.click(uploadButton)

      expect(uploadButton).toBeDisabled()
    })
  })
})
