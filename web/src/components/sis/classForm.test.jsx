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
