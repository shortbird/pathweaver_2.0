/**
 * FriendsOffNudge -- the one line that brings the Friends switch to the
 * family dashboard. Shows only when a parent can turn it on; one tap does.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '../../services/api'
import FriendsOffNudge from './FriendsOffNudge'

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }))
const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))

const mount = (policy, canSet = true) => {
  api.get.mockResolvedValue({ data: { data: { policy, can_set: canSet } } })
  api.put.mockResolvedValue({ data: { data: { policy: { ...policy, enabled: true }, revoked_count: 0 } } })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <FriendsOffNudge childId="s1" childFirstName="Robin" onOpenSettings={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('FriendsOffNudge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('turns Friends on with one tap', async () => {
    mount({ enabled: false, origin: 'none', who_can_enable: 'parent' })
    await userEvent.click(await screen.findByRole('button', { name: /turn on friends/i }))
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/connections/children/s1/policy', { enabled: true })
    })
    expect(toast.success).toHaveBeenCalledWith('Friends is on for Robin.')
  })

  it('renders nothing once Friends is on', async () => {
    mount({ enabled: true, origin: 'child' })
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /turn on friends/i })).toBeNull()
  })

  it('renders nothing for an adult who may not set it, or a school with the module off', async () => {
    mount({ enabled: false, origin: 'none' }, false)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /turn on friends/i })).toBeNull()
    vi.clearAllMocks()
    mount({ enabled: false, origin: 'module_off' })
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /turn on friends/i })).toBeNull()
  })
})
