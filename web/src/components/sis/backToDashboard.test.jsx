import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * iCreate filed this three times in two minutes (2026-07-31), from /my-classes,
 * /forms and /onboarding: "No way to get back to the teacher dashboard from
 * this page."
 *
 * The label has to follow what `/` will actually render for the viewer — an
 * admin who isn't previewing a teacher lands on the School Dashboard, so
 * promising them a "teacher dashboard" would be a lie.
 */

let authState = { user: { id: 'u1', role: 'org_managed', org_role: 'advisor' } }
let previewTeacher = null

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../pages/sis/teacherPreview', () => ({
  getPreviewTeacher: () => previewTeacher,
}))

import BackToDashboard from './BackToDashboard'

const renderLink = () => render(<MemoryRouter><BackToDashboard /></MemoryRouter>)

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_managed', org_role: 'advisor' } }
  previewTeacher = null
})

describe('BackToDashboard', () => {
  it('points a teacher at their dashboard', () => {
    renderLink()
    const link = screen.getByRole('link', { name: /Teacher dashboard/ })
    expect(link).toHaveAttribute('href', '/')
  })

  it('says "Teacher dashboard" to an admin previewing a teacher portal', () => {
    authState = { user: { id: 'u1', role: 'org_managed', org_role: 'org_admin' } }
    previewTeacher = { id: 't1', name: 'Kate' }
    renderLink()
    expect(screen.getByRole('link', { name: /Teacher dashboard/ })).toBeInTheDocument()
  })

  it('says just "Dashboard" to an admin who is not previewing — that is what they get', () => {
    authState = { user: { id: 'u1', role: 'org_managed', org_role: 'org_admin' } }
    renderLink()
    expect(screen.getByRole('link', { name: /Dashboard/ })).toBeInTheDocument()
    expect(screen.queryByText(/Teacher dashboard/)).not.toBeInTheDocument()
  })
})
