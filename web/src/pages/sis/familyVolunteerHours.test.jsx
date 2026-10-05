import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { toast } from 'react-hot-toast'
import VolunteerHoursRow from './familyDetail/VolunteerHoursRow'

/**
 * Staff keep a family's volunteer hours on the family record (Family details).
 *
 * iCreate 01082b30: "Could we make a way for parents to be able to see how
 * many volunteer hours they have completed? We can keep it updated, but ...
 * keep it private so not everyone sees everyone elses."
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

const household = (extra = {}) => ({ id: 'hh-1', name: 'Smith Family', ...extra })

describe('volunteer hours on the family record (iCreate 01082b30)', () => {
  it('shows the saved number and saves a new one for this family', async () => {
    const onSaved = vi.fn()
    render(<VolunteerHoursRow household={household({ volunteer_hours: 4 })} orgId="org-1" onSaved={onSaved} />)
    const input = screen.getByLabelText('Volunteer hours', { selector: 'input' })
    expect(input).toHaveValue(4)
    fireEvent.change(input, { target: { value: '6.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save hours' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(api.patch).toHaveBeenCalledWith('/api/sis/households/hh-1',
      { volunteer_hours: 6.5, organization_id: 'org-1' })
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('reads a family with no hours yet (null) as 0, with Save off until it changes', () => {
    render(<VolunteerHoursRow household={household({ volunteer_hours: null })} orgId="org-1" />)
    expect(screen.getByLabelText('Volunteer hours', { selector: 'input' })).toHaveValue(0)
    expect(screen.getByRole('button', { name: 'Save hours' })).toBeDisabled()
  })

  it('does not send a negative number', async () => {
    render(<VolunteerHoursRow household={household({ volunteer_hours: 2 })} orgId="org-1" />)
    fireEvent.change(screen.getByLabelText('Volunteer hours', { selector: 'input' }), { target: { value: '-3' } })
    expect(screen.getByRole('button', { name: 'Save hours' })).toBeDisabled()
    expect(api.patch).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('tells staff the number is private to the family', () => {
    render(<VolunteerHoursRow household={household()} orgId="org-1" />)
    expect(screen.getByText(/Other families never see it/)).toBeInTheDocument()
  })
})
