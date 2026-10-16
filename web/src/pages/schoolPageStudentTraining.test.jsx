import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SchoolPage from './SchoolPage'
import SchoolShell from './school/SchoolShell'
import api from '../services/api'

/**
 * The /school page carries the student's training links (iCreate, Molly,
 * 2026-09-22, ae16c5da: "... and students if it's not there too"). The card's
 * own behaviour is in components/school/mySchoolTraining.test.jsx; this holds
 * that the page actually renders it.
 */

let organization = null
vi.mock('../contexts/OrganizationContext', () => ({
  useOrganization: () => ({
    school: { id: 'org-1', name: 'iCreate', homepage: true }, organization, loading: false,
  }),
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, effectiveRole: 'student' }),
}))
vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))


const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/school']}>
        <Routes>
          <Route element={<SchoolShell />}>
            <Route path="*" element={<SchoolPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const archive = { data: { success: true, announcements: [], total: 0, limit: 20, offset: 0 } }

describe('SchoolPage and the student training card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    organization = null
  })

  it('shows the school\'s student training links', async () => {
    api.get.mockImplementation((url) => Promise.resolve(
      url === '/api/sis/student/training'
        ? { data: { success: true, training: [{ id: 'l1', kind: 'link', title: 'Last Friday training',
          url: 'https://loom.com/x', is_required: false, my_done: null }] } }
        : archive))
    renderPage()
    expect(await screen.findByRole('link', { name: 'Last Friday training' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/sis/student/training')
  })

  it('shows no card when there is nothing for this person', async () => {
    api.get.mockImplementation((url) => Promise.resolve(
      url === '/api/sis/student/training' ? { data: { success: true, training: [] } } : archive))
    renderPage()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/student/training'))
    expect(screen.queryByRole('region', { name: 'Watch or read' })).not.toBeInTheDocument()
  })

  describe('a school with the training module off', () => {
    // Sentry: ModuleGate warnings for /api/sis/student/training from Optio
    // Academy, which has training off. The card is not mounted there.
    const respond = (schoolOrg) => api.get.mockImplementation((url) => {
      if (url === '/api/sis/school/context') {
        return Promise.resolve({ data: { success: true, orgs: [schoolOrg] } })
      }
      if (url === '/api/sis/student/training') {
        return Promise.resolve({ data: { success: true, training: [] } })
      }
      return Promise.resolve(archive)
    })
    const SCHOOL_ORG = { organization_id: 'org-1', organization_name: 'iCreate', is_guardian: false }

    it("does not ask when the school context's module list leaves it out", async () => {
      respond({ ...SCHOOL_ORG, modules: ['calendar', 'community'] })
      renderPage()
      // The board read goes out once the context has answered, so by then the
      // training read would have too.
      await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/community/feed', undefined))
      expect(api.get).not.toHaveBeenCalledWith('/api/sis/student/training')
      expect(api.get).not.toHaveBeenCalledWith('/api/sis/student/materials')
    })

    it("does not ask when the student's own org payload says it is off", async () => {
      organization = { id: 'org-1', effective_modules: ['sis', 'classes'] }
      respond({ ...SCHOOL_ORG, modules: null })
      renderPage()
      await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/student/materials'))
      expect(api.get).not.toHaveBeenCalledWith('/api/sis/student/training')
    })

    it('still asks when the school runs training', async () => {
      respond({ ...SCHOOL_ORG, modules: ['training'] })
      renderPage()
      await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/student/training'))
    })
  })
})
