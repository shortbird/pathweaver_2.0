import React from 'react'
import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import SettingsPage from './SettingsPage'
import { AuthContext } from '../../contexts/AuthContext'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'

/**
 * The fields that used to live only on the learning app's /organization
 * Settings tab (removed 2026-10-15, when every org became an SIS org): the
 * Pillars switch for everyone who manages the school, and the slug and the
 * "Diplomas through Optio Academy" switch for Optio staff only.
 */

vi.mock('../../services/api')
vi.mock('./useSisOrg')
vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ refreshOrganization: vi.fn() }),
}))

const ORG = { id: 'org-1', name: 'Treehouse', slug: 'treehouse', feature_flags: {} }

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
  withOrg.mockImplementation((p) => p)
  api.get.mockImplementation((url) => {
    if (url.includes('/api/admin/organizations/')) return Promise.resolve({ data: { organization: ORG } })
    return Promise.resolve({ data: {} })
  })
})

describe('SIS Settings: fields moved from the organization console', () => {
  it('shows the Pillars card to an org admin', async () => {
    renderAs({ id: 'admin', role: 'org_managed', org_roles: ['org_admin'] })
    expect(await screen.findByText('Pillars')).toBeInTheDocument()
  })

  it('lets a superadmin edit the slug and the Optio diploma switch', async () => {
    renderAs({ id: 'su', role: 'superadmin' })
    expect(await screen.findByText('Diplomas through Optio Academy')).toBeInTheDocument()
    expect(screen.getByDisplayValue('treehouse')).toBeEnabled()
  })

  it('does not offer either to an org admin', async () => {
    renderAs({ id: 'admin', role: 'org_managed', org_roles: ['org_admin'] })
    await screen.findByText('Pillars')
    expect(screen.queryByText('Diplomas through Optio Academy')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('treehouse')).toBeDisabled()
  })
})
