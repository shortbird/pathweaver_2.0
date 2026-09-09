import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { toast, oeaAPI } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  oeaAPI: {
    credits: vi.fn(), addCredit: vi.fn(), creditPeriods: vi.fn(),
    unlinkedCourseQuests: vi.fn(), removeCourseQuest: vi.fn(),
  },
}))
vi.mock('react-hot-toast', () => ({ toast }))
vi.mock('../../../services/api', () => ({ oeaAPI }))

import OEACreditsView from '../OEACreditsView'

const DATA = {
  success: true,
  enrollment: { pathway_key: 'open_balanced', pathway: { name: 'Open and Balanced' } },
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
  oeaAPI.unlinkedCourseQuests.mockResolvedValue({ data: { quests: [] } })
})

describe('OEACreditsView', () => {
  it('renders the pathway name, progress, links, and requirement breakdown', async () => {
    renderView()
    expect(await screen.findByText('0 of 24 credits')).toBeInTheDocument()
    expect(screen.getByText('Open and Balanced diploma plan')).toBeInTheDocument()
    expect(screen.getByText('Math')).toBeInTheDocument()
    expect(screen.getByText('Quarterly report')).toBeInTheDocument()
    expect(screen.getByText('Transcript')).toBeInTheDocument()
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

  // A course whose credit was deleted before the delete removed its quest is
  // the reason this card exists: it stayed on the student's dashboard with
  // nothing in the product able to take it off. See TestCourseQuestCleanup.
  it('offers to remove a course left on the dashboard but not on the transcript', async () => {
    oeaAPI.unlinkedCourseQuests.mockResolvedValue({
      data: { quests: [{ quest_id: 'q9', title: 'Mythology and Folklore', has_work: false }] },
    })
    oeaAPI.removeCourseQuest.mockResolvedValue({ data: { outcome: 'deleted' } })
    renderView()

    expect(await screen.findByText('Mythology and Folklore')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Remove'))

    await waitFor(() => expect(oeaAPI.removeCourseQuest).toHaveBeenCalledWith('s1', 'q9'))
  })

  it('says the work is kept when the student already worked in the leftover course', async () => {
    oeaAPI.unlinkedCourseQuests.mockResolvedValue({
      data: { quests: [{ quest_id: 'q9', title: 'Zoology', has_work: true }] },
    })
    renderView()
    expect(await screen.findByText('Has work logged — it stays in the portfolio')).toBeInTheDocument()
  })

  it('shows no leftovers card for a student with none', async () => {
    renderView()
    await screen.findByText('Math')
    expect(screen.queryByText(/Still on Alex/)).not.toBeInTheDocument()
  })
})
