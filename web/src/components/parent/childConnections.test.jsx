import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ChildConnections from './ChildConnections'

/**
 * Peer-connection approvals on the child's card. The rows come from the one
 * family-wide read; each card shows only its own child's, and the consent
 * text is the same one the approvals page states.
 */

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../services/api'

const ROWS = {
  pending: [
    { id: 'a1', connection_id: 'c1', approver_kind: 'parent', child: { id: 'romney', display_name: 'Romney' }, peer: { id: 'p1', display_name: 'Linus' } },
    { id: 'a2', connection_id: 'c2', approver_kind: 'parent', child: { id: 'sib', display_name: 'Sib' }, peer: { id: 'p2', display_name: 'Ada' } },
  ],
  approved: [
    { connection_id: 'c9', approver_kind: 'parent', child: { id: 'romney', display_name: 'Romney' }, peer: { id: 'p3', display_name: 'Grace' }, connected_since: '2026-08-02T00:00:00Z' },
  ],
}

function renderFor(childId) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ChildConnections childId={childId} />
    </QueryClientProvider>
  )
}

describe('ChildConnections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { data: ROWS } })
    api.post.mockResolvedValue({ data: { data: { id: 'c1', status: 'active' } } })
  })

  it("shows only this child's requests and connections, with the consent spelled out", async () => {
    renderFor('romney')
    expect(await screen.findByText('Romney wants to connect with Linus')).toBeInTheDocument()
    expect(screen.getByText(/see the other's portfolio and work/i)).toBeInTheDocument()
    expect(screen.getByText(/undo this at any time/i)).toBeInTheDocument()
    expect(screen.getByText('Connected with Grace')).toBeInTheDocument()
    // Sib's request belongs on Sib's card.
    expect(screen.queryByText(/Sib wants to connect/)).not.toBeInTheDocument()
  })

  it('renders nothing for a child with no requests and no connections', async () => {
    api.get.mockResolvedValue({ data: { data: { pending: [], approved: [] } } })
    const { container } = renderFor('romney')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/connections/approvals'))
    expect(container).toBeEmptyDOMElement()
  })

  it('posts the decision for the right connection', async () => {
    renderFor('romney')
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/connections/c1/approve', { approve: true })
    })
    expect(toast.success).toHaveBeenCalledWith('Approved.')
  })

  it('lets the parent end a connection from the card', async () => {
    renderFor('romney')
    await userEvent.click(await screen.findByRole('button', { name: 'End connection' }))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/connections/c9/revoke', {})
    })
  })
})
