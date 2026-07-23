import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { put: vi.fn(() => Promise.resolve({ data: {} })) },
}))
vi.mock('../../services/api', () => ({ default: api }))

import EnrollmentAgeGatesCard from './EnrollmentAgeGatesCard'

const orgWith = (gates = []) => ({
  id: 'org-1', feature_flags: { sis_settings: { enrollment_age_gates: gates } },
})

beforeEach(() => vi.clearAllMocks())

describe('EnrollmentAgeGatesCard', () => {
  it('adds a waitlisted age band into sis_settings', async () => {
    const onUpdate = vi.fn()
    render(<EnrollmentAgeGatesCard orgId="org-1" org={orgWith()} onUpdate={onUpdate} />)
    expect(screen.getByText('Enrollment age groups')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Minimum age'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Maximum age'), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Waitlist this age group' }))
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/api/admin/organizations/org-1', expect.objectContaining({
        feature_flags: expect.objectContaining({
          sis_settings: expect.objectContaining({
            enrollment_age_gates: [{ min_age: 5, max_age: 9, mode: 'waitlist' }],
          }),
        }),
      })),
    )
    expect(await screen.findByText(/Ages 5–9/)).toBeInTheDocument()
    expect(onUpdate).toHaveBeenCalled()
  })

  it('reopens a band by removing it from the gates', async () => {
    render(<EnrollmentAgeGatesCard orgId="org-1" org={orgWith([{ min_age: 5, max_age: 9, mode: 'waitlist' }])} onUpdate={vi.fn()} />)
    expect(await screen.findByText(/Ages 5–9/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open this group' }))
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/api/admin/organizations/org-1', expect.objectContaining({
        feature_flags: expect.objectContaining({
          sis_settings: expect.objectContaining({ enrollment_age_gates: [] }),
        }),
      })),
    )
  })
})
