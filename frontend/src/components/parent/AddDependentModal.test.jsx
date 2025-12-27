import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddDependentModal from './AddDependentModal'

// Mock the dependentAPI
vi.mock('../../services/dependentAPI', () => ({
  createDependent: vi.fn()
}))

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn()
  }
}))

import { createDependent } from '../../services/dependentAPI'
import toast from 'react-hot-toast'

describe('AddDependentModal', () => {
  const mockOnClose = vi.fn()
  const mockOnSuccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    createDependent.mockResolvedValue({
      success: true,
      dependent: { id: 'new-dep', display_name: 'New Child' },
      message: 'Dependent created successfully'
    })
  })

  describe('Rendering', () => {
    it('renders nothing when closed', () => {
      render(
        <AddDependentModal
          isOpen={false}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      expect(screen.queryByText(/create child profile/i)).not.toBeInTheDocument()
    })

    it('renders modal when open', () => {
      render(
        <AddDependentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      expect(screen.getByText(/create child profile/i) || screen.getByText(/add child/i)).toBeInTheDocument()
    })

    it('renders first name input', () => {
      render(
        <AddDependentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      expect(screen.getByLabelText(/first name/i) || screen.getByPlaceholderText(/first name/i)).toBeInTheDocument()
    })

    it('renders last name input', () => {
      render(
        <AddDependentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      expect(screen.getByLabelText(/last name/i) || screen.getByPlaceholderText(/last name/i)).toBeInTheDocument()
    })

    it('renders date of birth input', () => {
      render(
        <AddDependentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      expect(screen.getByLabelText(/date of birth/i) || screen.getByLabelText(/birthday/i)).toBeInTheDocument()
    })

    it('renders COPPA compliance notice', () => {
      render(
        <AddDependentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      expect(screen.getByText(/under 13/i) || screen.getByText(/COPPA/i) || screen.getByText(/parental/i)).toBeInTheDocument()
    })
  })

  describe('Form Validation', () => {
    it('shows error when first name is empty', async () => {
      const user = userEvent.setup()
      render(
        <AddDependentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      // Fill only last name and DOB
      const lastNameInput = screen.getByLabelText(/last name/i) || screen.getByPlaceholderText(/last name/i)
      await user.type(lastNameInput, 'Smith')

      const dobInput = screen.getByLabelText(/date of birth/i) || screen.getByLabelText(/birthday/i)
      await user.type(dobInput, '2015-06-15')

      // Submit
      const submitButton = screen.getByRole('button', { name: /create|add|save/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled()
      })
    })

    it('shows error when date of birth is empty', async () => {
      const user = userEvent.setup()
      render(
        <AddDependentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      const firstNameInput = screen.getByLabelText(/first name/i) || screen.getByPlaceholderText(/first name/i)
      await user.type(firstNameInput, 'John')

      const lastNameInput = screen.getByLabelText(/last name/i) || screen.getByPlaceholderText(/last name/i)
      await user.type(lastNameInput, 'Smith')

      // Submit without DOB
      const submitButton = screen.getByRole('button', { name: /create|add|save/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled()
      })
    })

    it('shows warning for child 13 or older', async () => {
      const user = userEvent.setup()
      render(
        <AddDependentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      const firstNameInput = screen.getByLabelText(/first name/i) || screen.getByPlaceholderText(/first name/i)
      await user.type(firstNameInput, 'Teen')

      const lastNameInput = screen.getByLabelText(/last name/i) || screen.getByPlaceholderText(/last name/i)
      await user.type(lastNameInput, 'Smith')

      // Set DOB to 14 years ago
      const today = new Date()
      const dob = new Date(today.getFullYear() - 14, today.getMonth(), today.getDate())
      const dobString = dob.toISOString().split('T')[0]

      const dobInput = screen.getByLabelText(/date of birth/i) || screen.getByLabelText(/birthday/i)
      await user.clear(dobInput)
      await user.type(dobInput, dobString)

      await waitFor(() => {
        expect(screen.getByText(/13\+|teenager|existing student|connect/i)).toBeInTheDocument()
      })
    })

    it('shows warning for child under 5', async () => {
      const user = userEvent.setup()
      render(
        <AddDependentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      const firstNameInput = screen.getByLabelText(/first name/i) || screen.getByPlaceholderText(/first name/i)
      await user.type(firstNameInput, 'Toddler')

      const lastNameInput = screen.getByLabelText(/last name/i) || screen.getByPlaceholderText(/last name/i)
      await user.type(lastNameInput, 'Smith')

      // Set DOB to 3 years ago
      const today = new Date()
      const dob = new Date(today.getFullYear() - 3, today.getMonth(), today.getDate())
      const dobString = dob.toISOString().split('T')[0]

      const dobInput = screen.getByLabelText(/date of birth/i) || screen.getByLabelText(/birthday/i)
      await user.clear(dobInput)
      await user.type(dobInput, dobString)

      await waitFor(() => {
        expect(screen.getByText(/5-12|designed for|age range|young/i)).toBeInTheDocument()
      })
    })
  })

  describe('Form Submission', () => {
    it('calls createDependent with correct data on submit', async () => {
      const user = userEvent.setup()
      render(
        <AddDependentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      const firstNameInput = screen.getByLabelText(/first name/i) || screen.getByPlaceholderText(/first name/i)
      await user.type(firstNameInput, 'John')

      const lastNameInput = screen.getByLabelText(/last name/i) || screen.getByPlaceholderText(/last name/i)
      await user.type(lastNameInput, 'Smith')

      const dobInput = screen.getByLabelText(/date of birth/i) || screen.getByLabelText(/birthday/i)
      await user.type(dobInput, '2015-06-15')

      const submitButton = screen.getByRole('button', { name: /create|add|save/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(createDependent).toHaveBeenCalledWith(
          expect.stringContaining('John'),
          '2015-06-15'
        )
      })
    })

    it('calls onSuccess callback after successful creation', async () => {
      const user = userEvent.setup()
      render(
        <AddDependentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      const firstNameInput = screen.getByLabelText(/first name/i) || screen.getByPlaceholderText(/first name/i)
      await user.type(firstNameInput, 'John')

      const lastNameInput = screen.getByLabelText(/last name/i) || screen.getByPlaceholderText(/last name/i)
      await user.type(lastNameInput, 'Smith')

      const dobInput = screen.getByLabelText(/date of birth/i) || screen.getByLabelText(/birthday/i)
      await user.type(dobInput, '2015-06-15')

      const submitButton = screen.getByRole('button', { name: /create|add|save/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled()
      })
    })

    it('shows error toast on API failure', async () => {
      createDependent.mockRejectedValue(new Error('API Error'))

      const user = userEvent.setup()
      render(
        <AddDependentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      const firstNameInput = screen.getByLabelText(/first name/i) || screen.getByPlaceholderText(/first name/i)
      await user.type(firstNameInput, 'John')

      const lastNameInput = screen.getByLabelText(/last name/i) || screen.getByPlaceholderText(/last name/i)
      await user.type(lastNameInput, 'Smith')

      const dobInput = screen.getByLabelText(/date of birth/i) || screen.getByLabelText(/birthday/i)
      await user.type(dobInput, '2015-06-15')

      const submitButton = screen.getByRole('button', { name: /create|add|save/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled()
      })
    })
  })

  describe('Modal Controls', () => {
    it('calls onClose when clicking cancel button', async () => {
      const user = userEvent.setup()
      render(
        <AddDependentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      const cancelButton = screen.getByRole('button', { name: /cancel|close/i })
      await user.click(cancelButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('calls onClose when clicking X button', async () => {
      const user = userEvent.setup()
      render(
        <AddDependentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      // Find X button (usually has aria-label or specific class)
      const closeButtons = screen.getAllByRole('button')
      const xButton = closeButtons.find(btn =>
        btn.querySelector('svg') || btn.textContent === '' || btn.textContent === 'X'
      )

      if (xButton) {
        await user.click(xButton)
        expect(mockOnClose).toHaveBeenCalled()
      }
    })

    it('resets form when modal is closed and reopened', async () => {
      const user = userEvent.setup()
      const { rerender } = render(
        <AddDependentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      // Fill form
      const firstNameInput = screen.getByLabelText(/first name/i) || screen.getByPlaceholderText(/first name/i)
      await user.type(firstNameInput, 'John')

      // Close modal
      rerender(
        <AddDependentModal
          isOpen={false}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      // Reopen modal
      rerender(
        <AddDependentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      // Check form is reset
      const newFirstNameInput = screen.getByLabelText(/first name/i) || screen.getByPlaceholderText(/first name/i)
      expect(newFirstNameInput.value).toBe('')
    })
  })
})
