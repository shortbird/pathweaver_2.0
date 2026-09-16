/**
 * FriendsOffNudge -- the one line that brings the Friends switch to the
 * family dashboard. Shows only when a parent can turn it on; the button
 * opens the explainer, and the switch is at the bottom of that.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
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

  it('explains Friends before the switch, and the switch turns it on', async () => {
    mount({ enabled: false, origin: 'none', who_can_enable: 'parent' })
    await userEvent.click(await screen.findByRole('button', { name: /turn on friends/i }))

    // Nothing is written by the first click: the explainer opens instead.
    expect(api.put).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/how friends works/i)
    expect(dialog).toHaveTextContent(/never an email address/i)
    expect(dialog).toHaveTextContent(/turning friends off removes every friend robin has/i)
    expect(dialog).toHaveTextContent(/your consent/i)

    await userEvent.click(within(dialog).getByRole('button', { name: /^turn on friends$/i }))
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/connections/children/s1/policy', { enabled: true })
    })
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/friends is on for robin/i))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('has no separate rules link: the explainer is the rules', async () => {
    mount({ enabled: false, origin: 'none', who_can_enable: 'parent' })
    await screen.findByRole('button', { name: /turn on friends/i })
    expect(screen.queryByRole('button', { name: /rules/i })).toBeNull()
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
