import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AdminPage from './AdminPage'

let authState = {}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

// Mock all lazy-loaded components
vi.mock('../components/admin/AdminQuests', () => ({
  default: () => <div data-testid="admin-quests">Admin Quests</div>
}))
vi.mock('../components/admin/AdminUsers', () => ({
  default: () => <div data-testid="admin-users">Admin Users</div>
}))
vi.mock('../components/admin/AdminConnections', () => ({
  default: () => <div data-testid="admin-connections">Admin Connections</div>
}))
vi.mock('../components/admin/AdminDashboard', () => ({
  default: () => <div data-testid="admin-dashboard">Admin Dashboard</div>
}))
vi.mock('../components/admin/FlaggedTasksPanel', () => ({
  default: () => <div data-testid="flagged-tasks">Flagged Tasks</div>
}))
vi.mock('./admin/UserActivityLogPage', () => ({
  default: () => <div>Activity Log</div>
}))
vi.mock('../components/admin/SparkLogsPanel', () => ({
  default: () => <div data-testid="spark-logs">Spark Logs</div>
}))
vi.mock('../components/admin/AutomatedEmailsList', () => ({
  default: () => <div>Emails</div>
}))
vi.mock('./admin/OrganizationDashboard', () => ({
  default: () => <div data-testid="org-dashboard">Org Dashboard</div>
}))
vi.mock('./admin/OrganizationManagement', () => ({
  default: () => <div>Org Management</div>
}))
vi.mock('./admin/ParentalConsentReviewPage', () => ({
  default: () => <div>Parental Consent</div>
}))
vi.mock('./admin/CurriculumUploadPage', () => ({
  default: () => <div>Curriculum Upload</div>
}))
vi.mock('./admin/CourseGeneratorWizard', () => ({
  default: () => <div>Course Generator</div>
}))
vi.mock('./admin/CourseGenerationQueue', () => ({
  default: () => <div>Generation Queue</div>
}))
vi.mock('./admin/CourseEnrollmentsPage', () => ({
  default: () => <div>Course Enrollments</div>
}))
vi.mock('./admin/TransferCreditForm', () => ({
  default: () => <div>Transfer Credits</div>
}))
vi.mock('./admin/CoursePlanMode', () => ({
  default: () => <div>Course Plan</div>
}))
vi.mock('../components/admin/DraftFeedbackPanel', () => ({
  default: () => <div>Draft Feedback</div>
}))
vi.mock('../components/admin/DocsManager', () => ({
  default: () => <div>Docs Manager</div>
}))

function renderAdmin(path = '/admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/*" element={<AdminPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('superadmin view', () => {
    beforeEach(() => {
      authState = { user: { id: 'admin-1', role: 'superadmin' } }
    })

    it('renders Admin Panel heading', async () => {
      renderAdmin()
      await waitFor(() => {
        expect(screen.getByText('Admin Panel')).toBeInTheDocument()
      })
    })

    it('shows admin tabs', async () => {
      renderAdmin()
      await waitFor(() => {
        // Tabs appear in both mobile select and desktop links
        expect(screen.getAllByText('Analytics').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('Users').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('Connections').length).toBeGreaterThanOrEqual(1)
      })
    })

    it('shows superadmin-only tabs', async () => {
      renderAdmin()
      await waitFor(() => {
        expect(screen.getAllByText('Draft Feedback').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('Course Enrollments').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('Docs').length).toBeGreaterThanOrEqual(1)
      })
    })

    it('renders AdminQuests by default', async () => {
      renderAdmin()
      await waitFor(() => {
        expect(screen.getByTestId('admin-quests')).toBeInTheDocument()
      })
    })

    it('renders Organizations tab', async () => {
      renderAdmin()
      await waitFor(() => {
        expect(screen.getAllByText('Organizations').length).toBeGreaterThanOrEqual(1)
      })
    })

    it('renders Parental Consent tab', async () => {
      renderAdmin()
      await waitFor(() => {
        expect(screen.getAllByText('Parental Consent').length).toBeGreaterThanOrEqual(1)
      })
    })
  })

  describe('org_admin view', () => {
    beforeEach(() => {
      authState = { user: { id: 'org-admin-1', role: 'org_managed', org_role: 'org_admin' } }
    })

    it('renders Admin Panel heading for org_admin', async () => {
      renderAdmin()
      await waitFor(() => {
        expect(screen.getByText('Admin Panel')).toBeInTheDocument()
      })
    })

    it('shows admin tabs for org_admin', async () => {
      renderAdmin()
      await waitFor(() => {
        expect(screen.getAllByText('Users').length).toBeGreaterThanOrEqual(1)
      })
    })

    it('does not show superadmin-only tabs', async () => {
      renderAdmin()
      await waitFor(() => {
        expect(screen.queryByText('Draft Feedback')).not.toBeInTheDocument()
        expect(screen.queryByText('Course Enrollments')).not.toBeInTheDocument()
      })
    })
  })

  describe('advisor view', () => {
    beforeEach(() => {
      authState = { user: { id: 'advisor-1', role: 'advisor' } }
    })

    it('renders Advisor Panel heading', async () => {
      renderAdmin()
      await waitFor(() => {
        expect(screen.getByText('Advisor Panel')).toBeInTheDocument()
      })
    })

    it('shows Quests tab for advisors', async () => {
      renderAdmin()
      await waitFor(() => {
        // Quests appears in both the tab and the rendered AdminQuests component
        expect(screen.getAllByText(/Quests/).length).toBeGreaterThanOrEqual(1)
      })
    })

    it('does not show admin-only tabs for advisors', async () => {
      renderAdmin()
      await waitFor(() => {
        expect(screen.queryByText('Analytics')).not.toBeInTheDocument()
        expect(screen.queryByText('Organizations')).not.toBeInTheDocument()
      })
    })
  })

  describe('route rendering', () => {
    it('renders users panel on /admin/users', async () => {
      authState = { user: { id: 'admin-1', role: 'superadmin' } }
      renderAdmin('/admin/users')
      await waitFor(() => {
        expect(screen.getByTestId('admin-users')).toBeInTheDocument()
      })
    })

    it('renders analytics on /admin/analytics', async () => {
      authState = { user: { id: 'admin-1', role: 'superadmin' } }
      renderAdmin('/admin/analytics')
      await waitFor(() => {
        expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument()
      })
    })
  })
})
