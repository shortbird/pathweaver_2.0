import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import SettingsPage from './SettingsPage'
import api from '../../services/api'
import { useSisOrg } from './useSisOrg'

vi.mock('../../services/api')
vi.mock('./useSisOrg')
vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ refreshOrganization: vi.fn() }),
}))

describe('SettingsPage scroll position behavior', () => {
  const mockOrg = {
    id: 'org-123',
    name: 'iCreate Academy',
    slug: 'icreate',
    feature_flags: {
      sis_settings: {
        rooms: [{ name: 'Room 101', description: 'Main hall' }],
      },
    },
  }

  beforeEach(() => {
    vi.resetAllMocks()
    useSisOrg.mockReturnValue({
      orgId: 'org-123',
      setOrgId: vi.fn(),
      orgs: [mockOrg],
      isSuperadmin: false,
      loading: false,
    })
    api.get.mockImplementation((url) => {
      if (url.includes('/api/admin/organizations/')) {
        return Promise.resolve({ data: { organization: mockOrg } })
      }
      if (url.includes('/api/kiosk/devices')) {
        return Promise.resolve({ data: { devices: [] } })
      }
      return Promise.resolve({ data: {} })
    })
    api.put.mockResolvedValue({ data: { success: true } })
  })

  it('renders settings cards and updates org in background without unmounting/showing full spinner on save', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )

    // Wait for org settings to load
    await waitFor(() => {
      expect(screen.getByText('Classrooms & Rooms')).toBeInTheDocument()
    })

    const initialGetCount = api.get.mock.calls.filter(([url]) => url.includes('/api/admin/organizations/')).length
    expect(initialGetCount).toBe(1)

    // Find the save rooms button and click it
    const saveBtn = screen.getByRole('button', { name: 'Save rooms' })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(api.put).toHaveBeenCalled()
    })

    // Expect api.get for organization to be called again for background refresh
    await waitFor(() => {
      const getCount = api.get.mock.calls.filter(([url]) => url.includes('/api/admin/organizations/')).length
      expect(getCount).toBe(2)
    })

    // Ensure the Classrooms & Rooms section remained mounted in DOM throughout save
    expect(screen.getByText('Classrooms & Rooms')).toBeInTheDocument()
  })
})
