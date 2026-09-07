/**
 * The device card shows every active device's code, every time, and lets the
 * org's own admins limit a device to one class.
 *
 * The code used to appear once, right after "Add device", and was gone for
 * good on the next load (only a hash was stored). An admin who closed the tab
 * had to deactivate the device and pair the iPad again. Now the list endpoint
 * returns the code for active devices and the card renders it with a Copy
 * button; devices from before the code was kept say so instead.
 *
 * Class scope existed on the backend from the start but had no control here,
 * so limiting an iPad to a room's students was a hand edit by Optio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(async () => true) }))
vi.mock('../../utils/appSurface', () => ({ getLearningOrigin: () => 'https://www.optioeducation.com' }))

import KioskDevicesCard from './KioskDevicesCard'

const CLASSES = [
  { id: 'c-explorers', name: 'Explorers', status: 'active' },
  { id: 'c-chesapeake', name: 'Chesapeake', status: 'active' },
]

const devices = [
  { id: 'd1', name: 'Room 2 iPad', token: 'ksk_room2code', class_id: null, class_name: null, is_active: true, last_used_at: null },
  { id: 'd2', name: 'Old iPad', token: null, class_id: null, class_name: null, is_active: true, last_used_at: null },
  { id: 'd3', name: 'Retired iPad', token: null, class_id: null, class_name: null, is_active: false, last_used_at: null },
]

// One GET answers both the device list and the class list.
const serve = ({ devices: list = devices, kioskEnabled = true, classes = CLASSES } = {}) =>
  api.get.mockImplementation(async (url) =>
    url.includes('/classes')
      ? { data: { success: true, classes } }
      : { data: { success: true, devices: list, kiosk_enabled: kioskEnabled } })

beforeEach(() => {
  vi.clearAllMocks()
  serve()
})

describe('KioskDevicesCard', () => {
  it('shows each active device code with a Copy button, and says when there is none', async () => {
    render(<KioskDevicesCard orgId="org-1" />)
    expect(await screen.findByText('ksk_room2code')).toBeInTheDocument()
    expect(screen.getByLabelText('Device code for Room 2 iPad')).toHaveTextContent('ksk_room2code')
    expect(screen.getAllByText('Copy')).toHaveLength(1)
    expect(screen.getByText(/not available for devices added before codes were kept/)).toBeInTheDocument()
    // A deactivated device shows neither a code row nor a scope picker.
    expect(screen.queryByLabelText('Students on Retired iPad')).not.toBeInTheDocument()
  })

  it('points the admin at the kiosk URL on the learning host', async () => {
    render(<KioskDevicesCard orgId="org-1" />)
    expect(await screen.findByText('https://www.optioeducation.com/kiosk')).toBeInTheDocument()
  })

  it('adding a device reloads the list, where the new code appears', async () => {
    let list = []
    api.get.mockImplementation(async (url) =>
      url.includes('/classes')
        ? { data: { success: true, classes: CLASSES } }
        : { data: { success: true, devices: list, kiosk_enabled: true } })
    api.post.mockImplementation(async () => {
      list = [{ id: 'd4', name: 'Room 3 iPad', token: 'ksk_room3code', class_id: null, is_active: true }]
      return { data: { success: true, device: list[0], device_token: 'ksk_room3code' } }
    })
    render(<KioskDevicesCard orgId="org-1" />)
    await screen.findByText('No kiosk devices yet.')
    fireEvent.change(screen.getByPlaceholderText(/Device name/), { target: { value: 'Room 3 iPad' } })
    fireEvent.click(screen.getByText('Add device'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/kiosk/devices',
      { name: 'Room 3 iPad', organization_id: 'org-1', class_id: null }))
    expect(await screen.findByText('ksk_room3code')).toBeInTheDocument()
    expect(screen.queryByText(/will not be shown again/)).not.toBeInTheDocument()
  })

  it('a new device can be limited to a class from the add row', async () => {
    api.post.mockResolvedValue({ data: { success: true } })
    render(<KioskDevicesCard orgId="org-1" />)
    const picker = await screen.findByLabelText('Limit to class')
    expect(picker).toHaveTextContent('All students')
    expect(picker).toHaveTextContent('Explorers')
    fireEvent.change(picker, { target: { value: 'c-explorers' } })
    fireEvent.change(screen.getByPlaceholderText(/Device name/), { target: { value: 'Explorers iPad' } })
    fireEvent.click(screen.getByText('Add device'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/kiosk/devices',
      { name: 'Explorers iPad', organization_id: 'org-1', class_id: 'c-explorers' }))
  })

  it("an existing device's class can be changed in place, and cleared again", async () => {
    api.patch.mockResolvedValue({ data: { success: true } })
    render(<KioskDevicesCard orgId="org-1" />)
    const picker = await screen.findByLabelText('Students on Room 2 iPad')
    expect(picker.value).toBe('')
    fireEvent.change(picker, { target: { value: 'c-chesapeake' } })
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/kiosk/devices/d1', { class_id: 'c-chesapeake' }))
    fireEvent.change(picker, { target: { value: '' } })
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/kiosk/devices/d1', { class_id: null }))
  })

  it('a device scoped to a class that has since been archived still shows that class', async () => {
    serve({ devices: [{ id: 'd5', name: 'Attic iPad', token: 'ksk_attic', class_id: 'c-gone', class_name: 'Class of 2025', is_active: true }] })
    render(<KioskDevicesCard orgId="org-1" />)
    const picker = await screen.findByLabelText('Students on Attic iPad')
    expect(picker.value).toBe('c-gone')
    expect(picker).toHaveTextContent('Class of 2025')
  })

  it('a school with no classes gets no picker: every device lists everyone', async () => {
    serve({ classes: [] })
    render(<KioskDevicesCard orgId="org-1" />)
    await screen.findByText('ksk_room2code')
    expect(screen.queryByLabelText('Limit to class')).not.toBeInTheDocument()
    expect(screen.getAllByText('All students').length).toBeGreaterThan(0)
  })

  it('explains itself when the block is off', async () => {
    serve({ devices: [], kioskEnabled: false })
    render(<KioskDevicesCard orgId="org-1" />)
    expect(await screen.findByText(/not enabled for this organization/)).toBeInTheDocument()
    expect(screen.getByText('Add device')).toBeDisabled()
  })
})
