import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import InboxUnreadBadge from './InboxUnreadBadge'

/**
 * The console had no unread signal anywhere, so the only way to find out a
 * parent had written to the school — or that a colleague had written to you —
 * was to open /inbox and look. Which is exactly what nobody does when they are
 * not expecting anything (iCreate, 2026-09-10).
 *
 * The count has to cover BOTH sources the page can show. A badge that counted
 * one of them would be worse than none: you would learn to trust it, and then
 * miss everything on the other tab.
 */

let authUser = { id: 'me-1', role: 'org_admin' }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: authUser }) }))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const withClient = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const answers = ({ mine = 0, school = 0, mineFails = false, schoolFails = false } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.includes('/api/school-inbox/unread-count')) {
      return schoolFails ? Promise.reject(new Error('nope'))
        : Promise.resolve({ data: { data: { unread_count: school } } })
    }
    if (url.includes('/api/messages/unread-count')) {
      return mineFails ? Promise.reject(new Error('nope'))
        : Promise.resolve({ data: { data: { unread_count: mine } } })
    }
    return Promise.resolve({ data: {} })
  })
}

describe('InboxUnreadBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authUser = { id: 'me-1', role: 'org_admin' }
  })

  it('adds the school inbox and your own threads together', async () => {
    answers({ mine: 2, school: 3 })
    withClient(<InboxUnreadBadge orgId="org-1" />)
    expect(await screen.findByText('5')).toBeInTheDocument()
  })

  it('shows nothing when everything is read', async () => {
    answers({ mine: 0, school: 0 })
    const { container } = withClient(<InboxUnreadBadge orgId="org-1" />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })

  it('caps the display so a long number cannot break the nav row', async () => {
    answers({ mine: 40, school: 2 })
    withClient(<InboxUnreadBadge orgId="org-1" />)
    expect(await screen.findByText('9+')).toBeInTheDocument()
  })

  it('does not ask a teacher for the school inbox', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    answers({ mine: 1 })
    withClient(<InboxUnreadBadge orgId="org-1" />)
    expect(await screen.findByText('1')).toBeInTheDocument()
    const urls = api.get.mock.calls.map((c) => c[0])
    expect(urls.some((u) => u.includes('school-inbox'))).toBe(false)
  })

  it('still counts the half that answered when the other fails', async () => {
    answers({ mine: 4, schoolFails: true })
    withClient(<InboxUnreadBadge orgId="org-1" />)
    expect(await screen.findByText('4')).toBeInTheDocument()
  })

  it('renders nothing rather than a zero when both fail', async () => {
    answers({ mineFails: true, schoolFails: true })
    const { container } = withClient(<InboxUnreadBadge orgId="org-1" />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })

  it('waits for a superadmin to pick an org before counting anything', async () => {
    answers({ mine: 3 })
    withClient(<InboxUnreadBadge orgId={null} isSuperadmin />)
    await waitFor(() => expect(api.get).not.toHaveBeenCalled())
  })

  it('names the count for a screen reader', async () => {
    answers({ mine: 1 })
    withClient(<InboxUnreadBadge orgId="org-1" />)
    expect(await screen.findByLabelText('1 unread message')).toBeInTheDocument()
  })
})
