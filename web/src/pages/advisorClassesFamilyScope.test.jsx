import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import AdvisorClassesPage from './AdvisorClassesPage'

/**
 * Ticket 8700c16d (iCreate org admin who is also a parent): "When I am
 * working with brady I don't actually see his classes."
 *
 * /org-classes picked its view from the signed-in role alone, so an org
 * admin in family scope got her own teaching list. In scope it must be the
 * student view, which reads the scope and asks as the child.
 */

let scopeState
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'mom', role: 'org_managed', org_role: 'org_admin', organization_id: 'org-1' } }),
}))
vi.mock('../contexts/FamilyScopeContext', () => ({ useFamilyScope: () => scopeState }))
vi.mock('../components/classes', () => ({
  ClassList: () => <div>TEACHING LIST</div>,
  ClassDetailPage: () => <div>TEACHING DETAIL</div>,
}))
vi.mock('../components/classes/StudentClassesView', () => ({
  default: () => <div>STUDENT CLASSES</div>,
}))

const renderPage = () => render(<MemoryRouter><AdvisorClassesPage /></MemoryRouter>)

beforeEach(() => {
  scopeState = { isScoped: false, selectedChild: null, selectedChildId: null }
})

describe('AdvisorClassesPage in family scope', () => {
  it("shows the scoped child's classes, not the admin's teaching list", () => {
    scopeState = { isScoped: true, selectedChild: { id: 'brady' }, selectedChildId: 'brady' }
    renderPage()
    expect(screen.getByText('STUDENT CLASSES')).toBeInTheDocument()
    expect(screen.queryByText('TEACHING LIST')).not.toBeInTheDocument()
  })

  it('keeps the teaching list when no child is picked', () => {
    renderPage()
    expect(screen.getByText('TEACHING LIST')).toBeInTheDocument()
  })
})
