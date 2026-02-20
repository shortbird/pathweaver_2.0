import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AdvisorDashboard from './AdvisorDashboard'

let authState = {}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn()
  },
  advisorAPI: {
    getCaseloadSummary: vi.fn()
  }
}))

// Mock child components
vi.mock('../components/advisor/AdvisorStudentListPanel', () => ({
  default: ({ students, onSelectStudent }) => (
    <div data-testid="student-list-panel">
      {students.map(s => (
        <button key={s.id} data-testid={`student-${s.id}`} onClick={() => onSelectStudent(s)}>
          {s.display_name}
        </button>
      ))}
    </div>
  )
}))

vi.mock('../components/advisor/AdvisorDefaultPanel', () => ({
  default: ({ caseloadSummary }) => (
    <div data-testid="default-panel">
      {caseloadSummary && <span data-testid="caseload-summary">Summary loaded</span>}
    </div>
  )
}))

vi.mock('../components/advisor/AdvisorStudentPanel', () => ({
  default: ({ student, onBack }) => (
    <div data-testid="student-panel">
      <span>{student.display_name}</span>
      <button data-testid="back-btn" onClick={onBack}>Back</button>
    </div>
  )
}))

import api, { advisorAPI } from '../services/api'

describe('AdvisorDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: { id: 'advisor-1', role: 'advisor' } }

    // Default: desktop viewport
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })

    api.get.mockResolvedValue({
      data: {
        students: [
          { id: 'stu-1', display_name: 'Alice Johnson', first_name: 'Alice', last_name: 'Johnson' },
          { id: 'stu-2', display_name: 'Bob Wilson', first_name: 'Bob', last_name: 'Wilson' }
        ]
      }
    })

    advisorAPI.getCaseloadSummary.mockResolvedValue({
      data: {
        success: true,
        summary: {
          per_student_rhythm: {},
          rhythm_counts: { in_flow: 1, building: 1 }
        }
      }
    })
  })

  // --- Loading state ---
  describe('loading state', () => {
    it('shows loading spinner and text', () => {
      api.get.mockImplementation(() => new Promise(() => {}))
      advisorAPI.getCaseloadSummary.mockImplementation(() => new Promise(() => {}))
      render(<AdvisorDashboard />)
      expect(screen.getByText('Loading dashboard...')).toBeInTheDocument()
    })
  })

  // --- Error state ---
  describe('error state', () => {
    it('shows error message on failure', async () => {
      api.get.mockRejectedValue({ response: { data: { error: 'Unauthorized' } } })
      advisorAPI.getCaseloadSummary.mockRejectedValue(new Error('fail'))
      render(<AdvisorDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Unauthorized')).toBeInTheDocument()
      })
    })

    it('shows retry button on error', async () => {
      api.get.mockRejectedValue(new Error('fail'))
      advisorAPI.getCaseloadSummary.mockRejectedValue(new Error('fail'))
      render(<AdvisorDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument()
      })
    })
  })

  // --- Desktop rendering ---
  describe('desktop rendering', () => {
    it('renders Advisor Dashboard heading', async () => {
      render(<AdvisorDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Advisor Dashboard')).toBeInTheDocument()
      })
    })

    it('shows student count', async () => {
      render(<AdvisorDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/2 students/)).toBeInTheDocument()
      })
    })

    it('renders student list panel', async () => {
      render(<AdvisorDashboard />)
      await waitFor(() => {
        expect(screen.getByTestId('student-list-panel')).toBeInTheDocument()
      })
    })

    it('renders default panel when no student selected', async () => {
      render(<AdvisorDashboard />)
      await waitFor(() => {
        expect(screen.getByTestId('default-panel')).toBeInTheDocument()
      })
    })

    it('shows caseload summary in default panel', async () => {
      render(<AdvisorDashboard />)
      await waitFor(() => {
        expect(screen.getByTestId('caseload-summary')).toBeInTheDocument()
      })
    })

    it('shows student names in list', async () => {
      render(<AdvisorDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
        expect(screen.getByText('Bob Wilson')).toBeInTheDocument()
      })
    })
  })

  // --- Student selection ---
  describe('student selection', () => {
    it('shows student panel when student is selected', async () => {
      render(<AdvisorDashboard />)
      await waitFor(() => {
        expect(screen.getByTestId('student-list-panel')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('student-stu-1'))

      await waitFor(() => {
        expect(screen.getByTestId('student-panel')).toBeInTheDocument()
      })
    })

    it('returns to default panel on back', async () => {
      render(<AdvisorDashboard />)
      await waitFor(() => {
        expect(screen.getByTestId('student-list-panel')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('student-stu-1'))

      await waitFor(() => {
        expect(screen.getByTestId('student-panel')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('back-btn'))

      await waitFor(() => {
        expect(screen.getByTestId('default-panel')).toBeInTheDocument()
      })
    })
  })

  // --- Rhythm counts ---
  describe('rhythm data', () => {
    it('shows in-flow count in header', async () => {
      render(<AdvisorDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/1 in flow/)).toBeInTheDocument()
      })
    })
  })
})
