/**
 * FriendsExplainerModal -- the explanation, then the switch.
 *
 * What matters: a parent whose child already has Friends on is not shown a
 * switch that would re-consent, but is pointed at the settings; a parent
 * who may not set it gets the explanation and no switch at all.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '../../services/api'
import FriendsExplainerModal from './FriendsExplainerModal'

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }))
const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))

const mount = (policy, { canSet = true, onOpenSettings = vi.fn(), onClose = vi.fn() } = {}) => {
  api.get.mockResolvedValue({ data: { data: { policy, can_set: canSet } } })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <FriendsExplainerModal
        childId="s1"
        childFirstName="Robin"
        isOpen
        onClose={onClose}
        onOpenSettings={onOpenSettings}
      />
    </QueryClientProvider>,
  )
  return { onOpenSettings, onClose }
}

describe('FriendsExplainerModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('offers the switch when Friends is off and this adult may set it', async () => {
    mount({ enabled: false, origin: 'none', who_can_enable: 'parent' })
    expect(await screen.findByRole('button', { name: /^turn on friends$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /not now/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /friends settings/i })).toBeNull()
  })

  it('points at the settings instead when Friends is already on', async () => {
    const { onOpenSettings, onClose } = mount({ enabled: true, origin: 'child' })
    const settings = await screen.findByRole('button', { name: /friends settings/i })
    expect(screen.queryByRole('button', { name: /^turn on friends$/i })).toBeNull()
    expect(screen.getByText(/friends is on for robin/i)).toBeInTheDocument()

    await userEvent.click(settings)
    expect(onClose).toHaveBeenCalled()
    expect(onOpenSettings).toHaveBeenCalled()
  })

  it('shows no switch to an adult who may not set it', async () => {
    mount({ enabled: false, origin: 'none' }, { canSet: false })
    expect(await screen.findByRole('button', { name: /^close$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^turn on friends$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /friends settings/i })).toBeNull()
  })
})
