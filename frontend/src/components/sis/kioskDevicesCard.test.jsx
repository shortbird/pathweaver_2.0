/**
 * The device card shows every active device's code, every time.
 *
 * The code used to appear once, right after "Add device", and was gone for
 * good on the next load (only a hash was stored). An admin who closed the tab
 * had to deactivate the device and pair the iPad again. Now the list endpoint
 * returns the code for active devices and the card renders it with a Copy
 * button; devices from before the code was kept say so instead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(async () => true) }))
vi.mock('../../utils/appSurface', () => ({ getLearningOrigin: () => 'https://www.optioeducation.com' }))

import KioskDevicesCard from './KioskDevicesCard'

const devices = [
  { id: 'd1', name: 'Room 2 iPad', token: 'ksk_room2code', is_active: true, last_used_at: null },
  { id: 'd2', name: 'Old iPad', token: null, is_active: true, last_used_at: null },
  { id: 'd3', name: 'Retired iPad', token: null, is_active: false, last_used_at: null },
]

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { success: true, devices, kiosk_enabled: true } })
})

describe('KioskDevicesCard', () => {
  it('shows each active device code with a Copy button, and says when there is none', async () => {
    render(<KioskDevicesCard orgId="org-1" />)
    expect(await screen.findByText('ksk_room2code')).toBeInTheDocument()
    expect(screen.getByLabelText('Device code for Room 2 iPad')).toHaveTextContent('ksk_room2code')
    expect(screen.getAllByText('Copy')).toHaveLength(1)
    expect(screen.getByText(/not available for devices added before codes were kept/)).toBeInTheDocument()
    // A deactivated device shows no code row at all.
    expect(screen.getByText('Retired iPad').closest('div').parentElement.textContent).not.toMatch(/Code:/)
  })

  it('points the admin at the kiosk URL on the learning host', async () => {
    render(<KioskDevicesCard orgId="org-1" />)
    expect(await screen.findByText('https://www.optioeducation.com/kiosk')).toBeInTheDocument()
  })

  it('adding a device reloads the list, where the new code appears', async () => {
    api.post.mockResolvedValue({ data: { success: true, device: { id: 'd4', name: 'Room 3 iPad', token: 'ksk_room3code' }, device_token: 'ksk_room3code' } })
    api.get
      .mockResolvedValueOnce({ data: { success: true, devices: [], kiosk_enabled: true } })
      .mockResolvedValueOnce({ data: { success: true, devices: [{ id: 'd4', name: 'Room 3 iPad', token: 'ksk_room3code', is_active: true }], kiosk_enabled: true } })
    render(<KioskDevicesCard orgId="org-1" />)
    await screen.findByText('No kiosk devices yet.')
    fireEvent.change(screen.getByPlaceholderText(/Device name/), { target: { value: 'Room 3 iPad' } })
    fireEvent.click(screen.getByText('Add device'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/kiosk/devices', { name: 'Room 3 iPad', organization_id: 'org-1' }))
    expect(await screen.findByText('ksk_room3code')).toBeInTheDocument()
    expect(screen.queryByText(/will not be shown again/)).not.toBeInTheDocument()
  })

  it('explains itself when the block is off', async () => {
    api.get.mockResolvedValue({ data: { success: true, devices: [], kiosk_enabled: false } })
    render(<KioskDevicesCard orgId="org-1" />)
    expect(await screen.findByText(/not enabled for this organization/)).toBeInTheDocument()
    expect(screen.getByText('Add device')).toBeDisabled()
  })
})
