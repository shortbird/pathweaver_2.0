import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const { oeaAPI } = vi.hoisted(() => ({
  oeaAPI: { transcript: vi.fn() },
}))
vi.mock('../../../services/api', () => ({ oeaAPI }))

import OEATranscriptPage from '../OEATranscriptPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/hearthwood/student/s1/transcript']}>
      <Routes>
        <Route path="hearthwood/student/:studentId/transcript" element={<OEATranscriptPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const FULL = {
  success: true,
  student: { name: 'Alex Doe', date_of_birth: '2010-01-01' },
  organization: { name: 'Hearthwood Academy', logo_url: null },
  pathway: { name: 'College Bound', total_credits: 24, requirements: [] },
  credits: [
    { id: 'c1', course_name: 'Algebra I', requirement_label: 'Math', credits: 1, credit_source: 'direct', letter_grade: 'A', is_weighted: false, status: 'complete', note: null },
    { id: 'c2', course_name: 'Spanish I', requirement_label: 'World Language', credits: 1, credit_source: 'earned_elsewhere', letter_grade: 'B', is_weighted: false, status: 'complete', note: 'Accepted transfer credit from previous school.' },
  ],
  gpa: { unweighted: 3.5, weighted: 3.5 },
  progress: { total_earned: 2, total_required: 24 },
  diploma_eligibility: { meets_min_direct: false, direct_credits_earned: 1, min_direct_required: 6 },
  school_year: '2026-2027',
}

beforeEach(() => vi.clearAllMocks())

describe('OEATranscriptPage', () => {
  it('renders branded transcript with credits, GPA, and the earned-elsewhere note', async () => {
    oeaAPI.transcript.mockResolvedValue({ data: FULL })
    renderPage()
    expect(await screen.findByText('Hearthwood Academy')).toBeInTheDocument()
    expect(screen.getByText('Alex Doe')).toBeInTheDocument()
    expect(screen.getByText('Algebra I')).toBeInTheDocument()
    expect(screen.getByText('Accepted transfer credit from previous school.')).toBeInTheDocument()
    // weighted + unweighted GPA both shown
    expect(screen.getAllByText('3.5').length).toBeGreaterThan(0)
    expect(oeaAPI.transcript).toHaveBeenCalledWith('s1')
  })

  it('shows an empty state when no pathway is selected', async () => {
    oeaAPI.transcript.mockResolvedValue({ data: { success: true, pathway: null } })
    renderPage()
    expect(await screen.findByText(/no diploma pathway has been chosen/i)).toBeInTheDocument()
  })
})
