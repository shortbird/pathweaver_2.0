import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import OEACreditsView from './OEACreditsView'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('../../components/ui/ModalOverlay', () => ({
  default: ({ children }) => <div>{children}</div>
}))

const credits = vi.fn()
const addCredit = vi.fn().mockResolvedValue({})
const updateCredit = vi.fn().mockResolvedValue({})
vi.mock('../../services/api', () => ({
  oeaAPI: {
    credits: (...a) => credits(...a),
    addCredit: (...a) => addCredit(...a),
    updateCredit: (...a) => updateCredit(...a),
    deleteCredit: vi.fn().mockResolvedValue({}),
    ensureCreditQuest: vi.fn().mockResolvedValue({ data: { quest_id: 'q1' } })
  }
}))

const withProgress = {
  data: {
    enrollment: { id: 'e1', pathway: { name: 'Traditionally Aligned' } },
    credits: [
      { id: 'c1', requirement_key: 'math', category: 'foundation', course_name: 'Algebra I', credits: 1, status: 'complete', letter_grade: 'A', is_weighted: false, quest_id: 'q1' }
    ],
    gpa: { unweighted: 4.0, weighted: 4.0, graded_credits: 1 },
    progress: {
      total_earned: 1, total_required: 24, percent_complete: 4,
      foundation_earned: 1, foundation_required: 13, elective_earned: 0, elective_required: 11,
      is_complete: false,
      requirements: [
        { key: 'math', label: 'Mathematics', category: 'foundation', required: 3, earned: 1, is_met: false }
      ]
    }
  }
}

describe('OEACreditsView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders progress, GPA and per-requirement courses', async () => {
    credits.mockResolvedValue(withProgress)
    render(<OEACreditsView studentId="stu-1" readOnly />)
    await waitFor(() => expect(screen.getByText('1 of 24 credits')).toBeInTheDocument())
    expect(screen.getByText('Mathematics')).toBeInTheDocument()
    expect(screen.getByText('Algebra I')).toBeInTheDocument()
    // read-only: no add-course control
    expect(screen.queryByText('Add course')).not.toBeInTheDocument()
  })

  it('shows the add-course control when editable', async () => {
    credits.mockResolvedValue(withProgress)
    render(<OEACreditsView studentId="stu-1" />)
    await waitFor(() => expect(screen.getByText('1 of 24 credits')).toBeInTheDocument())
    expect(screen.getAllByText('Add course').length).toBeGreaterThan(0)
  })

  it('shows a no-pathway message when there is no progress', async () => {
    credits.mockResolvedValue({ data: { enrollment: null, credits: [], progress: null, gpa: { unweighted: null, weighted: null } } })
    render(<OEACreditsView studentId="stu-1" readOnly />)
    await waitFor(() => expect(screen.getByText(/No diploma pathway has been chosen/i)).toBeInTheDocument())
  })

  it('adds a course through the add-course modal', async () => {
    credits.mockResolvedValue(withProgress)
    render(<OEACreditsView studentId="stu-1" />)
    await waitFor(() => expect(screen.getByText('1 of 24 credits')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('Add course')[0])
    const name = await screen.findByPlaceholderText(/Algebra I/i)
    fireEvent.change(name, { target: { value: 'Geometry' } })
    fireEvent.click(screen.getByText('Add'))
    await waitFor(() => expect(addCredit).toHaveBeenCalledWith('stu-1', expect.objectContaining({ course_name: 'Geometry', requirement_key: 'math' })))
  })

  it('opens the edit/grade modal for an existing course', async () => {
    credits.mockResolvedValue(withProgress)
    render(<OEACreditsView studentId="stu-1" />)
    await waitFor(() => expect(screen.getByText('Algebra I')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Algebra I'))
    expect(await screen.findByText('Edit course')).toBeInTheDocument()
  })
})
