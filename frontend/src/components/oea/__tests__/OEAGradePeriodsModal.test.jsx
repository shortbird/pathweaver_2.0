import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

const { toast, oeaAPI } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  oeaAPI: { creditPeriods: vi.fn(), saveCreditPeriod: vi.fn() },
}))
vi.mock('react-hot-toast', () => ({ toast }))
vi.mock('../../../services/api', () => ({ oeaAPI }))

import OEAGradePeriodsModal from '../OEAGradePeriodsModal'

const credit = { id: 'c1', course_name: 'Algebra I' }

// Flush the mount load: creditPeriods().then(setPeriods) + the [sel, periods]
// prefill effect both settle, so a later grade click isn't clobbered by the load.
async function flushLoad() {
  await waitFor(() => expect(oeaAPI.creditPeriods).toHaveBeenCalled())
  await act(async () => {})
}

beforeEach(() => {
  vi.clearAllMocks()
  oeaAPI.creditPeriods.mockResolvedValue({ data: { periods: [] } })
})

describe('OEAGradePeriodsModal', () => {
  it('saves a quarter grade + summary', async () => {
    oeaAPI.saveCreditPeriod.mockResolvedValue({ data: { period: {} } })
    render(<OEAGradePeriodsModal credit={credit} onClose={vi.fn()} onSaved={vi.fn()} />)
    await flushLoad()

    fireEvent.click(screen.getByText('B'))
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(oeaAPI.saveCreditPeriod).toHaveBeenCalled())
    const body = oeaAPI.saveCreditPeriod.mock.calls[0][1]
    expect(body.term_type).toBe('quarter')
    expect(body.grade).toBe('B')
  })

  it('surfaces the blocked-semester message when the server returns 422', async () => {
    oeaAPI.saveCreditPeriod.mockRejectedValue({
      response: { status: 422, data: { error: 'Required quarterly uploads are missing' } },
    })
    render(<OEAGradePeriodsModal credit={credit} onClose={vi.fn()} onSaved={vi.fn()} />)
    await flushLoad()

    // switch to a semester term, pick a grade, save
    fireEvent.change(screen.getByLabelText('Term'), { target: { value: 'semester:1' } })
    fireEvent.click(screen.getByText('A'))
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Required quarterly uploads are missing'),
    )
  })
})
