/**
 * Ticket 4b38bb72 (iCreate, 2026-09-30): "I'm creating a teacher assignment ...
 * 'Lunch Monitor'. The trouble I'm running into is that it isn't during one of
 * the blocks."
 *
 * The class editor now takes a custom time and refuses an end before the start.
 * The refused time never reaches the draft, so the form must hold its Save while
 * the editor shows the error — otherwise it would quietly store the last valid
 * time instead of the one on screen.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import ClassForm from './ClassForm'

const BLOCKS = [
  { start: '09:00', end: '10:00' },
  { start: '11:30', end: '12:00', label: 'Lunch' },
  { start: '12:00', end: '13:00' },
]
const LUNCH_MONITOR = {
  id: 'c1', name: 'Lunch Monitor', registration_status: 'open',
  meetings: [{ day_of_week: 1, start_time: '11:30:00', end_time: '12:00:00' }],
}

const mount = () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const { container } = render(
    <ClassForm initial={LUNCH_MONITOR} onSubmit={onSubmit} timeBlocks={BLOCKS} />,
  )
  return { onSubmit, form: container.querySelector('form') }
}

describe('ClassForm holds Save while the custom time is refused', () => {
  it('disables Save and sends nothing while the end is before the start', () => {
    const { onSubmit, form } = mount()
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '11:00' } })
    expect(screen.getByText('End time must be after the start time')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    // Enter in a field submits the form without the button; that is refused too.
    fireEvent.submit(form)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('saves the custom time once it is valid again', async () => {
    const { onSubmit } = mount()
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '11:00' } })
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '12:15' } })
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeEnabled()
    fireEvent.click(save)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      days_of_week: [1], start_time: '11:30', duration_minutes: 45,
    })
  })

  it('frees Save when the class goes back to a block', () => {
    mount()
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '11:00' } })
    fireEvent.change(screen.getByLabelText('Start block'), { target: { value: '12:00' } })
    expect(screen.queryByText('End time must be after the start time')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })
})

describe('ClassForm on create folds the secondary fields away', () => {
  const STAFF = [{ id: 's1', name: 'Jane Doe' }, { id: 's2', name: 'Alex Assistant' }]

  it('shows the essentials and hides the rest under Additional options', () => {
    render(<ClassForm onSubmit={vi.fn()} staff={STAFF} onImageChange={vi.fn()} />)
    for (const label of ['Class name', 'Class description', 'Start time', 'Duration (minutes)']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('Teacher (optional)')).toBeInTheDocument()
    expect(screen.getByText('Start time')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Duration')).toBeInTheDocument()
    expect(screen.queryByText('Open for registration')).not.toBeInTheDocument()
    for (const label of ['Classroom', 'Capacity', 'Tuition', 'Internal notes', 'XP to complete the class']) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
    }
    expect(screen.queryByText('Assistant teacher(s)')).not.toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: /Additional options/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    for (const label of ['Classroom', 'Capacity', 'Tuition', 'Internal notes', 'XP to complete the class']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('Assistant teacher(s)')).toBeInTheDocument()
    expect(screen.getByText('Open for registration')).toBeInTheDocument()
  })

  it('sends the registration choice from inside the section, open by default', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ClassForm onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Class name'), { target: { value: 'Drawing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Class' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].registration_status).toBe('open')

    fireEvent.click(screen.getByRole('button', { name: /Additional options/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Open for registration/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Class' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
    expect(onSubmit.mock.calls[1][0].registration_status).toBe('closed')
  })

  it('keeps a value entered in the section after it is folded again', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ClassForm onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Class name'), { target: { value: 'Drawing' } })
    const toggle = screen.getByRole('button', { name: /Additional options/ })
    fireEvent.click(toggle)
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '14' } })
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Create Class' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Drawing', capacity: 14 })
  })

  it('editing an existing class still shows every field', () => {
    render(<ClassForm initial={LUNCH_MONITOR} onSubmit={vi.fn()} />)
    expect(screen.getByLabelText('Classroom')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Additional options/ })).not.toBeInTheDocument()
  })
})
