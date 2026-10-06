import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import InviteSecondParentsModal from './InviteSecondParentsModal'
import AllClassChatsPanel from './AllClassChatsPanel'

const { toast } = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const wrap = (ui) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {ui}
  </QueryClientProvider>)

beforeEach(() => { vi.clearAllMocks() })

describe('InviteSecondParentsModal (ticket d11e5168)', () => {
  const CANDIDATES = [
    { key: 'hh-l|andrew@x.test', name: 'Andrew Larson', email: 'andrew@x.test', household_name: 'Larson Family',
      students: [{ id: 'a', name: 'Ada Larson' }], account: 'new', invitable: true, reason: null },
    { key: 'hh-m|sam@y.test', name: 'Sam Moss', email: 'sam@y.test', household_name: 'Moss Family',
      students: [], account: 'other_school', invitable: false, reason: 'An Optio account outside this school uses this email.' },
  ]

  it('ticks every invitable row by default and posts only their keys', async () => {
    api.get.mockResolvedValue({ data: { candidates: CANDIDATES } })
    api.post.mockResolvedValue({ data: { results: [{ key: 'hh-l|andrew@x.test', status: 'invited', invite_sent: true }],
      counts: { invited: 1 } } })
    wrap(<InviteSecondParentsModal orgId="org-1" onClose={vi.fn()} onDone={vi.fn()} />)
    expect(await screen.findByText('Andrew Larson')).toBeInTheDocument()
    expect(screen.getByLabelText('Invite Sam Moss')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Invite selected \(1\)/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/second-parent-invites?organization_id=org-1', { keys: ['hh-l|andrew@x.test'] }))
    expect(await screen.findByText('Invited')).toBeInTheDocument()
  })
})

describe('AllClassChatsPanel (ticket bbb477db)', () => {
  it('lists the school class chats and opening one joins then hands the group on', async () => {
    api.get.mockResolvedValue({ data: { chats: [
      { id: 'g1', name: 'Art Parent Chat', class_name: 'Art', kind: 'parent', last_message_at: null },
    ], total: 1 } })
    api.post.mockResolvedValue({ data: { group: { id: 'g1', name: 'Art Parent Chat' } } })
    const onOpened = vi.fn()
    wrap(<AllClassChatsPanel orgId={null} onOpened={onOpened} />)
    fireEvent.click(await screen.findByText('Art'))
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith({ id: 'g1', name: 'Art Parent Chat' }))
    expect(api.post).toHaveBeenCalledWith('/api/sis/messaging/class-chats/g1/open', {})
    expect(api.get.mock.calls[0][0]).toContain('/api/sis/messaging/class-chats?page=1')
  })
})
