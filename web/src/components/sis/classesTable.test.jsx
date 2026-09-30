/**
 * Ticket 4b38bb72 (iCreate, 2026-09-30): "I'm creating a teacher assignment ...
 * 'Lunch Monitor'. The trouble I'm running into is that it isn't during one of
 * the blocks."
 *
 * The inline row editor takes a custom time too. While it refuses an end before
 * the start, the row's Save must hold: the refused time is not in the draft, so
 * a save would store the last valid time instead of the one on screen.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import ClassesTable from './ClassesTable'

const BLOCKS = [
  { start: '09:00', end: '10:00' },
  { start: '11:30', end: '12:00', label: 'Lunch' },
  { start: '12:00', end: '13:00' },
]
const LUNCH_MONITOR = {
  id: 'c1', name: 'Lunch Monitor', registration_status: 'open', enrolled_count: 0,
  meetings: [{ day_of_week: 1, start_time: '11:30:00', end_time: '12:00:00' }],
}

const mount = () => {
  const onSave = vi.fn().mockResolvedValue(true)
  render(
    <MemoryRouter>
      <ClassesTable classes={[LUNCH_MONITOR]} staff={[]} timeBlocks={BLOCKS}
        onSave={onSave} onToggleRegistration={vi.fn()} onOpen={vi.fn()} />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByText('Lunch Monitor'))
  // Something other than the time, so the row is dirty and Save is live.
  fireEvent.change(screen.getByLabelText('Class name'), { target: { value: 'Lunch Monitor (Mon)' } })
  return onSave
}

describe('ClassesTable holds a row Save while its custom time is refused', () => {
  it('disables Save and sends nothing while the end is before the start', () => {
    const onSave = mount()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '11:00' } })
    expect(screen.getByText('End time must be after the start time')).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves the custom time once it is valid again', async () => {
    const onSave = mount()
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '11:00' } })
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '12:15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][1]).toMatchObject({
      name: 'Lunch Monitor (Mon)', days_of_week: [1], start_time: '11:30', duration_minutes: 45,
    })
  })
})
