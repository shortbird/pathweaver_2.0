import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { toast, oeaAPI } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  oeaAPI: { credits: vi.fn(), addCredit: vi.fn(), creditPeriods: vi.fn() },
}))
vi.mock('react-hot-toast', () => ({ toast }))
vi.mock('../../../services/api', () => ({ oeaAPI }))

import OEACreditsView from '../OEACreditsView'

const DATA = {
  success: true,
  enrollment: { pathway_key: 'open_balanced' },
  credits: [],
  progress: {
    pathway_key: 'open_balanced', total_required: 24, total_earned: 0, total_in_progress: 0,
    foundation_required: 12, foundation_earned: 0, elective_required: 12, elective_earned: 0,
    percent_complete: 0, is_complete: false,
    requirements: [
      { key: 'math', label: 'Math', category: 'foundation', required: 3, earned: 0, in_progress: 0, is_met: false },
    ],
  },
  gpa: { unweighted: null, weighted: null, graded_credits: 0 },
  credit_summary: { transfer_used: 0, transfer_cap: 6, nondirect_used: 0, nondirect_cap: 18, direct_complete: 0 },
  diploma_eligibility: { meets_min_direct: false, direct_credits_earned: 0, min_direct_required: 6 },
}

function renderView() {
  return render(
    <MemoryRouter>
      <OEACreditsView studentId="s1" studentName="Alex" />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  oeaAPI.credits.mockResolvedValue({ data: DATA })
})

describe('OEACreditsView', () => {
  it('renders progress, cap usage, and the requirement breakdown', async () => {
    renderView()
    expect(await screen.findByText('0 of 24 credits')).toBeInTheDocument()
    expect(screen.getByText('Math')).toBeInTheDocument()
    expect(screen.getByText(/Transfer credit: 0 \/ 6/)).toBeInTheDocument()
    expect(screen.getByText(/Direct credits earned: 0/)).toBeInTheDocument()
  })

  it('adds a transfer credit with a grade and credit_source', async () => {
    oeaAPI.addCredit.mockResolvedValue({ data: { credit: {} } })
    renderView()
    await screen.findByText('Math')

    fireEvent.click(screen.getByText('Add course'))
    fireEvent.change(screen.getByLabelText('Course type'), { target: { value: 'transfer' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. Algebra I'), { target: { value: 'World History' } })
    fireEvent.click(screen.getByText('B'))   // grade
    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => expect(oeaAPI.addCredit).toHaveBeenCalled())
    const [sid, body] = oeaAPI.addCredit.mock.calls[0]
    expect(sid).toBe('s1')
    expect(body.credit_source).toBe('transfer')
    expect(body.letter_grade).toBe('B')
    expect(body.course_name).toBe('World History')
  })

  it('blocks adding a transfer credit with no grade', async () => {
    renderView()
    await screen.findByText('Math')
    fireEvent.click(screen.getByText('Add course'))
    fireEvent.change(screen.getByLabelText('Course type'), { target: { value: 'transfer' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. Algebra I'), { target: { value: 'World History' } })
    fireEvent.click(screen.getByText('Add'))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Choose a grade for this transfer course.'))
    expect(oeaAPI.addCredit).not.toHaveBeenCalled()
  })
})
