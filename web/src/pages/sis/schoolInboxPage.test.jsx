import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The combined /inbox (messaging + inbox merged, 2026-08-31).
 *
 * The front office reads the shared school inbox and replies as the school;
 * a teacher reads their OWN threads (/api/messages) and replies as themself,
 * plus any school thread the office handed them with a task. Announcements
 * moved to the Community page (2026-09-23).
 */

// The page reads through the messenger's React Query hooks; a fresh client
// per render keeps one test's cache out of the next.
const render = (ui, { route = '/inbox' } = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

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

// Realtime needs a Supabase socket; the hook is covered by its own tests.
vi.mock('../../hooks/api/useMessagingRealtime', () => ({
  default: vi.fn(),
  useMessagingRealtime: vi.fn(),
}))
const { api, state } = vi.hoisted(() => {
  const state = {
    schoolConvos: [], schoolMessages: [], myConvos: [], myMessages: [], roster: [],
    groups: [], schoolGroups: [], groupMessages: [],
    audience: null, granted: null, sends: [], sendDetail: null, staff: [], openedBy: [],
  }
  const apiData = (url) => {
    // Group threads: the school's (School tab) and the caller's own (Mine).
    if (url === '/api/school-inbox/groups') {
      return { data: { data: { groups: state.schoolGroups, inbox_user_id: 'inbox-1' } } }
    }
    if (/^\/api\/(school-inbox\/)?groups\/[^/]+\/messages$/.test(url)) {
      return { data: { data: { messages: state.groupMessages } } }
    }
    if (/^\/api\/(school-inbox\/)?groups\/[^/]+$/.test(url)) {
      return { data: { data: { id: url.split('/').pop(), members: [] } } }
    }
    if (url.includes('/api/school-inbox/conversations/')) {
      return { data: { data: { messages: state.schoolMessages, inbox_user_id: 'inbox-1',
        opened_by: state.openedBy } } }
    }
    if (url.startsWith('/api/school-inbox/granted')) {
      return { data: { data: state.granted || { conversations: [], groups: [] } } }
    }
    if (url.startsWith('/api/sis/messaging/audience')) return { data: state.audience || {} }
    if (url.startsWith('/api/sis/messaging/recipients')) return { data: { people: state.staff } }
    if (/^\/api\/sis\/messaging\/sends\/[^/?]+/.test(url)) return { data: { send: state.sendDetail } }
    if (url.startsWith('/api/sis/messaging/sends')) return { data: { sends: state.sends } }
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
    if (url === '/api/groups') return { data: { data: state.groups } }
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
  state.groups = []
  state.schoolGroups = []
  state.groupMessages = []
  state.audience = null
  state.granted = null
  state.sends = []
  state.sendDetail = null
  state.staff = []
  state.openedBy = []
  vi.clearAllMocks()
})

describe('SchoolInboxPage — combined inbox', () => {
  it('reads the shared school inbox for the front office', async () => {
    state.schoolConvos = [convo(1, 'Greta')]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
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
    fireEvent.click(screen.getByLabelText('Send message'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/messages/conversations/u2/send',
        { content: 'On it' }))
  })

  it('uploads an attachment and sends it with the reply', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.myConvos = [convo(2, 'Pat')]
    render(<SchoolInboxPage />)
    fireEvent.click(await screen.findByText('Pat Family'))
    const file = new File(['x'], 'permission.pdf', { type: 'application/pdf' })
    await screen.findByPlaceholderText('Write a reply...')
    fireEvent.change(screen.getByTestId('message-file-input'), { target: { files: [file] } })
    expect(await screen.findByText('permission.pdf')).toBeInTheDocument()

    // No text needed — an attachment alone is a sendable message.
    fireEvent.click(screen.getByLabelText('Send message'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/messages/conversations/u2/send', {
        content: '',
        // The durable pointer, never the signed display twin.
        attachments: [{ url: 'stored-url', type: 'file', name: 'permission.pdf', size: 1 }],
      }))
  })

  it('renders a URL in a message as a clickable link', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.myConvos = [convo(2, 'Pat')]
    state.myMessages = [{
      id: 'm1', sender_id: 'u2', created_at: '2026-08-30T12:00:00Z',
      message_content: 'Form is at https://docs.acme.com/form thanks!',
    }]
    render(<SchoolInboxPage />)
    fireEvent.click(await screen.findByText('Pat Family'))
    const link = await screen.findByRole('link', { name: 'https://docs.acme.com/form' })
    expect(link).toHaveAttribute('href', 'https://docs.acme.com/form')
    expect(link).toHaveAttribute('target', '_blank')
  })

  // One Compose (iCreate, 2026-09-23, bf8b754d / 8ee000b6) replaced "New
  // message" (one person) and "Message a group" (staff OR families).
  it('opens the one Compose from the school tab, sending as the school', async () => {
    state.audience = {
      people: [{ id: 'u9', name: 'Ada Bennett', kinds: ['family'], staff_kinds: [], child_ids: [], children: ['Cy'] }],
      classes: [], presets: [], without_birthdate: 0,
    }
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    fireEvent.click(await screen.findByRole('button', { name: 'Compose' }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/messaging/audience'))
    fireEvent.click(await within(dialog).findByLabelText('Select Ada Bennett'))
    fireEvent.change(within(dialog).getByLabelText('Message'), { target: { value: 'Your spot is ready' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/messaging/send',
      expect.objectContaining({ recipient_ids: ['u9'], as_school: true, push: true, email: false,
        body: 'Your spot is ready' })))
    expect(screen.queryByRole('button', { name: 'New message' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Message a group' })).toBeNull()
  })

  // iCreate teacher training, 2026-09-25: the console gave a teacher no way to
  // start a message. Theirs comes from them, never the school, with no email.
  it('gives a teacher Compose, sending as themselves with no email option', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.audience = {
      people: [{ id: 'u9', name: 'Ada Bennett', kinds: ['family'], staff_kinds: [], child_ids: [], children: ['Cy'] }],
      classes: [], presets: [], without_birthdate: 0,
    }
    render(<SchoolInboxPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Compose' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(await within(dialog).findByLabelText('Select Ada Bennett'))
    expect(within(dialog).queryByText('Email')).toBeNull()
    fireEvent.change(within(dialog).getByLabelText('Message'), { target: { value: 'See you Tuesday' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/messaging/send',
      expect.objectContaining({ recipient_ids: ['u9'], as_school: false, email: false })))
  })

  // 9a335881: "announcements should only be in the community page, not in
  // /inbox". The tab is gone; an old link still lands on the board.
  it('has no Announcements tab, and forwards the old link to Community', async () => {
    render(
      <Routes>
        <Route path="/inbox" element={<SchoolInboxPage />} />
        <Route path="/community" element={<div>community-page</div>} />
      </Routes>,
      { route: '/inbox?tab=announcements' },
    )
    expect(await screen.findByText('community-page')).toBeInTheDocument()
  })

  it('shows no Announcements tab on the inbox', async () => {
    render(<SchoolInboxPage />)
    await screen.findByRole('tab', { name: /^My messages/ })
    expect(screen.queryByRole('tab', { name: /Announcements/ })).toBeNull()
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
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    expect(await screen.findByRole('tab', { name: /^Hearthwood/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^My messages/ })).toBeInTheDocument()
  })

  // iCreate, 2026-09-25: opening on the shared inbox, a coordinator composed
  // to a colleague "just to Molly" as the school, for the whole office to read.
  it('opens an admin on their own threads; the school inbox is one click away', async () => {
    authUser = { id: 'me-1', role: 'org_admin' }
    state.myConvos = [{
      id: 'c-mine', other_user: { id: 'teacher-1', first_name: 'Ada', last_name: 'L' },
      last_message_preview: 'from a colleague', unread_count: 0,
      last_message_at: '2026-08-30T12:00:00Z', last_message_sender_id: 'teacher-1',
    }]
    render(<SchoolInboxPage />)
    expect(await screen.findByText('from a colleague')).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalledWith('/api/school-inbox/conversations')
    // The name comes from the org once it is known; the tab is there either way.
    expect(screen.getByRole('tab', { name: /inbox/ })).toBeInTheDocument()
  })

  it('keeps a bare ?conversation= link on the school tab once it is opened', async () => {
    state.schoolConvos = [convo(1, 'Greta')]
    state.schoolMessages = [
      { id: 'm1', sender_id: 'inbox-1', message_content: 'Field trip Friday', created_at: '2026-08-30T12:00:00Z' },
    ]
    render(<SchoolInboxPage />, { route: '/inbox?conversation=c1' })
    expect(await screen.findByText('Field trip Friday')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^Hearthwood inbox/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows an admin their own threads on the Mine tab', async () => {
    authUser = { id: 'me-1', role: 'org_admin' }
    state.myConvos = [{
      id: 'c-mine', other_user: { id: 'teacher-1', first_name: 'Ada', last_name: 'L' },
      last_message_preview: 'just between us', unread_count: 0,
      last_message_at: '2026-08-30T12:00:00Z', last_message_sender_id: 'teacher-1',
    }]
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine' })
    expect(await screen.findByText('just between us')).toBeInTheDocument()
  })

  it('replies as the school only on the school tab', async () => {
    authUser = { id: 'me-1', role: 'org_admin' }
    state.schoolConvos = [{
      id: 'c-school', other_user: { id: 'parent-1', first_name: 'Dana', last_name: 'P' },
      last_message_preview: 'hi', unread_count: 0,
      last_message_at: '2026-08-30T12:00:00Z', last_message_sender_id: 'parent-1',
    }]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    fireEvent.click(await screen.findByText('hi'))
    expect(await screen.findByPlaceholderText(/Reply as Hearthwood/)).toBeInTheDocument()
  })

  it('replies as yourself on the Mine tab', async () => {
    authUser = { id: 'me-1', role: 'org_admin' }
    state.myConvos = [{
      id: 'c-mine', other_user: { id: 'teacher-1', first_name: 'Ada', last_name: 'L' },
      last_message_preview: 'hi', unread_count: 0,
      last_message_at: '2026-08-30T12:00:00Z', last_message_sender_id: 'teacher-1',
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
      last_message_at: '2026-08-30T12:00:00Z', last_message_sender_id: 'teacher-1',
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
    // One tab is no tab bar at all: My messages is the page.
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/messages/conversations'))
    expect(screen.queryByRole('tab', { name: /^Hearthwood/ })).not.toBeInTheDocument()
  })

  // OPTIO-WEB-3 / OPTIO-BACKEND-8T: 45 staff in two weeks. A thread open on the
  // School tab was re-requested through /api/messages the instant the tab
  // changed to Mine -- a school-inbox thread the caller is not a participant
  // of -- because the effect-based reset ran in the same commit as the thread
  // loader, not before it.
  it('does not ask the new tab for the thread that was open on the old one', async () => {
    authUser = { id: 'me-1', role: 'org_admin' }
    state.schoolConvos = [{
      id: 'c-school', other_user: { id: 'parent-1', first_name: 'Dana', last_name: 'P' },
      last_message_preview: 'from a parent', unread_count: 0,
      last_message_at: '2026-08-30T12:00:00Z', last_message_sender_id: 'parent-1',
    }]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    fireEvent.click(await screen.findByText('from a parent'))
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/school-inbox/conversations/c-school')
    })

    fireEvent.click(screen.getByRole('tab', { name: /^My messages/ }))
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/messages/conversations')
    })
    expect(api.get).not.toHaveBeenCalledWith('/api/messages/conversations/c-school')
    expect(api.post).not.toHaveBeenCalledWith('/api/messages/conversations/c-school/read', {})
  })

  it('opens a thread with the person named by ?to=', async () => {
    authUser = { id: 'me-1', role: 'org_admin' }
    state.myConvos = [{
      id: 'c-mine', other_user: { id: 'teacher-1', first_name: 'Ada', last_name: 'L' },
      last_message_preview: 'hi', unread_count: 0,
      last_message_at: '2026-08-30T12:00:00Z', last_message_sender_id: 'teacher-1',
    }]
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine&to=teacher-1' })
    expect(await screen.findByPlaceholderText('Write a reply...')).toBeInTheDocument()
  })

  // The People page's Message button sends AS the school, so the family's reply
  // comes back here and not to the staff member who wrote it. ?conversation= is
  // how they get from "sent" to the thread it started.
  it('opens the thread named by ?conversation=', async () => {
    state.schoolConvos = [convo(1, 'Greta'), convo(2, 'Pat')]
    state.schoolMessages = [
      { id: 'm1', sender_id: 'inbox-1', message_content: 'Field trip Friday', created_at: '2026-08-30T12:00:00Z' },
    ]
    render(<SchoolInboxPage />, { route: '/inbox?conversation=c2' })
    expect(await screen.findByText('Field trip Friday')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/school-inbox/conversations/c2')
  })

  it('counts only threads the other side spoke last in, and skips empty ones', async () => {
    // iCreate saw "Needs a reply (22)" over a queue of 7: threads the school
    // had answered were miscounted, and six empty threads counted too (7ee545c4).
    state.schoolConvos = [
      { ...convo(1, 'Owed'), last_message_sender_id: 'u1' },
      { ...convo(2, 'Answered'), last_message_sender_id: 'inbox-1' },
      { ...convo(3, 'Empty'), last_message_at: null, last_message_preview: '' },
    ]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    expect(await screen.findByText('Owed Family')).toBeInTheDocument()
    expect(screen.getByText('Needs a reply (1)')).toBeInTheDocument()
    expect(screen.queryByText('Answered Family')).not.toBeInTheDocument()
    expect(screen.queryByText('Empty Family')).not.toBeInTheDocument()

    // The school spoke last: whether it answered or was ignored, it waits on them.
    fireEvent.click(screen.getByText('Waiting on them'))
    expect(screen.getByText('Answered Family')).toBeInTheDocument()
    expect(screen.queryByText('Owed Family')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('All'))
    expect(screen.getByText('Empty Family')).toBeInTheDocument()
  })

  it('marks a thread handled as the school, and a newer message reopens it', async () => {
    // Answered from the other inbox, in person, or not worth answering: the
    // office says so instead of the thread sitting under Needs a reply (5c858931).
    state.schoolConvos = [{ ...convo(1, 'Tiffany'), last_message_sender_id: 'u1' }]
    state.schoolMessages = [
      { id: 'm1', sender_id: 'u1', message_content: 'Hi Molly', created_at: '2026-08-30T12:00:00Z' },
    ]
    api.post.mockImplementation((url) => Promise.resolve(
      url.endsWith('/resolve')
        ? { data: { data: { resolved_at: '2026-08-31T09:00:00Z' } } }
        : { data: { success: true } }))
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    fireEvent.click(await screen.findByText('Tiffany Family'))
    fireEvent.click(await screen.findByText('Mark handled'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/school-inbox/conversations/c1/resolve', { resolved: true }))
    expect(await screen.findByText('Needs a reply')).toBeInTheDocument()
    expect(screen.getByText('Handled · Reopen')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Handled'))
    // Listed under Handled (and still open in the thread pane).
    expect(screen.getAllByText('Tiffany Family').length).toBe(2)
  })

  it('a handled thread the member wrote in again is owed a reply once more', async () => {
    state.schoolConvos = [{
      ...convo(1, 'Back'), last_message_sender_id: 'u1',
      resolved_at: '2026-08-29T12:00:00Z', last_message_at: '2026-08-30T12:00:00Z',
    }]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    expect(await screen.findByText('Back Family')).toBeInTheDocument()
    expect(screen.getByText('Needs a reply (1)')).toBeInTheDocument()
  })

  it('resolves through the personal endpoint on the Mine tab', async () => {
    authUser = { id: 'me-1', role: 'org_admin' }
    state.myConvos = [{ ...convo(4, 'Pat'), last_message_sender_id: 'u4' }]
    state.myMessages = [
      { id: 'm1', sender_id: 'u4', message_content: 'hey', created_at: '2026-08-30T12:00:00Z' },
    ]
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine' })
    fireEvent.click(await screen.findByText('Pat Family'))
    fireEvent.click(await screen.findByText('Mark handled'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/messages/conversations/c4/resolve', { resolved: true }))
  })

  it('says Seen under our last message once they have opened it', async () => {
    // "Don't even know if he saw it" (4ae1c6d1): read_at is the answer.
    state.schoolConvos = [{ ...convo(1, 'Tyler'), last_message_sender_id: 'inbox-1' }]
    state.schoolMessages = [
      { id: 'm1', sender_id: 'inbox-1', message_content: 'Please schedule a CLP',
        created_at: '2026-08-08T12:00:00Z', read_at: '2026-08-08T13:00:00Z' },
    ]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    fireEvent.click(screen.getByText('All'))
    fireEvent.click(await screen.findByText('Tyler Family'))
    // With the time it happened (9b46c748).
    expect(await screen.findByText(/· Seen /)).toBeInTheDocument()
  })

  it('ignores a ?conversation= that is not in this inbox', async () => {
    state.schoolConvos = [convo(1, 'Greta')]
    render(<SchoolInboxPage />, { route: '/inbox?conversation=not-mine' })
    await screen.findByText('Greta Family')
    expect(api.get).not.toHaveBeenCalledWith('/api/school-inbox/conversations/not-mine')
  })
})

// "I sent a group message here to 10 people, but it shows all 10 messages"
// (iCreate, 2026-09-22, 3a189384). The families half of that is by design --
// no family may see another family's reply. The staff half was not: sending to
// several staff at once makes a group_conversations row, this page only ever
// read the DM list, and the thread it had just sent was nowhere on the screen
// that sent it while the sidebar badge went on counting its unread.
describe('group threads sent from this page', () => {
  const group = (over = {}) => ({
    id: 'g1', name: 'Elementary teachers', audience: 'staff',
    member_count: 10, unread_count: 0,
    last_message_at: '2026-09-22T10:00:00Z', ...over,
  })

  it('lists a staff group thread on the teacher’s own tab', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.groups = [group()]
    render(<SchoolInboxPage />)
    expect(await screen.findByText('Elementary teachers')).toBeInTheDocument()
  })

  // 9284344e: the row linked to /messages?group=, a learning-app path, and
  // the console handed the reader to app.optioeducation.com without its
  // sidebar. It opens in this page's pane now, read as a member.
  it('opens a personal group in place on My messages, with no /messages link', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.groups = [group()]
    state.groupMessages = [
      { id: 'gm1', sender_id: 'u9', message_content: 'Room is sorted',
        created_at: '2026-09-22T10:00:00Z', sender: { id: 'u9', first_name: 'Ada' } },
    ]
    const { container } = render(<SchoolInboxPage />)
    const row = await screen.findByText('Elementary teachers')
    expect(row.closest('a')).toBeNull()
    expect(container.querySelector('a[href*="/messages"]')).toBeNull()

    fireEvent.click(row)
    expect(await screen.findByText('Room is sorted')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/groups/g1/messages')
    expect(api.get).not.toHaveBeenCalledWith('/api/school-inbox/groups/g1/messages')
  })

  it('shows the unread the sidebar badge was counting', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.groups = [group({ unread_count: 3 })]
    render(<SchoolInboxPage />)
    await screen.findByText('Elementary teachers')
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  // A class's family or student group is the class page's, not the office's.
  it('leaves family and student groups out', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.groups = [
      group({ id: 'g2', name: 'Art class families', audience: 'family' }),
      group({ id: 'g3', name: 'Art class students', audience: 'student' }),
    ]
    render(<SchoolInboxPage />)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/groups'))
    expect(screen.queryByText('Art class families')).toBeNull()
    expect(screen.queryByText('Art class students')).toBeNull()
  })

  it('says nothing about groups when there are none', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.myConvos = [convo(2, 'Pat')]
    render(<SchoolInboxPage />)
    await screen.findByText('Pat Family')
    expect(screen.queryByText('Group threads')).toBeNull()
  })
})

// ac84b6cd: "when I sent a group message from icreate's inbox, the thread
// popped into my PERSONAL inbox". A staff group sent from the School tab now
// belongs to the school, and the School tab lists and opens it, read as the
// school -- not through the sender's membership.
describe('school-owned group threads on the School tab', () => {
  const schoolGroup = (over = {}) => ({
    id: 'sg1', name: 'Tuesday cover', audience: 'staff', created_by: 'inbox-1',
    member_count: 4, unread_count: 0,
    last_message_at: '2026-09-22T11:00:00Z', ...over,
  })

  it('lists the school groups on the School tab', async () => {
    state.schoolGroups = [schoolGroup()]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    expect(await screen.findByText('Tuesday cover')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/school-inbox/groups')
    // The office's own groups are not read on the School tab.
    expect(api.get).not.toHaveBeenCalledWith('/api/groups')
  })

  it('opens a school group in place, read as the school', async () => {
    state.schoolGroups = [schoolGroup()]
    state.groupMessages = [
      { id: 'gm2', sender_id: 'me-1', message_content: 'Who can cover Ada?',
        created_at: '2026-09-22T11:00:00Z', sender: { id: 'me-1', first_name: 'Kate' } },
    ]
    const { container } = render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    const row = await screen.findByText('Tuesday cover')
    expect(row.closest('a')).toBeNull()
    fireEvent.click(row)
    expect(await screen.findByText('Who can cover Ada?')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/school-inbox/groups/sg1/messages')
    expect(api.get).not.toHaveBeenCalledWith('/api/groups/sg1/messages')
    // Reading as the school marks it read on the server; the member-only
    // read route is never called.
    expect(api.post).not.toHaveBeenCalledWith('/api/groups/sg1/read', {})
    expect(container.querySelector('a[href*="/messages"]')).toBeNull()
  })

  it('sends in a school group through the school inbox', async () => {
    state.schoolGroups = [schoolGroup()]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    fireEvent.click(await screen.findByText('Tuesday cover'))
    const box = await screen.findByPlaceholderText('Type a message...')
    fireEvent.change(box, { target: { value: 'Thanks all' } })
    fireEvent.click(screen.getByLabelText('Send message'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/school-inbox/groups/sg1/messages', expect.objectContaining({ content: 'Thanks all' })))
  })

  it('opens ?group= from a notification link', async () => {
    state.schoolGroups = [schoolGroup()]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school&group=sg1' })
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/api/school-inbox/groups/sg1/messages'))
  })

})

// ── Messaging rework (iCreate meeting, 2026-09-23) ───────────────────────────

describe('SchoolInboxPage — tasks, grants and receipts', () => {
  // bf8b754d: a thread becomes a task for somebody on staff.
  it('makes a task from the whole thread', async () => {
    state.schoolConvos = [convo(1, 'Greta')]
    state.staff = [{ id: 'tam', name: 'Tam T', role_labels: ['Teacher'] }]
    render(<SchoolInboxPage />, { route: '/inbox?conversation=c1' })
    fireEvent.click(await screen.findByRole('button', { name: /Make a task/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.focus(await within(dialog).findByPlaceholderText('Search staff'))
    fireEvent.change(within(dialog).getByPlaceholderText('Search staff'), { target: { value: 'Tam' } })
    fireEvent.mouseDown(await screen.findByText(/^Tam T/, { selector: 'button, button *' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make task' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/school-inbox/conversations/c1/task',
      expect.objectContaining({ assignee_id: 'tam', action: 'reply', priority: 'normal' })))
  })

  // A family's message is how a request arrives now: the office picks it.
  it('makes a task from one message, naming it', async () => {
    state.schoolConvos = [convo(1, 'Greta')]
    state.schoolMessages = [{ id: 'm1', sender_id: 'u1', message_content: 'Can I get the trip form?',
      created_at: '2026-08-30T12:00:00Z' }]
    state.staff = [{ id: 'tam', name: 'Tam T' }]
    render(<SchoolInboxPage />, { route: '/inbox?conversation=c1' })
    await screen.findByText('Can I get the trip form?')
    // The thread's own button is first; the message's is under the bubble.
    const buttons = screen.getAllByRole('button', { name: 'Make a task' })
    fireEvent.click(buttons[buttons.length - 1])
    const dialog = await screen.findByRole('dialog')
    fireEvent.focus(await within(dialog).findByPlaceholderText('Search staff'))
    fireEvent.change(within(dialog).getByPlaceholderText('Search staff'), { target: { value: 'Tam' } })
    fireEvent.mouseDown(await screen.findByText(/^Tam T/, { selector: 'button, button *' }))
    fireEvent.click(within(dialog).getByLabelText(/Do something about it/))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make task' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/school-inbox/conversations/c1/task',
      expect.objectContaining({ assignee_id: 'tam', action: 'do', message_id: 'm1' })))
  })

  it('says which colleagues opened the thread', async () => {
    state.schoolConvos = [convo(1, 'Greta')]
    state.openedBy = [
      { user_id: 'me-1', name: 'Me', last_read_at: '2026-08-30T12:00:00Z' },
      { user_id: 'kate', name: 'Kate A', last_read_at: '2026-08-30T12:00:00Z' },
    ]
    render(<SchoolInboxPage />, { route: '/inbox?conversation=c1' })
    expect(await screen.findByText(/Opened by Kate A/)).toBeInTheDocument()
    expect(screen.queryByText(/Opened by Me/)).toBeNull()
  })

  // d93b24d2: a teacher given a thread "gets the whole thread and can reply".
  it('shows a teacher the threads handed to them, and they reply as the school', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.granted = {
      conversations: [convo(1, 'Greta')], groups: [],
      inbox_user_id: 'inbox-1', organization: { name: 'Hearthwood' },
    }
    state.schoolMessages = [{ id: 'm1', sender_id: 'u1', message_content: 'Hello?',
      created_at: '2026-08-30T12:00:00Z' }]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school&conversation=c1' })
    expect(await screen.findByText('Hello?')).toBeInTheDocument()
    expect(screen.getByText(/Replying as Hearthwood, with your name/)).toBeInTheDocument()
    // Nothing the office manages: no Compose, no Make a task, no Mark handled.
    expect(screen.queryByRole('button', { name: 'Compose' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Make a task/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Mark handled/ })).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('Reply as Hearthwood...'), { target: { value: 'Attached' } })
    fireEvent.click(screen.getByLabelText('Send message'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/school-inbox/conversations/u1/send', { content: 'Attached' }))
  })

  it('gives a teacher with no handed threads no school tab', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    render(<SchoolInboxPage />)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/school-inbox/granted'))
    expect(screen.queryByRole('tab', { name: /^Hearthwood/ })).toBeNull()
  })

  // 9b46c748: "Read by N of M" for a Compose send, and who.
  it('lists sent messages with who has read them', async () => {
    state.sends = [{ id: 's1', subject: 'Trip', body: 'Bring a lunch', mode: 'separate',
      created_at: '2026-08-30T12:00:00Z', read_count: 1, recipient_count: 2, sent_by_name: 'Kate A' }]
    state.sendDetail = { id: 's1', subject: 'Trip', body: 'Bring a lunch', mode: 'separate', push: true,
      created_at: '2026-08-30T12:00:00Z', read_count: 1, recipient_count: 2,
      recipients: [
        { user_id: 'a', name: 'Una Moss', kind: 'family', status: 'sent', read_at: null },
        { user_id: 'b', name: 'Mia Lark', kind: 'family', status: 'sent', read_at: '2026-08-30T13:00:00Z' },
      ] }
    render(<SchoolInboxPage />, { route: '/inbox?tab=sent' })
    fireEvent.click(await screen.findByText('Read by 1 of 2'))
    expect(await screen.findByText('Una Moss')).toBeInTheDocument()
    expect(screen.getByText('Not read yet')).toBeInTheDocument()
    // "Read by 1 of 2" above, and Mia's "Read <time>".
    expect(screen.getAllByText(/^Read /)).toHaveLength(2)
  })
})
