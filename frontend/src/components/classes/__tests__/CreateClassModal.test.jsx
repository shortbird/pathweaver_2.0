import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CreateClassModal from '../CreateClassModal'

describe('CreateClassModal', () => {
  let onSubmit
  let onClose

  beforeEach(() => {
    onSubmit = vi.fn().mockResolvedValue(undefined)
    onClose = vi.fn()
  })

  const renderModal = () => render(<CreateClassModal onClose={onClose} onSubmit={onSubmit} />)

  it('renders the scheduling/catalog fields', () => {
    renderModal()
    expect(screen.getByLabelText(/class name/i)).toBeInTheDocument()
    expect(screen.getByText(/days offered/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mon' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fri' })).toBeInTheDocument()
    expect(screen.getByLabelText(/duration/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/max students/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/supply fee/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/minimum age/i)).toBeInTheDocument()
  })

  it('disables submit until a name is entered', () => {
    renderModal()
    const submit = screen.getByRole('button', { name: /create class/i })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/class name/i), { target: { value: 'Robotics' } })
    expect(submit).toBeEnabled()
  })

  it('submits the assembled payload (and null image when none chosen)', async () => {
    renderModal()

    fireEvent.change(screen.getByLabelText(/class name/i), { target: { value: 'Robotics' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mon' }))
    fireEvent.click(screen.getByRole('button', { name: 'Wed' }))
    fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: '60' } })
    fireEvent.change(screen.getByLabelText(/max students/i), { target: { value: '12' } })

    const submitBtn = screen.getByRole('button', { name: /create class/i })
    expect(submitBtn).toBeEnabled()
    // Dispatch the form's submit directly: clicking a submit button after
    // intervening re-renders is unreliable in jsdom (real browsers are fine).
    fireEvent.submit(submitBtn.closest('form'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Robotics',
        days_of_week: ['mon', 'wed'],
        duration_minutes: 60,
        max_students: 12,
      }),
      null
    )
  })

  it('blocks submit when min age exceeds max age', () => {
    renderModal()

    fireEvent.change(screen.getByLabelText(/class name/i), { target: { value: 'Art' } })
    fireEvent.change(screen.getByLabelText(/minimum age/i), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText(/maximum age/i), { target: { value: '8' } })

    fireEvent.click(screen.getByRole('button', { name: /create class/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/minimum age cannot be greater/i)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
