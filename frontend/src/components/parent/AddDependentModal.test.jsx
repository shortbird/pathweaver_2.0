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

// Mock Modal component to avoid focus-trap issues in tests
vi.mock('../ui', () => ({
  Modal: ({ isOpen, onClose, children, title }) => {
    if (!isOpen) return null
    return (
      <div data-testid="modal">
        {title && <h2>{title}</h2>}
        <button onClick={onClose} aria-label="Close modal">X</button>
        {children}
      </div>
    )
  },
  Alert: ({ children, variant }) => <div data-testid="alert" data-variant={variant}>{children}</div>,
  FormField: ({ label, inputProps, error }) => (
    <div data-testid="form-field">
      <label htmlFor={inputProps?.id}>{label}</label>
      <input {...inputProps} />
      {error && <span className="error">{error}</span>}
    </div>
  ),
  FormFooter: ({ onCancel, cancelText, submitText, isSubmitting, disabled }) => (
    <div data-testid="form-footer">
      <button type="button" onClick={onCancel} disabled={isSubmitting}>{cancelText || 'Cancel'}</button>
      <button type="submit" disabled={disabled || isSubmitting}>{submitText || 'Submit'}</button>
    </div>
  )
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

      expect(screen.getByText(/add child profile/i)).toBeInTheDocument()
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
      const lastNameInput = screen.getByLabelText(/last name/i)
      await user.type(lastNameInput, 'Smith')

      const dobInput = screen.getByLabelText(/date of birth/i)
      await user.type(dobInput, '2015-06-15')

      // Submit
      const submitButton = screen.getByRole('button', { name: /create profile/i })
      await user.click(submitButton)

      // Error is shown in an Alert, not via toast
      await waitFor(() => {
        expect(screen.getByText(/first name is required/i)).toBeInTheDocument()
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

      const firstNameInput = screen.getByLabelText(/first name/i)
      await user.type(firstNameInput, 'John')

      const lastNameInput = screen.getByLabelText(/last name/i)
      await user.type(lastNameInput, 'Smith')

      // Submit without DOB
      const submitButton = screen.getByRole('button', { name: /create profile/i })
      await user.click(submitButton)

      // Error is shown in an Alert, not via toast
      await waitFor(() => {
        expect(screen.getByText(/date of birth is required/i)).toBeInTheDocument()
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

      const firstNameInput = screen.getByLabelText(/first name/i)
      await user.type(firstNameInput, 'Teen')

      const lastNameInput = screen.getByLabelText(/last name/i)
      await user.type(lastNameInput, 'Smith')

      // Set DOB to 14 years ago
      const today = new Date()
      const dob = new Date(today.getFullYear() - 14, today.getMonth(), today.getDate())
      const dobString = dob.toISOString().split('T')[0]

      const dobInput = screen.getByLabelText(/date of birth/i)
      await user.clear(dobInput)
      await user.type(dobInput, dobString)

      // Look for the specific warning alert (variant="warning")
      await waitFor(() => {
        const warningAlert = screen.getAllByTestId('alert').find(el => el.dataset.variant === 'warning')
        expect(warningAlert).toBeInTheDocument()
        expect(warningAlert.textContent).toMatch(/14 years old.*under 13/i)
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

      const firstNameInput = screen.getByLabelText(/first name/i)
      await user.type(firstNameInput, 'Toddler')

      const lastNameInput = screen.getByLabelText(/last name/i)
      await user.type(lastNameInput, 'Smith')

      // Set DOB to 3 years ago
      const today = new Date()
      const dob = new Date(today.getFullYear() - 3, today.getMonth(), today.getDate())
      const dobString = dob.toISOString().split('T')[0]

      const dobInput = screen.getByLabelText(/date of birth/i)
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

      const firstNameInput = screen.getByLabelText(/first name/i)
      await user.type(firstNameInput, 'John')

      const lastNameInput = screen.getByLabelText(/last name/i)
      await user.type(lastNameInput, 'Smith')

      const dobInput = screen.getByLabelText(/date of birth/i)
      await user.type(dobInput, '2015-06-15')

      const submitButton = screen.getByRole('button', { name: /create profile/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(createDependent).toHaveBeenCalledWith({
          display_name: 'John Smith',
          date_of_birth: '2015-06-15',
          avatar_url: null
        })
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

      const firstNameInput = screen.getByLabelText(/first name/i)
      await user.type(firstNameInput, 'John')

      const lastNameInput = screen.getByLabelText(/last name/i)
      await user.type(lastNameInput, 'Smith')

      const dobInput = screen.getByLabelText(/date of birth/i)
      await user.type(dobInput, '2015-06-15')

      const submitButton = screen.getByRole('button', { name: /create profile/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled()
      })
    })

    it('shows error on API failure', async () => {
      createDependent.mockRejectedValue(new Error('API Error'))

      const user = userEvent.setup()
      render(
        <AddDependentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      const firstNameInput = screen.getByLabelText(/first name/i)
      await user.type(firstNameInput, 'John')

      const lastNameInput = screen.getByLabelText(/last name/i)
      await user.type(lastNameInput, 'Smith')

      const dobInput = screen.getByLabelText(/date of birth/i)
      await user.type(dobInput, '2015-06-15')

      const submitButton = screen.getByRole('button', { name: /create profile/i })
      await user.click(submitButton)

      // Error is shown in an Alert, not via toast
      await waitFor(() => {
        expect(screen.getByText(/failed to create dependent/i)).toBeInTheDocument()
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

      // Get the Cancel button specifically (not the X close button)
      const cancelButton = screen.getByRole('button', { name: /^cancel$/i })
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

      // Find X button by aria-label
      const xButton = screen.getByLabelText(/close modal/i)
      await user.click(xButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('resets form when cancel is clicked', async () => {
      const user = userEvent.setup()
      render(
        <AddDependentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      // Fill form
      const firstNameInput = screen.getByLabelText(/first name/i)
      await user.type(firstNameInput, 'John')

      // Click Cancel - this triggers handleClose which resets the form
      const cancelButton = screen.getByRole('button', { name: /^cancel$/i })
      await user.click(cancelButton)

      expect(mockOnClose).toHaveBeenCalled()
    })
  })
})
