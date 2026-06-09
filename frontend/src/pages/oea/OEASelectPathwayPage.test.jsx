import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import OEASelectPathwayPage from './OEASelectPathwayPage'

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ studentId: 'stu-1' }),
  useLocation: () => ({ state: { studentName: 'Sam' } })
}))
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const pathways = vi.fn()
const studentEnrollment = vi.fn()
vi.mock('../../services/api', () => ({
  oeaAPI: {
    pathways: (...a) => pathways(...a),
    studentEnrollment: (...a) => studentEnrollment(...a),
    selectPathway: vi.fn()
  }
}))

const pathway = {
  key: 'traditional', name: 'Traditionally Aligned', tagline: 'tag', description: 'desc',
  best_for: 'families', total_credits: 24, foundation_credits: 13, elective_credits: 11,
  requirements: [{ key: 'math', label: 'Mathematics', category: 'foundation', credits: 3 }]
}

describe('OEASelectPathwayPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pathways.mockResolvedValue({ data: { pathways: [pathway] } })
    studentEnrollment.mockResolvedValue({ data: { enrollment: { pathway_key: 'traditional' } } })
  })

  it('loads and renders the pathway options with the student name in the title', async () => {
    render(<OEASelectPathwayPage />)
    expect(screen.getByText("Choose Sam's pathway")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Traditionally Aligned')).toBeInTheDocument())
    // current enrollment marks it selected
    expect(screen.getByText('Selected pathway')).toBeInTheDocument()
  })
})
