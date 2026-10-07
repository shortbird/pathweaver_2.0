import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import VolunteerHoursRow from './familyDetail/VolunteerHoursRow'

/**
 * Staff keep a short note under the family's volunteer hours.
 *
 * iCreate b98a167f: "Can a note section be added just below that for the
 * building manager cc can add a little message with dates". Same visibility
 * as the hours (01082b30): only this family's guardians read it.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(() => Promise.resolve({ data: {} })), patch: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

beforeEach(() => {
  vi.clearAllMocks()
  api.patch.mockResolvedValue({ data: { success: true } })
})

const household = (extra = {}) => ({ id: 'hh-1', name: 'Smith Family', volunteer_hours: 4, ...extra })

describe('volunteer hours note on the family record (iCreate b98a167f)', () => {
  it('renders the saved note just below the hours', () => {
    render(<VolunteerHoursRow household={household({ volunteer_hours_note: 'Sep 12 book fair' })} orgId="org-1" />)
    const note = screen.getByLabelText('Volunteer hours note', { selector: 'textarea' })
    expect(note).toHaveValue('Sep 12 book fair')
    const hours = screen.getByLabelText('Volunteer hours', { selector: 'input' })
    // The note comes after the hours input in the page.
    expect(hours.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled()
  })

  it('sends only the note, so the hours are not re-stamped', async () => {
    const onSaved = vi.fn()
    render(<VolunteerHoursRow household={household()} orgId="org-1" onSaved={onSaved} />)
    fireEvent.change(screen.getByLabelText('Volunteer hours note', { selector: 'textarea' }),
      { target: { value: 'Aug 12 setup\nSep 4 book fair ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(api.patch).toHaveBeenCalledWith('/api/sis/households/hh-1',
      { volunteer_hours_note: 'Aug 12 setup\nSep 4 book fair', organization_id: 'org-1' })
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('sends null when staff clear the note', async () => {
    render(<VolunteerHoursRow household={household({ volunteer_hours_note: 'old' })} orgId="org-1" />)
    fireEvent.change(screen.getByLabelText('Volunteer hours note', { selector: 'textarea' }), { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/sis/households/hh-1',
      { volunteer_hours_note: null, organization_id: 'org-1' }))
  })
})
