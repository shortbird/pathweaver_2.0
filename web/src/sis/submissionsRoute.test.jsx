import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

/**
 * Ticket bc68a12e (Apogee Cache Valley org admin): "When I click on
 * submissions to review it takes me to my school dashboard instead." The
 * school hides the classes module, and every Submissions link said
 * /classes?tab=submissions, which ModuleGate bounced to "/". The links now say
 * /submissions, which goes wherever the inbox is (Students, with classes off),
 * and ModuleGate sends an old /classes?tab=submissions link to the same place.
 * The query string rides along so ?completion_id= still opens the one piece
 * of work the link was about.
 */

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'org_managed', org_role: 'org_admin' } }) }))
const orgState = { activeOrg: null }
vi.mock('../pages/sis/useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', activeOrg: orgState.activeOrg }),
}))

import { ModuleGate, SubmissionsRedirect } from './SisRoutes'

const CLASSES_OFF = { id: 'org-1', effective_modules: ['sis', 'individual_work', 'submissions'] }
const CLASSES_ON = { id: 'org-1', effective_modules: ['sis', 'classes', 'individual_work', 'submissions'] }
const EVERYTHING_OFF = { id: 'org-1', effective_modules: ['sis'] }

const Where = ({ label }) => {
  const { pathname, search } = useLocation()
  return <div>{`${label} ${pathname}${search}`}</div>
}

const renderAt = (url) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/submissions" element={<SubmissionsRedirect />} />
      <Route path="/classes" element={<ModuleGate path="/classes"><Where label="classes" /></ModuleGate>} />
      <Route path="/students" element={<ModuleGate path="/students"><Where label="students" /></ModuleGate>} />
      <Route path="/" element={<Where label="dashboard" />} />
    </Routes>
  </MemoryRouter>,
)

describe('/submissions (bc68a12e)', () => {
  it('lands on Students with completion_id kept when classes is hidden', () => {
    orgState.activeOrg = CLASSES_OFF
    renderAt('/submissions?completion_id=X')
    expect(screen.getByText('students /students?completion_id=X&tab=submissions')).toBeInTheDocument()
  })

  it('lands on Classes when the school teaches in classes', () => {
    orgState.activeOrg = CLASSES_ON
    renderAt('/submissions?completion_id=X')
    expect(screen.getByText('classes /classes?completion_id=X&tab=submissions')).toBeInTheDocument()
  })
})

describe('ModuleGate on an old /classes?tab=submissions link (bc68a12e)', () => {
  it('sends it to the Students inbox, query intact, when classes is hidden', () => {
    orgState.activeOrg = CLASSES_OFF
    renderAt('/classes?tab=submissions&completion_id=X')
    expect(screen.getByText('students /students?tab=submissions&completion_id=X')).toBeInTheDocument()
  })

  it('still bounces any other hidden Classes tab to the dashboard', () => {
    orgState.activeOrg = CLASSES_OFF
    renderAt('/classes?tab=mine')
    expect(screen.getByText('dashboard /')).toBeInTheDocument()
  })

  it('bounces to the dashboard when the inbox has no home at all', () => {
    orgState.activeOrg = EVERYTHING_OFF
    renderAt('/classes?tab=submissions')
    expect(screen.getByText('dashboard /')).toBeInTheDocument()
  })
})
