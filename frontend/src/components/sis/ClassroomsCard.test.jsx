import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { put: vi.fn(() => Promise.resolve({ data: { success: true } })) },
}))
vi.mock('../../services/api', () => ({ default: api }))

import ClassroomsCard from './ClassroomsCard'
import ClassFieldsEditor from './ClassFieldsEditor'

beforeEach(() => vi.clearAllMocks())

describe('ClassroomsCard', () => {
  it('renders existing rooms and allows adding/saving new rooms', async () => {
    const org = {
      feature_flags: {
        sis_settings: {
          rooms: [
            { name: 'Room 101', description: 'Science Lab' },
            { name: 'Art Studio', description: 'Craft room' },
          ],
        },
      },
    }
    const onUpdate = vi.fn()

    render(<ClassroomsCard orgId="org-1" org={org} onUpdate={onUpdate} />)

    expect(screen.getByDisplayValue('Room 101')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Science Lab')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Art Studio')).toBeInTheDocument()

    fireEvent.click(screen.getByText('+ Add room'))

    const nameInputs = screen.getAllByLabelText('Room name')
    const descInputs = screen.getAllByLabelText('Room description')

    fireEvent.change(nameInputs[2], { target: { value: 'Main Gym' } })
    fireEvent.change(descInputs[2], { target: { value: 'Large sports hall' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save rooms' }))

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        '/api/admin/organizations/org-1',
        expect.objectContaining({
          feature_flags: expect.objectContaining({
            sis_settings: expect.objectContaining({
              rooms: [
                { name: 'Room 101', description: 'Science Lab' },
                { name: 'Art Studio', description: 'Craft room' },
                { name: 'Main Gym', description: 'Large sports hall' },
              ],
            }),
          }),
        })
      )
    )
    expect(onUpdate).toHaveBeenCalled()
  })
})

describe('ClassFieldsEditor with rooms', () => {
  it('renders dropdown with rooms when rooms are provided', () => {
    const draft = { name: 'Physics 101', location: 'Room 101', days_of_week: [], assistant_instructor_ids: [] }
    const rooms = [
      { name: 'Room 101', description: 'Science Lab' },
      { name: 'Room 102', description: 'Math Room' },
    ]
    const onChange = vi.fn()

    render(<ClassFieldsEditor draft={draft} onChange={onChange} rooms={rooms} />)

    const select = screen.getByLabelText('Classroom')
    expect(select).toBeInTheDocument()
    expect(select.value).toBe('Room 101')
    expect(screen.getByText('Science Lab')).toBeInTheDocument()

    fireEvent.change(select, { target: { value: 'Room 102' } })
    expect(onChange).toHaveBeenCalledWith({ location: 'Room 102' })
  })

  it('renders plain input when no rooms exist', () => {
    const draft = { name: 'Physics 101', location: 'Room A', days_of_week: [], assistant_instructor_ids: [] }
    const onChange = vi.fn()

    render(<ClassFieldsEditor draft={draft} onChange={onChange} rooms={[]} />)

    const input = screen.getByLabelText('Classroom')
    expect(input.tagName).toBe('INPUT')
    expect(input.value).toBe('Room A')
  })
})
