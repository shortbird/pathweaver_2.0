import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ParentDashboardPage from './ParentDashboardPage'

const mockNavigate = vi.fn()
let authState = {}
let actingAsState = {}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('../contexts/ActingAsContext', () => ({
  useActingAs: () => actingAsState
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('../services/api', () => ({
  parentAPI: {
    getMyChildren: vi.fn()
  }
}))

vi.mock('../services/dependentAPI', () => ({
  getMyDependents: vi.fn()
}))

// Mock child components
vi.mock('../components/parent/AddDependentModal', () => ({
  default: ({ isOpen }) => isOpen ? <div data-testid="add-dependent-modal">Add Dependent</div> : null
}))

vi.mock('../components/parent/RequestStudentConnectionModal', () => ({
  default: ({ isOpen }) => isOpen ? <div data-testid="request-connection-modal">Request Connection</div> : null
}))

vi.mock('../components/parent/VisibilityApprovalSection', () => ({
  default: () => <div data-testid="visibility-approval">Approval Section</div>
}))

vi.mock('../components/parent/DependentSettingsModal', () => ({
  default: () => null
}))

vi.mock('../components/parent/FamilySettingsModal', () => ({
  default: () => null
}))

vi.mock('../components/parent/ChildOverviewContent', () => ({
  default: ({ studentId }) => <div data-testid="child-overview">Overview for {studentId}</div>
}))

vi.mock('../components/parent/ParentMomentCaptureButton', () => ({
  default: () => null
}))

vi.mock('@heroicons/react/24/outline', () => ({
  ExclamationTriangleIcon: (props) => <svg data-testid="warning-icon" {...props} />,
  UserIcon: (props) => <svg data-testid="user-icon" {...props} />,
  PlusIcon: (props) => <svg data-testid="plus-icon" {...props} />,
  Cog6ToothIcon: (props) => <svg data-testid="cog-icon" {...props} />,
  UserGroupIcon: (props) => <svg data-testid="group-icon" {...props} />,
  NewspaperIcon: (props) => <svg data-testid="newspaper-icon" {...props} />
}))

import { parentAPI } from '../services/api'
import { getMyDependents } from '../services/dependentAPI'

function renderParentDashboard() {
  return render(
    <MemoryRouter initialEntries={['/parent/dashboard']}>
      <Routes>
        <Route path="/parent/dashboard" element={<ParentDashboardPage />} />
        <Route path="/dashboard" element={<div>Student Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ParentDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = {
      user: { id: 'parent-1', role: 'parent', has_dependents: true },
      refreshUser: vi.fn()
    }
    actingAsState = {
      actingAsDependent: null,
      setActingAs: vi.fn(),
      clearActingAs: vi.fn()
    }

    parentAPI.getMyChildren.mockResolvedValue({ data: { children: [] } })
    getMyDependents.mockResolvedValue({ dependents: [] })
  })

  // --- Access control ---
  describe('access control', () => {
    it('shows Parent Access Only for non-parent users', () => {
      authState = { user: { id: 'user-1', role: 'student' }, refreshUser: vi.fn() }
      renderParentDashboard()
      expect(screen.getByText('Parent Access Only')).toBeInTheDocument()
    })

    it('shows acting-as message when managing dependent', () => {
      actingAsState = {
        actingAsDependent: { id: 'dep-1', display_name: 'Junior' },
        setActingAs: vi.fn(),
        clearActingAs: vi.fn()
      }
      renderParentDashboard()
      expect(screen.getByText(/Acting as Junior/)).toBeInTheDocument()
    })

    it('shows Switch Back button when acting as dependent', () => {
      actingAsState = {
        actingAsDependent: { id: 'dep-1', display_name: 'Junior' },
        setActingAs: vi.fn(),
        clearActingAs: vi.fn()
      }
      renderParentDashboard()
      expect(screen.getByText('Switch Back to Parent View')).toBeInTheDocument()
    })
  })

  // --- Empty state ---
  describe('empty state', () => {
    it('shows welcome message when no children', async () => {
      parentAPI.getMyChildren.mockResolvedValue({ data: { children: [] } })
      getMyDependents.mockResolvedValue({ dependents: [] })

      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByText('Welcome to Your Family Dashboard')).toBeInTheDocument()
      })
    })

    it('shows Create Child Profile option', async () => {
      renderParentDashboard()
      await waitFor(() => {
        const matches = screen.getAllByText(/Create Child Profile/)
        expect(matches.length).toBeGreaterThanOrEqual(1)
      })
    })

    it('shows Connect to Existing Student option', async () => {
      renderParentDashboard()
      await waitFor(() => {
        const matches = screen.getAllByText(/Connect to Existing Student/)
        expect(matches.length).toBeGreaterThanOrEqual(1)
      })
    })
  })

  // --- With children ---
  describe('with children', () => {
    beforeEach(() => {
      parentAPI.getMyChildren.mockResolvedValue({
        data: {
          children: [
            { student_id: 'child-1', student_first_name: 'Emma', student_last_name: 'Smith' },
            { student_id: 'child-2', student_first_name: 'Noah', student_last_name: 'Smith' }
          ]
        }
      })
      getMyDependents.mockResolvedValue({ dependents: [] })
    })

    it('renders Family Dashboard heading', async () => {
      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByText('Family Dashboard')).toBeInTheDocument()
      })
    })

    it('shows child tabs when multiple children', async () => {
      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByText(/Emma Smith/)).toBeInTheDocument()
        expect(screen.getByText(/Noah Smith/)).toBeInTheDocument()
      })
    })

    it('renders child overview content', async () => {
      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByTestId('child-overview')).toBeInTheDocument()
      })
    })

    it('renders Activity Feed button', async () => {
      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByText('Activity Feed')).toBeInTheDocument()
      })
    })

    it('renders Family Settings button', async () => {
      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByText('Family Settings')).toBeInTheDocument()
      })
    })

    it('renders visibility approval section', async () => {
      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByTestId('visibility-approval')).toBeInTheDocument()
      })
    })
  })

  // --- With dependents ---
  describe('with dependents', () => {
    it('shows dependent tabs', async () => {
      parentAPI.getMyChildren.mockResolvedValue({ data: { children: [] } })
      getMyDependents.mockResolvedValue({
        dependents: [
          { id: 'dep-1', display_name: 'Little Timmy' }
        ]
      })

      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByTestId('child-overview')).toBeInTheDocument()
      })
    })
  })

  // --- Error state ---
  describe('error state', () => {
    it('shows empty state on fetch failure', async () => {
      parentAPI.getMyChildren.mockRejectedValue(new Error('Network error'))

      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByText('Welcome to Your Family Dashboard')).toBeInTheDocument()
      })
    })
  })
})
