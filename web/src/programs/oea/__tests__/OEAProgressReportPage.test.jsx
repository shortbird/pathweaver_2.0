import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const { oeaAPI } = vi.hoisted(() => ({
  oeaAPI: { progressReport: vi.fn() },
}))
vi.mock('../../../services/api', () => ({ oeaAPI }))

import OEAProgressReportPage from '../OEAProgressReportPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/hearthwood/student/s1/progress-report']}>
      <Routes>
        <Route path="hearthwood/student/:studentId/progress-report" element={<OEAProgressReportPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const REPORT = {
  success: true,
  student: { name: 'Alex Doe' },
  organization: { name: 'Hearthwood Academy' },
  term_index: 1,
  school_year: '2026-2027',
  courses: [
    {
      credit_id: 'c1', course_name: 'Algebra I', credit_source: 'direct',
      quarter_grade: 'B', quarter_summary: 'Solid progress on linear equations.',
      compliance: { logs: 9, logs_required: 9, artifacts: 3, artifacts_required: 3, summaries: 1, summaries_required: 1, is_compliant: true, missing: {} },
    },
  ],
}

beforeEach(() => vi.clearAllMocks())

describe('OEAProgressReportPage', () => {
  it('renders the quarter report with grade, summary, and compliance', async () => {
    oeaAPI.progressReport.mockResolvedValue({ data: REPORT })
    renderPage()
    expect(await screen.findByText('Algebra I')).toBeInTheDocument()
    expect(screen.getByText('Grade: B')).toBeInTheDocument()
    expect(screen.getByText(/Solid progress/)).toBeInTheDocument()
    expect(screen.getByText(/Logs 9\/9/)).toBeInTheDocument()
    expect(oeaAPI.progressReport).toHaveBeenCalledWith('s1', 1)
  })

  it('reloads when a different quarter is selected', async () => {
    oeaAPI.progressReport.mockResolvedValue({ data: REPORT })
    renderPage()
    await screen.findByText('Algebra I')
    fireEvent.click(screen.getByText('Q3'))
    await waitFor(() => expect(oeaAPI.progressReport).toHaveBeenCalledWith('s1', 3))
  })
})
