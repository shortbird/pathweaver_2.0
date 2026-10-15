/**
 * Where the student overview's Back goes.
 *
 * With a returnTo (the credit grader, the SIS student progress report) Back
 * goes there. Without one it went to the organization console's tab
 * (/organization?tab=people), which is being retired: every org is an SIS org
 * since 2026-10-15. It goes to the school's People page in the SIS console now.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import OrgStudentOverviewPage from './OrgStudentOverviewPage'

const { switchSurfaceInApp } = vi.hoisted(() => ({ switchSurfaceInApp: vi.fn() }))
vi.mock('../../utils/appSurface', async (importOriginal) => ({
  ...(await importOriginal()), switchSurfaceInApp,
}))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true, isSuperadmin: false }),
}))
vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ organization: { id: 'org-1' } }),
}))
vi.mock('../../components/advisor/AdvisorStudentOverviewContent', () => ({
  default: ({ studentId }) => <p>Overview of {studentId}</p>,
}))

const Where = () => {
  const l = useLocation()
  return <output data-testid="where">{l.pathname + l.search}</output>
}

const mount = (url) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/admin/organizations/:orgId/student/:studentId" element={<OrgStudentOverviewPage />} />
      <Route path="/reports" element={<p>Reports page</p>} />
    </Routes>
    <Where />
  </MemoryRouter>,
)

beforeEach(() => vi.clearAllMocks())

describe('the student overview Back button', () => {
  it('goes to the SIS People page when nothing says otherwise', () => {
    mount('/admin/organizations/org-1/student/s1')
    fireEvent.click(screen.getByRole('button', { name: 'Back to People' }))
    expect(switchSurfaceInApp).toHaveBeenCalledWith('sis', '/people')
  })

  it('an old console link with ?tab= goes to People too, not to the console', () => {
    mount('/admin/organizations/org-1/student/s1?tab=progress')
    fireEvent.click(screen.getByRole('button', { name: 'Back to People' }))
    expect(switchSurfaceInApp).toHaveBeenCalledWith('sis', '/people')
  })

  it('goes to returnTo when it is given', () => {
    mount(`/admin/organizations/org-1/student/s1?returnTo=${encodeURIComponent('/reports?report=student-progress')}`)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Reports page')).toBeInTheDocument()
    expect(screen.getByTestId('where').textContent).toBe('/reports?report=student-progress')
    expect(switchSurfaceInApp).not.toHaveBeenCalled()
  })
})
