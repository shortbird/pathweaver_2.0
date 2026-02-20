import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import OrganizationManagement from './OrganizationManagement'

let authState = {}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ refreshOrganization: vi.fn() })
}))

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn()
  }
}))

// Mock tab components
vi.mock('../../components/organization', () => ({
  SettingsTab: ({ orgId }) => <div data-testid="settings-tab">Settings for {orgId}</div>,
  PeopleTab: ({ orgId }) => <div data-testid="people-tab">People for {orgId}</div>,
  ContentTab: ({ orgId }) => <div data-testid="content-tab">Content for {orgId}</div>
}))

vi.mock('../../components/classes', () => ({
  ClassList: ({ orgId }) => <div data-testid="class-list">Classes for {orgId}</div>,
  ClassDetailPage: () => <div data-testid="class-detail">Class Detail</div>
}))

vi.mock('../../components/admin/OrgStudentProgress', () => ({
  default: ({ orgId }) => <div data-testid="progress-tab">Progress for {orgId}</div>
}))

import api from '../../services/api'

const mockOrgData = {
  organization: { id: 'org-1', name: 'Test Academy', slug: 'test-academy' },
  users: [
    { id: 'u1', display_name: 'User One', org_role: 'student' }
  ]
}

function renderOrgManagement(path = '/admin/organizations/org-1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/organizations/:orgId" element={<OrganizationManagement />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('OrganizationManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: { id: 'admin-1', role: 'superadmin' } }
    api.get.mockImplementation((url) => {
      if (url.includes('/api/admin/organizations/')) {
        return Promise.resolve({ data: mockOrgData })
      }
      if (url.includes('/api/settings')) {
        return Promise.resolve({ data: { settings: { site_name: 'Optio' } } })
      }
      return Promise.resolve({ data: {} })
    })
  })

  describe('loading state', () => {
    it('shows spinner while loading', () => {
      api.get.mockImplementation(() => new Promise(() => {}))
      renderOrgManagement()
      expect(document.querySelector('.animate-spin')).toBeTruthy()
    })
  })

  describe('rendering', () => {
    it('renders organization name as heading', async () => {
      renderOrgManagement()
      await waitFor(() => {
        expect(screen.getByText('Test Academy')).toBeInTheDocument()
      })
    })

    it('renders tab navigation', async () => {
      renderOrgManagement()
      await waitFor(() => {
        expect(screen.getByText('Settings')).toBeInTheDocument()
        expect(screen.getByText('People')).toBeInTheDocument()
        expect(screen.getByText('Classes')).toBeInTheDocument()
        expect(screen.getByText('Content')).toBeInTheDocument()
        expect(screen.getByText('Progress')).toBeInTheDocument()
      })
    })

    it('shows settings tab by default', async () => {
      renderOrgManagement()
      await waitFor(() => {
        expect(screen.getByTestId('settings-tab')).toBeInTheDocument()
      })
    })
  })

  describe('tab switching', () => {
    it('switches to People tab', async () => {
      renderOrgManagement()
      await waitFor(() => {
        expect(screen.getByText('People')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('People'))

      await waitFor(() => {
        expect(screen.getByTestId('people-tab')).toBeInTheDocument()
      })
    })

    it('switches to Classes tab', async () => {
      renderOrgManagement()
      await waitFor(() => {
        expect(screen.getByText('Classes')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Classes'))

      await waitFor(() => {
        expect(screen.getByTestId('class-list')).toBeInTheDocument()
      })
    })

    it('switches to Content tab', async () => {
      renderOrgManagement()
      await waitFor(() => {
        expect(screen.getByText('Content')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Content'))

      await waitFor(() => {
        expect(screen.getByTestId('content-tab')).toBeInTheDocument()
      })
    })
  })

  describe('not found', () => {
    it('shows not found when org data is null', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/admin/organizations/')) {
          return Promise.resolve({ data: null })
        }
        return Promise.resolve({ data: {} })
      })
      renderOrgManagement()
      await waitFor(() => {
        expect(screen.getByText('Organization not found')).toBeInTheDocument()
      })
    })
  })

  describe('no org id', () => {
    it('shows message when no org assigned', () => {
      authState = { user: { id: 'user-1', role: 'student' } }
      render(
        <MemoryRouter initialEntries={['/admin/organizations/']}>
          <Routes>
            <Route path="/admin/organizations/" element={<OrganizationManagement />} />
          </Routes>
        </MemoryRouter>
      )
      // No orgId param and no organization_id on user → shows not assigned message
      expect(screen.getByText('You are not assigned to an organization.')).toBeInTheDocument()
    })
  })
})
