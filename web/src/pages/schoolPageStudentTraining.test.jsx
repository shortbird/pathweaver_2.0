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

vi.mock('../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ school: { id: 'org-1', name: 'iCreate', homepage: true }, loading: false }),
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
})
