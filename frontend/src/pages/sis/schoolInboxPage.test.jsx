import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The combined /inbox (messaging + inbox merged, 2026-08-31).
 *
 * The front office reads the shared school inbox and replies as the school;
 * a teacher reads their OWN threads (/api/messages) and replies as themself.
 * The Announcements tab holds the group composer that used to be /messaging.
 */

const render = (ui, { route = '/inbox' } = {}) =>
  rtlRender(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

let authUser = { id: 'me-1', role: 'org_admin' }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: authUser }) }))

vi.mock('./useSisOrg', async (importOriginal) => ({
  ...(await importOriginal()),
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, loading: false, activeOrg: null }),
}))

// The composer drags in TipTap; the tab only has to mount it.
vi.mock('../../components/sis/AnnouncementComposer', () => ({
  default: () => <div>composer-stub</div>,
}))
vi.mock('../../components/communication/MessageParts', () => ({
  AttachmentList: () => null,
}))

const { api, state } = vi.hoisted(() => {
  const state = {
    schoolConvos: [], schoolMessages: [], myConvos: [], myMessages: [],
  }
  const apiData = (url) => {
    if (url.includes('/api/school-inbox/conversations/')) {
      return { data: { data: { messages: state.schoolMessages, inbox_user_id: 'inbox-1' } } }
    }
    if (url.includes('/api/school-inbox/conversations')) {
      return { data: { data: {
        conversations: state.schoolConvos, inbox_user_id: 'inbox-1',
        organization: { name: 'Hearthwood' },
      } } }
    }
    if (url.includes('/api/messages/conversations/')) {
      return { data: { data: { messages: state.myMessages } } }
    }
    if (url.includes('/api/messages/conversations')) {
      return { data: { data: { conversations: state.myConvos, total: state.myConvos.length } } }
    }
    return { data: {} }
  }
  return {
    state,
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn((url) => {
        if (url === '/api/messages/attachments') {
          return Promise.resolve({ data: { data: { attachment: {
            url: 'stored-url', display_url: 'signed-url',
            type: 'file', name: 'permission.pdf', size: 1,
          } } } })
        }
        return Promise.resolve({ data: { success: true } })
      }),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import SchoolInboxPage from './SchoolInboxPage'

const convo = (n, name) => ({
  id: `c${n}`,
  other_user: { id: `u${n}`, first_name: name, last_name: 'Family' },
  unread_count: 0,
  last_message_at: '2026-08-30T12:00:00Z',
  last_message_preview: `hello ${n}`,
})

beforeEach(() => {
  // jsdom has no scrollIntoView; the thread view calls it after messages load.
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
  authUser = { id: 'me-1', role: 'org_admin' }
  state.schoolConvos = []
  state.schoolMessages = []
  state.myConvos = []
  state.myMessages = []
  vi.clearAllMocks()
})

describe('SchoolInboxPage — combined inbox', () => {
  it('reads the shared school inbox for the front office', async () => {
    state.schoolConvos = [convo(1, 'Greta')]
    render(<SchoolInboxPage />)
    expect(await screen.findByText('Greta Family')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/school-inbox/conversations')
    expect(api.get).not.toHaveBeenCalledWith('/api/messages/conversations')
  })

  it("reads the teacher's own threads for an advisor, and marks one read on open", async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.myConvos = [convo(2, 'Pat')]
    state.myMessages = [
      { id: 'm1', sender_id: 'u2', message_content: 'Question about homework', created_at: '2026-08-30T12:00:00Z' },
    ]
    render(<SchoolInboxPage />)
    expect(await screen.findByText('Pat Family')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/messages/conversations')
    expect(api.get).not.toHaveBeenCalledWith('/api/school-inbox/conversations')

    fireEvent.click(screen.getByText('Pat Family'))
    expect(await screen.findByText('Question about homework')).toBeInTheDocument()
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/messages/conversations/c2/read', {}))
  })

  it('replies through the matching send endpoint for a teacher', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.myConvos = [convo(2, 'Pat')]
    render(<SchoolInboxPage />)
    fireEvent.click(await screen.findByText('Pat Family'))
    fireEvent.change(await screen.findByPlaceholderText('Write a reply...'),
      { target: { value: 'On it' } })
    fireEvent.click(screen.getByLabelText('Send reply'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/messages/conversations/u2/send',
        { content: 'On it', attachments: [] }))
  })

  it('uploads an attachment and sends it with the reply', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.myConvos = [convo(2, 'Pat')]
    render(<SchoolInboxPage />)
    fireEvent.click(await screen.findByText('Pat Family'))
    const file = new File(['x'], 'permission.pdf', { type: 'application/pdf' })
    fireEvent.change(await screen.findByLabelText('Attach files'), { target: { files: [file] } })
    expect(await screen.findByText('permission.pdf')).toBeInTheDocument()

    // No text needed — an attachment alone is a sendable message.
    fireEvent.click(screen.getByLabelText('Send reply'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/messages/conversations/u2/send', {
        content: '',
        // The durable pointer, never the signed display twin.
        attachments: [{ url: 'stored-url', type: 'file', name: 'permission.pdf', size: 1 }],
      }))
  })

  it('renders a URL in a message as a short clickable link', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.myConvos = [convo(2, 'Pat')]
    state.myMessages = [{
      id: 'm1', sender_id: 'u2', created_at: '2026-08-30T12:00:00Z',
      message_content: 'Form is at https://docs.acme.com/form thanks!',
    }]
    render(<SchoolInboxPage />)
    fireEvent.click(await screen.findByText('Pat Family'))
    const link = await screen.findByRole('link', { name: 'docs.acme.com' })
    expect(link).toHaveAttribute('href', 'https://docs.acme.com/form')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('shows the announcements composer on its tab, for teachers too', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    render(<SchoolInboxPage />, { route: '/inbox?tab=announcements' })
    expect(await screen.findByText('composer-stub')).toBeInTheDocument()
    // And the tabs switch back to threads.
    fireEvent.click(screen.getByRole('button', { name: /^Messages/ }))
    expect(screen.queryByText('composer-stub')).not.toBeInTheDocument()
  })
})
