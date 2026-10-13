import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
}))
vi.mock('../services/api', () => ({ default: api }))
vi.mock('../services/authService', () => ({
  default: { logout: vi.fn(() => Promise.resolve()) },
}))

import KioskPage from './KioskPage'

// The student session asks about points helpers through react-query (ticket 0f401a62).
const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

// This jsdom setup's localStorage lacks working methods locally (known quirk —
// see AuthContext.test.jsx history). Use a real in-memory implementation.
const storage = new Map()
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  },
})

const rosterResponse = {
  data: {
    success: true,
    org: { name: 'Gryffin Learning Center', logo_url: null, colors: { primary: '#8B5CF6' } },
    device: { name: 'Room 2 iPad', class_id: null },
    students: [
      { id: 's1', name: 'Ada', display_name: 'Ada L', avatar_url: null },
      { id: 's2', name: 'Grace', display_name: 'Grace H', avatar_url: null },
    ],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.removeItem('kiosk_device_token')
})

describe('KioskPage', () => {
  it('renders the setup screen when no device token is stored', () => {
    render(<KioskPage />)
    expect(screen.getByText('Kiosk setup')).toBeInTheDocument()
    expect(screen.getByLabelText('Device code')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('validates the pasted token via /api/kiosk/roster and shows the name grid', async () => {
    api.post.mockResolvedValueOnce(rosterResponse)
    render(<KioskPage />)

    fireEvent.change(screen.getByLabelText('Device code'), { target: { value: 'ksk_test123' } })
    fireEvent.click(screen.getByText('Set up device'))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/kiosk/roster', { token: 'ksk_test123' })
    )
    expect(await screen.findByText('Tap your name')).toBeInTheDocument()
    expect(screen.getByText('Ada')).toBeInTheDocument()
    expect(screen.getByText('Grace')).toBeInTheDocument()
    expect(screen.getByText('Gryffin Learning Center')).toBeInTheDocument()
    expect(localStorage.getItem('kiosk_device_token')).toBe('ksk_test123')
  })

  it('loads the roster automatically from a remembered token', async () => {
    localStorage.setItem('kiosk_device_token', 'ksk_saved')
    api.post.mockResolvedValueOnce(rosterResponse)
    render(<KioskPage />)

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/kiosk/roster', { token: 'ksk_saved' })
    )
    expect(await screen.findByText('Tap your name')).toBeInTheDocument()
  })

  it('shows an error and stays on setup when the token is rejected', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 401 } })
    render(<KioskPage />)

    fireEvent.change(screen.getByLabelText('Device code'), { target: { value: 'bad' } })
    fireEvent.click(screen.getByText('Set up device'))

    expect(await screen.findByText('That device code did not work.')).toBeInTheDocument()
    expect(screen.getByText('Kiosk setup')).toBeInTheDocument()
  })

  it('logs a student in when their name is tapped', async () => {
    api.post
      .mockResolvedValueOnce(rosterResponse) // roster
      .mockResolvedValueOnce({ data: { success: true, user_id: 's1', first_name: 'Ada' } }) // login
    api.get.mockResolvedValue({ data: { active_quests: [] } }) // student session dashboard

    render(<KioskPage />)
    fireEvent.change(screen.getByLabelText('Device code'), { target: { value: 'ksk_test123' } })
    fireEvent.click(screen.getByText('Set up device'))

    fireEvent.click(await screen.findByText('Ada'))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/kiosk/login', { token: 'ksk_test123', student_id: 's1' })
    )
    expect(await screen.findByText('Hi, Ada!')).toBeInTheDocument()
    // The roster said nothing about points: the session never asks.
    expect(api.get).not.toHaveBeenCalledWith('/api/sis/points/mine')
  })

  it('where the roster says the school runs points, the session asks about helpers', async () => {
    // Ticket 0f401a62: a points helper gets "Give points" on the tablet.
    api.post
      .mockResolvedValueOnce({ data: { ...rosterResponse.data, points: true } })
      .mockResolvedValueOnce({ data: { success: true, user_id: 's1', first_name: 'Ada' } })
    api.get.mockImplementation((url) => Promise.resolve(url === '/api/sis/points/mine'
      ? { data: { success: true, students: [{ student_id: 's1', is_helper: true }] } }
      : { data: { active_quests: [] } }))

    render(<KioskPage />)
    fireEvent.change(screen.getByLabelText('Device code'), { target: { value: 'ksk_test123' } })
    fireEvent.click(screen.getByText('Set up device'))
    fireEvent.click(await screen.findByText('Ada'))
    expect(await screen.findByText('Give points')).toBeInTheDocument()
  })
})
