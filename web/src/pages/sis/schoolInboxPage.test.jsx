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
    schoolConvos: [], schoolMessages: [], myConvos: [], myMessages: [], roster: [],
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
    if (url.includes('/api/sis/roster')) return { data: { roster: state.roster } }
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
  state.roster = []
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

  // iCreate, 2026-09-02: the inbox could only ever REPLY, so reaching one
  // family meant an announcement to the whole school or a phone call.
  it('starts a thread with somebody who has never written in', async () => {
    state.roster = [
      { student_id: 'u9', name: 'Ada Bennett', first_name: 'Ada', last_name: 'Bennett', role: 'parent' },
      { student_id: 'inbox-1', name: 'Hearthwood', role: null },
    ]
    render(<SchoolInboxPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'New message' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/roster'))
    fireEvent.focus(await screen.findByPlaceholderText('Search families and staff…'))
    fireEvent.change(screen.getByPlaceholderText('Search families and staff…'),
      { target: { value: 'Ada' } })
    fireEvent.mouseDown(await screen.findByRole('button', { name: /Ada Bennett \(parent\)/ }))

    expect(await screen.findByText(/Write the first message to Ada Bennett/)).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Reply as Hearthwood...'),
      { target: { value: 'Your spot is ready' } })
    fireEvent.click(screen.getByLabelText('Send reply'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/school-inbox/conversations/u9/send',
        { content: 'Your spot is ready', attachments: [] }))
  })

  it('offers no New message button to a teacher — the shared inbox is the office\'s', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    render(<SchoolInboxPage />)
    await screen.findByRole('button', { name: /^My messages/ })
    expect(screen.queryByRole('button', { name: 'New message' })).not.toBeInTheDocument()
  })

  it('shows the announcements composer on its tab, for teachers too', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    render(<SchoolInboxPage />, { route: '/inbox?tab=announcements' })
    expect(await screen.findByText('composer-stub')).toBeInTheDocument()
    // And the tabs switch back to threads.
    fireEvent.click(screen.getByRole('button', { name: /^My messages/ }))
    expect(screen.queryByText('composer-stub')).not.toBeInTheDocument()
  })

  // ── The personal inbox (2026-09-10) ────────────────────────────────────────
  //
  // Which thread source you saw used to be decided by your role: an admin got
  // the school inbox and nothing else. So an admin or coordinator who was
  // messaged personally -- as a colleague, or as a parent of their own child at
  // the school -- had nowhere in the console to read it. The notification
  // linked to the learning app and the console pretended the thread was not
  // there. It is a tab now.

  it('offers an admin both the school inbox and their own threads', async () => {
    authUser = { id: 'me-1', role: 'org_admin' }
    render(<SchoolInboxPage />)
    expect(await screen.findByRole('button', { name: /^Hearthwood/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^My messages/ })).toBeInTheDocument()
  })

  it('opens an admin on the school queue, which is the one they work', async () => {
    authUser = { id: 'me-1', role: 'org_admin' }
    state.schoolConvos = [{
      id: 'c-school', other_user: { id: 'parent-1', first_name: 'Dana', last_name: 'P' },
      last_message_preview: 'from a parent', unread_count: 0,
    }]
    render(<SchoolInboxPage />)
    expect(await screen.findByText('from a parent')).toBeInTheDocument()
  })

  it('shows an admin their own threads on the Mine tab', async () => {
    authUser = { id: 'me-1', role: 'org_admin' }
    state.myConvos = [{
      id: 'c-mine', other_user: { id: 'teacher-1', first_name: 'Ada', last_name: 'L' },
      last_message_preview: 'just between us', unread_count: 0,
    }]
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine' })
    expect(await screen.findByText('just between us')).toBeInTheDocument()
  })

  it('replies as the school only on the school tab', async () => {
    authUser = { id: 'me-1', role: 'org_admin' }
    state.schoolConvos = [{
      id: 'c-school', other_user: { id: 'parent-1', first_name: 'Dana', last_name: 'P' },
      last_message_preview: 'hi', unread_count: 0,
    }]
    render(<SchoolInboxPage />)
    fireEvent.click(await screen.findByText('hi'))
    expect(await screen.findByPlaceholderText(/Reply as Hearthwood/)).toBeInTheDocument()
  })

  it('replies as yourself on the Mine tab', async () => {
    authUser = { id: 'me-1', role: 'org_admin' }
    state.myConvos = [{
      id: 'c-mine', other_user: { id: 'teacher-1', first_name: 'Ada', last_name: 'L' },
      last_message_preview: 'hi', unread_count: 0,
    }]
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine' })
    fireEvent.click(await screen.findByText('hi'))
    expect(await screen.findByPlaceholderText('Write a reply...')).toBeInTheDocument()
  })

  it('sends an admin reply on the Mine tab through their own account', async () => {
    authUser = { id: 'me-1', role: 'org_admin' }
    state.myConvos = [{
      id: 'c-mine', other_user: { id: 'teacher-1', first_name: 'Ada', last_name: 'L' },
      last_message_preview: 'hi', unread_count: 0,
    }]
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine' })
    fireEvent.click(await screen.findByText('hi'))
    const box = await screen.findByPlaceholderText('Write a reply...')
    fireEvent.change(box, { target: { value: 'on my way' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/messages/conversations/teacher-1/send', expect.anything())
    })
  })

  it('gives a teacher no school tab — they have no school inbox to read', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    render(<SchoolInboxPage />)
    await screen.findByRole('button', { name: /^My messages/ })
    expect(screen.queryByRole('button', { name: /^Hearthwood/ })).not.toBeInTheDocument()
  })

  it('opens a thread with the person named by ?to=', async () => {
    authUser = { id: 'me-1', role: 'org_admin' }
    state.myConvos = [{
      id: 'c-mine', other_user: { id: 'teacher-1', first_name: 'Ada', last_name: 'L' },
      last_message_preview: 'hi', unread_count: 0,
    }]
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine&to=teacher-1' })
    expect(await screen.findByPlaceholderText('Write a reply...')).toBeInTheDocument()
  })
})
