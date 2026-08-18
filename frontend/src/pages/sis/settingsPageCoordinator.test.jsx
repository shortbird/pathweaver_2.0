import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import SettingsPage from './SettingsPage'
import { AuthContext } from '../../contexts/AuthContext'
import api from '../../services/api'
import { useSisOrg } from './useSisOrg'

/**
 * Settings for a campus coordinator.
 *
 * The page used to say "Organization not found" for them: it reads
 * /api/admin/organizations/:id, which was org_admin-only, and a coordinator is
 * deliberately not an org_admin. It is front-office now, with the prices
 * redacted per field — so the page loads, minus the one card that IS the org
 * admin's: identity, branding, AI entitlements and tuition.
 */

vi.mock('../../services/api')
vi.mock('./useSisOrg')
vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ refreshOrganization: vi.fn() }),
}))

const ORG = {
  id: 'org-1',
  name: 'iCreate',
  slug: 'icreate',
  // Exactly what the backend hands a coordinator: rooms, no tuition.
  feature_flags: { sis_settings: { rooms: [{ name: 'Kitchen', description: 'Cooking' }] } },
}

const renderAs = (user) => render(
  <MemoryRouter>
    <AuthContext.Provider value={{ user }}>
      <SettingsPage />
    </AuthContext.Provider>
  </MemoryRouter>
)

beforeEach(() => {
  vi.resetAllMocks()
  useSisOrg.mockReturnValue({
    orgId: 'org-1', setOrgId: vi.fn(), orgs: [ORG], isSuperadmin: false, loading: false,
  })
  api.get.mockImplementation((url) => {
    if (url.includes('/api/admin/organizations/')) return Promise.resolve({ data: { organization: ORG } })
    return Promise.resolve({ data: {} })
  })
  api.put.mockResolvedValue({ data: { success: true } })
})

describe('SIS Settings for a campus coordinator', () => {
  it('loads the page and the operational cards', async () => {
    renderAs({ id: 'kate', role: 'org_managed', org_roles: ['campus_coordinator'] })
    expect(await screen.findByText('Classrooms & Rooms')).toBeInTheDocument()
    expect(screen.queryByText('Organization not found.')).not.toBeInTheDocument()
  })

  it('leaves out the organization card — identity, AI and tuition', async () => {
    renderAs({ id: 'kate', role: 'org_managed', org_roles: ['campus_coordinator'] })
    await screen.findByText('Classrooms & Rooms')
    expect(screen.queryByText('Organization')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/tuition/i)).not.toBeInTheDocument()
  })

  it('still shows an org admin everything', async () => {
    renderAs({ id: 'admin', role: 'org_managed', org_roles: ['org_admin'] })
    await waitFor(() => expect(screen.getByText('Classrooms & Rooms')).toBeInTheDocument())
    expect(screen.getByText('Organization')).toBeInTheDocument()
  })
})
