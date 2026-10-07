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
    audience: null, sends: [], sendDetail: null, staff: [], openedBy: [],
    mineNeedsReply: 0, schoolNeedsReply: 0, inboxAccess: null,
  }
  const apiData = (url) => {
    // The two halves of the sidebar badge, which the tab bar now shows too.
    if (url.startsWith('/api/messages/unread-count')) {
      return { data: { data: { needs_reply_threads: state.mineNeedsReply } } }
    }
    // Who may open the school inbox (19047fd0). Null: the server's answer
    // has not said no, so the School tab shows, as before the list.
    if (url.startsWith('/api/school-inbox/access')) {
      return { data: { data: state.inboxAccess || {} } }
    }
    if (url.startsWith('/api/school-inbox/unread-count')) {
      return { data: { data: { needs_reply_threads: state.schoolNeedsReply } } }
    }
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
      put: vi.fn(() => Promise.resolve({ data: { success: true, data: {} } })),
      patch: vi.fn(() => Promise.resolve({ data: { success: true, data: {} } })),
      delete: vi.fn(() => Promise.resolve({ data: { success: true, data: { ok: true } } })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

// The delete confirm answers yes; the dialog itself has its own tests.
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => () => Promise.resolve(true) }))

import SchoolInboxPage from './SchoolInboxPage'

const convo = (n, name) => ({
  id: `c${n}`,
  other_user: { id: `u${n}`, first_name: name, last_name: 'Family' },
  unread_count: 0,
  last_message_at: '2026-08-30T12:00:00Z',
  last_message_preview: `hello ${n}`,
})

// One of the three thread views (Open / Waiting / Closed), whatever count its
// label carries. Not "Closed · Reopen", the thread's own button.
const viewButton = (name) => within(screen.getByRole('group', { name: 'Filter threads' }))
  .getByRole('button', { name: new RegExp(`^${name}( \\(\\d+\\))?$`) })

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
  state.sends = []
  state.sendDetail = null
  state.staff = []
  state.openedBy = []
  state.mineNeedsReply = 0
  state.schoolNeedsReply = 0
  state.inboxAccess = null
  // The two group sections are drop-downs, closed until opened (ticket
  // efa9bbed). The tests of what is IN them start with both open; the tests
  // of the drop-downs themselves clear this.
  window.localStorage.setItem('sis_inbox_open_sections',
    JSON.stringify({ groups: true, classChats: true }))
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

  // Tickets 250c9c7a + 7402cb26, Molly (iCreate, org_admin): three views,
  // Open (ours to answer), Waiting (their turn) and Closed. This test pinned
  // Open and Closed only (d57973f6), with "Waiting on them" folded into Open
  // under a "Their turn" tag; the office could not tell from the list which
  // open threads it still owed, so the owner split Waiting back out
  // (2026-10-05).
  it('sorts threads into Open, Waiting and Closed, and skips empty ones', async () => {
    // iCreate saw "Needs a reply (22)" over a queue of 7: six empty threads
    // counted too (7ee545c4). Empty threads are still in no view.
    state.schoolConvos = [
      { ...convo(1, 'Owed'), last_message_sender_id: 'u1' },
      { ...convo(2, 'Answered'), last_message_sender_id: 'inbox-1' },
      { ...convo(3, 'Empty'), last_message_at: null, last_message_preview: '' },
      { ...convo(4, 'Done'), last_message_sender_id: 'u4', resolved_at: '2026-08-31T00:00:00Z' },
    ]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    expect(await screen.findByText('Owed Family')).toBeInTheDocument()
    expect(viewButton('Open')).toHaveTextContent('Open (1)')
    expect(viewButton('Waiting')).toHaveTextContent('Waiting (1)')
    expect(viewButton('Closed')).toHaveTextContent('Closed (1)')
    expect(screen.queryByText('Answered Family')).not.toBeInTheDocument()
    expect(screen.queryByText('Empty Family')).not.toBeInTheDocument()
    expect(screen.queryByText('Done Family')).not.toBeInTheDocument()

    fireEvent.click(viewButton('Waiting'))
    expect(screen.getByText('Answered Family')).toBeInTheDocument()
    expect(screen.queryByText('Owed Family')).not.toBeInTheDocument()
    expect(screen.getAllByText('Their turn')).toHaveLength(1)

    fireEvent.click(viewButton('Closed'))
    expect(screen.getByText('Done Family')).toBeInTheDocument()
    expect(screen.queryByText('Owed Family')).not.toBeInTheDocument()
    expect(screen.queryByText('Answered Family')).not.toBeInTheDocument()
  })

  // "Mark handled" / "Handled · Reopen" were renamed "Close" / "Closed ·
  // Reopen" (ticket d57973f6, Molly at iCreate).
  it('closes a thread as the school, and a newer message reopens it', async () => {
    // Answered from the other inbox, in person, or not worth answering: the
    // office says so instead of the thread sitting under Open (5c858931).
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
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/school-inbox/conversations/c1/resolve', { resolved: true }))
    expect(await screen.findByText('Closed · Reopen')).toBeInTheDocument()
    expect(viewButton('Open')).toHaveTextContent(/^Open$/)
    fireEvent.click(viewButton('Closed'))
    // Listed under Closed (and still open in the thread pane).
    expect(screen.getAllByText('Tiffany Family').length).toBe(2)
  })

  it('a closed thread the member wrote in again is open once more', async () => {
    // 250c9c7a / 7402cb26 (Molly): "a new message from them moves a thread
    // back to Open" -- resolved_at is older than their last message.
    state.schoolConvos = [{
      ...convo(1, 'Back'), last_message_sender_id: 'u1',
      resolved_at: '2026-08-29T12:00:00Z', last_message_at: '2026-08-30T12:00:00Z',
    }]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    expect(await screen.findByText('Back Family')).toBeInTheDocument()
    expect(viewButton('Open')).toHaveTextContent('Open (1)')
    expect(viewButton('Closed')).toHaveTextContent(/^Closed$/)
  })

  it('resolves through the personal endpoint on the Mine tab', async () => {
    authUser = { id: 'me-1', role: 'org_admin' }
    state.myConvos = [{ ...convo(4, 'Pat'), last_message_sender_id: 'u4' }]
    state.myMessages = [
      { id: 'm1', sender_id: 'u4', message_content: 'hey', created_at: '2026-08-30T12:00:00Z' },
    ]
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine' })
    fireEvent.click(await screen.findByText('Pat Family'))
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
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
    // Our message was last: under Waiting since 250c9c7a (Open under
    // d57973f6, All before that).
    await screen.findByRole('button', { name: /^Waiting/ })
    fireEvent.click(viewButton('Waiting'))
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
    // On the row, and on the section's header for when it is closed.
    expect(screen.getAllByText('3')).toHaveLength(2)
    expect(screen.getByLabelText('3 unread in Group threads')).toBeInTheDocument()
  })

  // This test used to pin the opposite ("leaves family and student groups
  // out"): My messages listed staff rooms only, on the grounds that class
  // chats had their own page. Nothing in the console led there, so a class
  // chat message could be read only from the bell and vanished with it.
  // 8a5f0d24 (iCreate advisor, 2026-09-29): "Sometimes I get messages I can
  // only access from the notification button... when I close it, it's
  // gone." b8e2f0c9: "There appear to be 2 different views... the messages
  // tab on the left doesn't show all messages; 'view details' from
  // notifications shows all." The product owner decided My messages lists
  // every group the caller belongs to, class chats labelled as such.
  it('lists family and student class chats on My messages, labelled apart from staff rooms', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.groups = [
      group(),
      group({ id: 'g2', name: 'Art class families', audience: 'family', source_class_id: 'c-art' }),
      group({ id: 'g3', name: 'Art class students', audience: 'student', source_class_id: 'c-art' }),
    ]
    render(<SchoolInboxPage />)
    const families = await screen.findByText('Art class families')
    const students = screen.getByText('Art class students')
    // Their own heading, below the staff rooms, each tagged by audience.
    expect(screen.getByText('Group threads')).toBeInTheDocument()
    expect(screen.getByText('Class chats')).toBeInTheDocument()
    expect(within(families.closest('button')).getByText('Parents')).toBeInTheDocument()
    expect(within(students.closest('button')).getByText('Students')).toBeInTheDocument()
    expect(within(screen.getByText('Elementary teachers').closest('button')).queryByText('Parents')).toBeNull()

    // And they open in place, read as a member.
    fireEvent.click(families)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/groups/g2/messages'))
  })

  // iCreate, ticket 6f9ed4fb (2026-09-30): "it says 'parents' on echo dots -
  // when it was all sent to teachers." A group with no class is not a class
  // chat, whatever its audience column says.
  it('lists a family-audience group with no class as a group thread, untagged', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.groups = [
      group({ id: 'g4', name: 'Echo Dots', audience: 'family', source_class_id: null }),
    ]
    render(<SchoolInboxPage />)
    const echo = await screen.findByText('Echo Dots')
    expect(screen.getByText('Group threads')).toBeInTheDocument()
    expect(screen.queryByText('Class chats')).toBeNull()
    expect(within(echo.closest('button')).queryByText('Parents')).toBeNull()
  })

  // The School tab is unchanged: it lists the groups the school owns, and a
  // class chat the admin happens to be in is not the office's.
  it('does not add the caller’s class chats to the School tab', async () => {
    state.groups = [group({ id: 'g2', name: 'Art class families', audience: 'family', source_class_id: 'c-art' })]
    state.schoolGroups = []
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/school-inbox/groups'))
    expect(screen.queryByText('Art class families')).toBeNull()
  })

  // 61b762a5: "When I click on 'view details' for the message that Molly
  // just sent ... it goes to a messaging page with options 'needs a reply',
  // 'waiting on them' etc. And the message itself isn't seen." The bell's
  // /communication?group= becomes /inbox?tab=mine&group= in the console, and
  // a class chat is not in the staff-room list, so the link did nothing.
  it('opens a class chat named by ?group= even though it is not listed', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.groups = [group({ id: 'g3', name: 'Art class students', audience: 'student', source_class_id: 'c-art' })]
    state.groupMessages = [
      { id: 'gm3', sender_id: 'u9', message_content: 'Field trip forms are due Friday, please remind everyone',
        created_at: '2026-09-22T10:00:00Z', sender: { id: 'u9', first_name: 'Molly' } },
    ]
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine&group=g3' })
    expect(await screen.findByText('Field trip forms are due Friday, please remind everyone'))
      .toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/groups/g3/messages')
    // Listed now (8a5f0d24), under Class chats, not among the staff rooms.
    expect(screen.getByText('Class chats')).toBeInTheDocument()
    expect(screen.queryByText('Group threads')).toBeNull()
  })

  it('opens a ?group= the list does not hold, once the list has loaded', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine&group=g7' })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/groups/g7/messages'))
  })

  it('says nothing about groups when there are none', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.myConvos = [convo(2, 'Pat')]
    render(<SchoolInboxPage />)
    await screen.findByText('Pat Family')
    expect(screen.queryByText('Group threads')).toBeNull()
  })
})

// 1570c67a (iCreate org_admin on /inbox?tab=school, 2026-09-29): "On
// messaging on the side bar it says I have 3 messages, but idk where those
// are." The sidebar added both tabs' threads needing a reply; the tab bar
// showed a number on the OPEN tab only, so the other tab's share was
// invisible. Each tab now shows its count whichever is open, from the same
// two endpoints as the sidebar, so the numbers add up.
describe('tab counts', () => {
  const tabNamed = (re) => screen.getAllByRole('tab').find((t) => re.test(t.textContent))

  it('shows My messages’ count while the School tab is open', async () => {
    state.mineNeedsReply = 2
    state.schoolNeedsReply = 1
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    await waitFor(() => expect(tabNamed(/My messages/).textContent).toContain('2'))
    expect(api.get).toHaveBeenCalledWith('/api/messages/unread-count?threads=1')
  })

  it('shows the School tab’s count while My messages is open', async () => {
    state.mineNeedsReply = 2
    state.schoolNeedsReply = 1
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine' })
    await waitFor(() => expect(tabNamed(/inbox/).textContent).toContain('1'))
    expect(api.get).toHaveBeenCalledWith('/api/school-inbox/unread-count', { expect403: true })
  })

  it('counts unread threads on the open tab, not unread messages', async () => {
    // One thread, five unread messages: the sidebar says 1, so the tab does.
    state.schoolConvos = [{ ...convo(1, 'Greta'), unread_count: 5, last_message_sender_id: 'u1' }]
    state.schoolNeedsReply = 1
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    await screen.findByText('Greta Family')
    const school = tabNamed(/inbox/)
    await waitFor(() => expect(school.textContent).toMatch(/inbox1$/))
    expect(school.textContent).not.toContain('5')
  })

  it('does not ask for the school count for a teacher', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    render(<SchoolInboxPage />)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/messages/unread-count?threads=1'))
    expect(api.get).not.toHaveBeenCalledWith('/api/school-inbox/unread-count', expect.anything())
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

describe('SchoolInboxPage — tasks and receipts', () => {
  // bf8b754d: a thread becomes a task for somebody on staff.
  it('makes a task from the whole thread', async () => {
    state.schoolConvos = [convo(1, 'Greta')]
    // Only the front office is offered: a teacher cannot open the thread.
    state.staff = [
      { id: 'tam', name: 'Tam T', roles: ['campus_coordinator'], role_labels: ['Coordinator'] },
      { id: 'ned', name: 'Ned Teacher', roles: ['advisor'], role_labels: ['Teacher'] },
    ]
    render(<SchoolInboxPage />, { route: '/inbox?conversation=c1' })
    fireEvent.click(await screen.findByRole('button', { name: /Make a task/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.focus(await within(dialog).findByPlaceholderText('Search the front office'))
    expect(screen.queryByText(/^Ned Teacher/)).toBeNull()
    fireEvent.change(within(dialog).getByPlaceholderText('Search the front office'), { target: { value: 'Tam' } })
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
    state.staff = [{ id: 'tam', name: 'Tam T', roles: ['org_admin'] }]
    render(<SchoolInboxPage />, { route: '/inbox?conversation=c1' })
    await screen.findByText('Can I get the trip form?')
    // The thread's own button is first; the message's is under the bubble.
    const buttons = screen.getAllByRole('button', { name: 'Make a task' })
    fireEvent.click(buttons[buttons.length - 1])
    const dialog = await screen.findByRole('dialog')
    fireEvent.focus(await within(dialog).findByPlaceholderText('Search the front office'))
    fireEvent.change(within(dialog).getByPlaceholderText('Search the front office'), { target: { value: 'Tam' } })
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

  // The school inbox is the office's. A teacher could be lent one thread
  // with a task (d93b24d2) until 2026-10-01; nobody ever was.
  it('gives a teacher no school tab, even from a link that names it', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    render(<SchoolInboxPage />, { route: '/inbox?tab=school&conversation=c1' })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/messages/conversations'))
    expect(screen.queryByRole('tab', { name: /^Hearthwood/ })).toBeNull()
    expect(api.get).not.toHaveBeenCalledWith('/api/school-inbox/conversations')
    expect(screen.getByRole('button', { name: 'Compose' })).toBeInTheDocument()
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

// 80d52c32: "A way to search messages would be very helpful for when one
// needs to go back and find something that someone had messaged about."
// Approved scope: thread names only (people, groups), on every tab.
describe('thread search', () => {
  const search = () => screen.getByRole('searchbox', { name: 'Search conversations' })

  it('filters the threads by name, across every pile', async () => {
    state.schoolConvos = [
      convo(1, 'Greta'),
      // Closed: not under Open, but a search still finds it.
      { ...convo(2, 'Henry'), resolved_at: '2026-08-31T12:00:00Z' },
    ]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    expect(await screen.findByText('Greta Family')).toBeInTheDocument()
    expect(screen.queryByText('Henry Family')).toBeNull()

    fireEvent.change(search(), { target: { value: 'henry' } })
    expect(await screen.findByText('Henry Family')).toBeInTheDocument()
    expect(screen.queryByText('Greta Family')).toBeNull()
  })

  it('filters group threads by name', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.groups = [
      { id: 'g1', name: 'Elementary teachers', audience: 'staff', last_message_at: '2026-09-22T10:00:00Z' },
      { id: 'g2', name: 'Middle school team', audience: 'staff', last_message_at: '2026-09-22T09:00:00Z' },
    ]
    render(<SchoolInboxPage />)
    await screen.findByText('Elementary teachers')
    fireEvent.change(search(), { target: { value: 'middle' } })
    expect(screen.getByText('Middle school team')).toBeInTheDocument()
    expect(screen.queryByText('Elementary teachers')).toBeNull()
  })

  it('says so when nothing matches', async () => {
    state.schoolConvos = [convo(1, 'Greta')]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    await screen.findByText('Greta Family')
    fireEvent.change(search(), { target: { value: 'zebra' } })
    expect(screen.getByText('No conversations match')).toBeInTheDocument()
    expect(screen.queryByText('Greta Family')).toBeNull()
  })

  it('searches the Sent tab by subject, not the body', async () => {
    state.sends = [
      { id: 's1', subject: 'Trip', body: 'Bring a lunch', mode: 'separate',
        created_at: '2026-09-23T10:00:00Z', read_count: 1, recipient_count: 2 },
      { id: 's2', subject: 'Picture day', body: 'Smile', mode: 'separate',
        created_at: '2026-09-23T11:00:00Z', read_count: 0, recipient_count: 2 },
    ]
    render(<SchoolInboxPage />, { route: '/inbox?tab=sent' })
    expect(await screen.findByText('Trip')).toBeInTheDocument()
    fireEvent.change(search(), { target: { value: 'picture' } })
    expect(screen.getByText('Picture day')).toBeInTheDocument()
    expect(screen.queryByText('Trip')).toBeNull()
    fireEvent.change(search(), { target: { value: 'lunch' } })
    expect(screen.getByText('No conversations match')).toBeInTheDocument()
  })
})

// iCreate, ticket efa9bbed (2026-10-01): "I would like individual messages to
// appear at the top. I can ignore the class chats for the most part as I don't
// have to be checking those often. Group threads and Class chats could be drop
// down buttons."
//
// The drop-downs stayed; the order did not. With the groups below a long list
// of 1:1 threads, a coordinator who was a member of groups never saw them
// without searching (iCreate, tickets c8e2946d + af47046f). The owner moved
// both collapsed sections ABOVE the 1:1 list (2026-10-05); the two tests that
// pinned "people first" now pin groups first, and say so.
describe('SchoolInboxPage — groups in drop-downs, above the people', () => {
  const room = (over = {}) => ({
    id: 'g1', name: 'Elementary teachers', audience: 'staff', member_count: 10,
    unread_count: 0, last_message_at: '2026-09-22T10:00:00Z', ...over,
  })
  const classChat = (over = {}) => room({
    id: 'g2', name: 'Art', audience: 'family', source_class_id: 'c-art', ...over })

  beforeEach(() => { window.localStorage.removeItem('sis_inbox_open_sections') })

  // c8e2946d + af47046f (iCreate): a campus coordinator in groups could not
  // find them under the 1:1 list. Pinned the other way round until
  // 2026-10-05 ("lists individual threads above both group sections").
  it('lists both group sections above the individual threads', async () => {
    authUser = { id: 'me-1', role: 'org_managed', org_role: 'campus_coordinator' }
    state.myConvos = Array.from({ length: 12 }, (_, i) => ({ ...convo(i + 1, `P${i + 1}`), last_message_sender_id: `u${i + 1}` }))
    state.groups = [room({ unread_count: 2 }), classChat()]
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine' })
    const person = await screen.findByText('P1 Family')
    const groups = await screen.findByRole('button', { name: /Group threads/ })
    const chats = screen.getByRole('button', { name: /Class chats/ })
    const after = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(after(groups, chats)).toBe(true)
    expect(after(chats, person)).toBe(true)
    // Collapsed, and its unread still shows without a search.
    expect(groups).toHaveAttribute('aria-expanded', 'false')
    expect(within(groups).getByLabelText('2 unread in Group threads')).toBeInTheDocument()
  })

  it('shows the group sections even when the view has no 1:1 threads', async () => {
    // c8e2946d + af47046f: the groups must not depend on the 1:1 list.
    authUser = { id: 'me-1', role: 'org_managed', org_role: 'campus_coordinator' }
    state.myConvos = []
    state.groups = [room()]
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine' })
    expect(await screen.findByRole('button', { name: /Group threads/ })).toBeInTheDocument()
    expect(screen.queryByText('No messages yet')).toBeNull()
  })

  it('keeps both sections closed until opened, with their count and unread showing', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.groups = [room(), classChat({ unread_count: 3 }), classChat({ id: 'g3', name: 'Robotics', unread_count: 1 })]
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine' })
    const chats = await screen.findByRole('button', { name: /Class chats/ })
    expect(chats).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Art')).toBeNull()
    expect(screen.queryByText('Elementary teachers')).toBeNull()
    // Nothing is hidden silently: two chats, four unread.
    expect(chats).toHaveTextContent('2')
    expect(screen.getByLabelText('4 unread in Class chats')).toBeInTheDocument()

    fireEvent.click(chats)
    expect(chats).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Art')).toBeInTheDocument()
    expect(screen.queryByText('Elementary teachers')).toBeNull()
    fireEvent.click(chats)
    expect(screen.queryByText('Art')).toBeNull()
  })

  it('remembers an opened section on this browser', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.groups = [room()]
    const first = render(<SchoolInboxPage />, { route: '/inbox?tab=mine' })
    fireEvent.click(await screen.findByRole('button', { name: /Group threads/ }))
    expect(screen.getByText('Elementary teachers')).toBeInTheDocument()
    first.unmount()
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine' })
    expect(await screen.findByText('Elementary teachers')).toBeInTheDocument()
  })

  it('a search looks inside closed sections', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.groups = [room(), classChat()]
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine' })
    await screen.findByRole('button', { name: /Class chats/ })
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'art' } })
    expect(await screen.findByText('Art')).toBeInTheDocument()
    expect(screen.queryByText('Elementary teachers')).toBeNull()
  })

  it('a group opened from a link opens the section it lives in', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.groups = [room(), classChat()]
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine&group=g2' })
    const chats = await screen.findByRole('button', { name: /Class chats/ })
    await waitFor(() => expect(chats).toHaveAttribute('aria-expanded', 'true'))
    expect(screen.getByRole('button', { name: /Group threads/ })).toHaveAttribute('aria-expanded', 'false')
  })

  // Pinned families-first until 2026-10-05 (c8e2946d + af47046f): the
  // School tab follows the same order as My messages.
  it('the school tab puts the school group threads above families too', async () => {
    state.schoolConvos = [convo(1, 'Greta')]
    state.schoolGroups = [room({ id: 'sg1', name: 'Tuesday cover' })]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    const person = await screen.findByText('Greta Family')
    const groups = await screen.findByRole('button', { name: /Group threads/ })
    expect(Boolean(groups.compareDocumentPosition(person) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(screen.queryByText('Tuesday cover')).toBeNull()
  })
})


// Ticket 19047fd0, Molly (iCreate, org_admin): org admins choose who can open
// the school inbox. The page reads GET /api/school-inbox/access.
describe('SchoolInboxPage — who can open the school inbox (19047fd0, Molly)', () => {
  it('hides the School tab from a coordinator the list leaves out', async () => {
    authUser = { id: 'me-1', role: 'org_managed', org_role: 'campus_coordinator' }
    state.inboxAccess = { inbox_access: false, can_manage: false, member_ids: ['kate'], everyone: false }
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/school-inbox/access', { expect403: true }))
    await waitFor(() => expect(screen.queryByRole('tab', { name: /inbox/ })).toBeNull())
    expect(screen.getByText(/Your own threads/)).toBeInTheDocument()
  })

  it('keeps the School tab for a member, with no Inbox access button for a coordinator', async () => {
    authUser = { id: 'me-1', role: 'org_managed', org_role: 'campus_coordinator' }
    state.inboxAccess = { inbox_access: true, can_manage: false, member_ids: ['me-1'], everyone: false }
    state.schoolConvos = [convo(1, 'Greta')]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    expect(await screen.findByText('Greta Family')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Inbox access' })).toBeNull()
  })

  it('lets an org admin pick the coordinators', async () => {
    state.inboxAccess = { inbox_access: true, can_manage: true, member_ids: [], everyone: true }
    state.staff = [
      { id: 'molly', name: 'Molly', roles: ['org_admin'] },
      { id: 'kate', name: 'Kate', roles: ['campus_coordinator'] },
      { id: 'becky', name: 'Becky', roles: ['campus_coordinator'] },
      { id: 'ned', name: 'Ned', roles: ['advisor'] },
    ]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    fireEvent.click(await screen.findByRole('button', { name: 'Inbox access' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('Kate')
    // Teachers are not offered; org admins are always in.
    expect(within(dialog).queryByText('Ned')).toBeNull()
    expect(within(dialog).getByLabelText('Molly (org admin)')).toBeDisabled()
    fireEvent.click(within(dialog).getByLabelText('Only the coordinators I pick'))
    fireEvent.click(within(dialog).getByLabelText('Kate'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/school-inbox/access', { member_ids: ['kate'] }))
  })

  it('offers inbox tasks only to the people on the inbox', async () => {
    state.inboxAccess = { inbox_access: true, can_manage: true, member_ids: ['tam'], everyone: false,
      office_ids: ['me-1', 'tam'] }
    state.schoolConvos = [convo(1, 'Greta')]
    state.staff = [
      { id: 'tam', name: 'Tam T', roles: ['campus_coordinator'] },
      { id: 'kim', name: 'Kim Off', roles: ['campus_coordinator'] },
    ]
    render(<SchoolInboxPage />, { route: '/inbox?conversation=c1' })
    fireEvent.click(await screen.findByRole('button', { name: /Make a task/ }))
    const dialog = await screen.findByRole('dialog')
    const box = await within(dialog).findByPlaceholderText('Search the front office')
    fireEvent.focus(box)
    fireEvent.change(box, { target: { value: 'Tam' } })
    expect(await screen.findByText(/^Tam T/, { selector: 'button, button *' })).toBeInTheDocument()
    fireEvent.change(box, { target: { value: 'Kim' } })
    await waitFor(() => expect(screen.queryByText(/^Tam T/, { selector: 'button, button *' })).toBeNull())
    expect(screen.queryByText(/^Kim Off/)).toBeNull()
  })
})

// Tickets 250c9c7a + 7402cb26 (Molly, iCreate org_admin) and 1d5c425a: three
// views -- Open (waiting on us), Waiting (their turn), Closed -- on both the
// School tab and My messages, and the "Their turn" tag from the last sender
// alone.
describe('SchoolInboxPage — Open, Waiting, Closed (250c9c7a + 7402cb26)', () => {
  const at = (h) => `2026-10-0${h < 24 ? 1 : 2}T${String(h % 24).padStart(2, '0')}:00:00Z`

  it.each([
    // [who spoke last, closed after the last message?, view]
    ['them', false, 'Open'],
    ['us', false, 'Waiting'],
    ['them', true, 'Closed'],
    ['us', true, 'Closed'],
  ])('a thread where %s spoke last (closed: %s) is in %s, on both tabs', async (who, closed, view) => {
    for (const tab of ['school', 'mine']) {
      const self = tab === 'school' ? 'inbox-1' : 'me-1'
      const row = {
        ...convo(1, 'Kim'),
        last_message_sender_id: who === 'us' ? self : 'u1',
        last_message_at: at(10),
        resolved_at: closed ? at(11) : null,
      }
      state.schoolConvos = tab === 'school' ? [row] : []
      state.myConvos = tab === 'mine' ? [row] : []
      const { unmount } = render(<SchoolInboxPage />, { route: `/inbox?tab=${tab}` })
      await waitFor(() => expect(viewButton(view)).toHaveTextContent(`${view} (1)`))
      for (const other of ['Open', 'Waiting', 'Closed'].filter((v) => v !== view)) {
        expect(viewButton(other)).toHaveTextContent(new RegExp(`^${other}$`))
      }
      fireEvent.click(viewButton(view))
      expect(screen.getByText('Kim Family')).toBeInTheDocument()
      unmount()
    }
  })

  it('a reply from them moves a Waiting thread back to Open', async () => {
    state.schoolConvos = [{ ...convo(1, 'Kim'), last_message_sender_id: 'inbox-1' }]
    const { unmount } = render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    await waitFor(() => expect(viewButton('Waiting')).toHaveTextContent('Waiting (1)'))
    unmount()
    // They wrote back: last_message_sender_id and last_message_at move.
    state.schoolConvos = [{ ...convo(1, 'Kim'), last_message_sender_id: 'u1',
      last_message_at: '2026-08-31T12:00:00Z' }]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    expect(await screen.findByText('Kim Family')).toBeInTheDocument()
    expect(viewButton('Open')).toHaveTextContent('Open (1)')
  })

  it('our own reply to a closed thread moves it to Waiting', async () => {
    // Molly: replying to a closed thread is not closing it again; it is now
    // their turn.
    state.schoolConvos = [{ ...convo(1, 'Kim'), last_message_sender_id: 'u1',
      last_message_at: '2026-08-30T12:00:00Z', resolved_at: '2026-08-30T13:00:00Z' }]
    state.schoolMessages = [
      { id: 'm1', sender_id: 'u1', message_content: 'Thanks!', created_at: '2026-08-30T12:00:00Z' },
    ]
    api.post.mockImplementation((url) => {
      if (url.endsWith('/send')) {
        // The server records the reply; the list's refetch reads it back.
        state.schoolConvos = [{ ...state.schoolConvos[0], last_message_sender_id: 'inbox-1',
          last_message_at: '2026-08-31T09:00:00Z' }]
        return Promise.resolve({ data: { data: { message: { id: 'm2', sender_id: 'inbox-1' },
          conversation_id: 'c1' } } })
      }
      return Promise.resolve({ data: { success: true } })
    })
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    await waitFor(() => expect(viewButton('Closed')).toHaveTextContent('Closed (1)'))
    fireEvent.click(viewButton('Closed'))
    fireEvent.click(await screen.findByText('Kim Family'))
    await screen.findByText('Thanks!')
    fireEvent.change(screen.getByPlaceholderText(/Reply as/), { target: { value: 'Any time' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/Reply as/), { key: 'Enter', ctrlKey: true }) // Ctrl+Enter sends (e937883a)
    await waitFor(() => expect(viewButton('Waiting')).toHaveTextContent('Waiting (1)'))
    expect(viewButton('Closed')).toHaveTextContent(/^Closed$/)
  })

  it('keeps the Their turn tag in Closed when our message was last (1d5c425a)', async () => {
    // 1d5c425a: the tag was gated on "not closed", so a closed thread lost
    // the one hint of who owed the next word.
    state.schoolConvos = [
      { ...convo(1, 'Ours'), last_message_sender_id: 'inbox-1', resolved_at: '2026-08-31T00:00:00Z' },
      { ...convo(2, 'Theirs'), last_message_sender_id: 'u2', resolved_at: '2026-08-31T00:00:00Z' },
    ]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    await waitFor(() => expect(viewButton('Closed')).toHaveTextContent('Closed (2)'))
    fireEvent.click(viewButton('Closed'))
    const ours = (await screen.findByText('Ours Family')).closest('button')
    const theirs = screen.getByText('Theirs Family').closest('button')
    expect(within(ours).getByText('Their turn')).toBeInTheDocument()
    expect(within(theirs).queryByText('Their turn')).toBeNull()
  })
})

// Ticket 16d13eb4 (iCreate): "my messages says I have 1 unread, but I have no
// idea where that message might be." One rule for every number -- 1:1 threads
// with unread + group threads with unread (13aa8bd0) -- so each one points at
// a row with an unread marker.
describe('SchoolInboxPage — the numbers agree (16d13eb4)', () => {
  const tabNamed = (re) => screen.getAllByRole('tab').find((t) => re.test(t.textContent))

  it('counts a group with unread on the tab and the subtitle, and its pill says where', async () => {
    window.localStorage.removeItem('sis_inbox_open_sections')
    authUser = { id: 'me-1', role: 'org_managed', org_role: 'campus_coordinator' }
    state.myConvos = [{ ...convo(1, 'Waiting'), last_message_sender_id: 'me-1' }]
    state.groups = [{ id: 'g1', name: 'Office team', audience: 'staff', member_count: 4,
      unread_count: 3, last_message_at: '2026-09-22T10:00:00Z' }]
    state.mineNeedsReply = 1 // the server's same number
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine' })
    expect(await screen.findByLabelText('3 unread in Group threads')).toBeInTheDocument()
    await waitFor(() => expect(tabNamed(/My messages/).textContent).toMatch(/My messages1$/))
    expect(screen.getByText(/ 1 unread\./)).toBeInTheDocument()
    // Not the 3 unread messages: threads, as the sidebar counts.
    expect(screen.queryByText(/ 3 unread\./)).toBeNull()
  })

  it('counts an unread thread once however many unread messages, on tab and subtitle alike', async () => {
    state.schoolConvos = [{ ...convo(1, 'Greta'), unread_count: 5, last_message_sender_id: 'u1' }]
    state.schoolGroups = [{ id: 'sg1', name: 'Cover', audience: 'staff', member_count: 3,
      unread_count: 2, last_message_at: '2026-09-22T10:00:00Z' }]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    await screen.findByText('Greta Family')
    await waitFor(() => expect(tabNamed(/inbox/).textContent).toMatch(/inbox2$/))
    expect(screen.getByText(/ 2 unread\./)).toBeInTheDocument()
  })

  it('says nothing is unread when the only thread is our turn done', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.myConvos = [{ ...convo(1, 'Pat'), unread_count: 0, last_message_sender_id: 'me-1' }]
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine' })
    await waitFor(() => expect(viewButton('Waiting')).toHaveTextContent('Waiting (1)'))
    expect(screen.queryByText(/ \d+ unread\./)).toBeNull()
  })

  // 13aa8bd0 (iCreate campus coordinator, /inbox?tab=mine, 2026-10-06): "It
  // says I have 5 new messages but I have no unread messages in my folder."
  // All five threads were read; they sat in Open because the parent wrote
  // last ("thank you") and nobody pressed Close. The badges count unread; the
  // Open view button keeps the needs-reply count (owner decision).
  it('does not count read Open threads on the tab or subtitle; the Open button still does', async () => {
    authUser = { id: 'me-1', role: 'org_managed', org_role: 'campus_coordinator' }
    state.myConvos = [1, 2, 3, 4, 5].map((n) => ({
      ...convo(n, `Parent${n}`), unread_count: 0, last_message_sender_id: `u${n}`,
    }))
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine' })
    await waitFor(() => expect(viewButton('Open')).toHaveTextContent('Open (5)'))
    expect(tabNamed(/My messages/).textContent).toMatch(/My messages$/)
    expect(screen.queryByText(/ \d+ unread\./)).toBeNull()
  })
})

// ecc73d0e (iCreate campus coordinator, /inbox?tab=mine): "I would like to
// delete a message that I sent by mistake." The inbox rendered bubbles with no
// actions at all. My messages: your own messages get Edit and Delete. School
// tab: only the messages the server marks can_delete (the ones this colleague
// wrote as the school), and only Delete.
// Text queries, not role queries: role queries over this whole page are slow
// enough in jsdom to time a test out.
describe('deleting your own message (ecc73d0e)', () => {
  it('My messages: own message shows Edit and Delete; theirs shows neither', async () => {
    authUser = { id: 'me-1', role: 'org_admin' }
    // Their word last, so the thread shows under the default Open view.
    state.myConvos = [{ ...convo(1, 'Ada'), last_message_sender_id: 'u1' }]
    state.myMessages = [
      { id: 'mm1', sender_id: 'u1', message_content: 'their note', created_at: '2026-08-30T11:00:00Z' },
      { id: 'mm2', sender_id: 'me-1', message_content: 'sent by mistake', created_at: '2026-08-30T12:00:00Z' },
    ]
    render(<SchoolInboxPage />, { route: '/inbox?tab=mine' })
    fireEvent.click(await screen.findByText('hello 1'))
    await screen.findByText('sent by mistake')
    expect(screen.getAllByText('Delete', { selector: 'button' })).toHaveLength(1)
    expect(screen.getAllByText('Edit', { selector: 'button' })).toHaveLength(1)
    fireEvent.click(screen.getByText('Delete', { selector: 'button' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/messages/mm2'))
  })

  it('School tab: Delete only on the colleague\'s own school message, through the school route', async () => {
    authUser = { id: 'me-1', role: 'org_admin' }
    state.schoolConvos = [{ ...convo(1, 'Kim'), last_message_sender_id: 'u1' }]
    state.schoolMessages = [
      { id: 'sm1', sender_id: 'u1', message_content: 'family asks', created_at: '2026-08-30T10:00:00Z' },
      { id: 'sm2', sender_id: 'inbox-1', sent_by_user_id: 'other', can_delete: false,
        message_content: 'colleague answered', created_at: '2026-08-30T11:00:00Z' },
      { id: 'sm3', sender_id: 'inbox-1', sent_by_user_id: 'me-1', can_delete: true,
        message_content: 'my wrong answer', created_at: '2026-08-30T12:00:00Z' },
    ]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    fireEvent.click(await screen.findByText('hello 1'))
    await screen.findByText('my wrong answer')
    // No edit as the school: there is no route for it.
    expect(screen.queryByText('Edit', { selector: 'button' })).toBeNull()
    expect(screen.getAllByText('Delete', { selector: 'button' })).toHaveLength(1)
    fireEvent.click(screen.getByText('Delete', { selector: 'button' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/school-inbox/messages/sm3'))
    expect(api.delete).not.toHaveBeenCalledWith('/api/messages/sm3')
  })
})

/**
 * Ticket e6cc5fe5 (iCreate campus coordinator, SIS /inbox): "Can we make our
 * drafts save when we switch out of messages and then come back to it?" The
 * page passes the composer a draft key for the signed-in person and thread.
 */
describe('SchoolInboxPage drafts (e6cc5fe5)', () => {
  const draftKeys = () => Array.from({ length: window.localStorage.length },
    (_, i) => window.localStorage.key(i)).filter((k) => k.startsWith('optio:message-draft:'))
  beforeEach(() => {
    draftKeys().forEach((k) => window.localStorage.removeItem(k))
    // Earlier tests in this file swap api.post's implementation and
    // clearAllMocks does not undo that; sends here start from a plain success.
    api.post.mockImplementation(() => Promise.resolve({ data: { success: true } }))
  })

  it('restores a reply after switching threads and coming back (e6cc5fe5)', async () => {
    state.schoolConvos = [convo(1, 'Greta'), convo(2, 'Pat')]
    render(<SchoolInboxPage />, { route: '/inbox?tab=school' })
    fireEvent.click(await screen.findByText('Greta Family'))
    fireEvent.change(await screen.findByPlaceholderText(/Reply as Hearthwood/),
      { target: { value: 'Half a reply to Greta' } })

    fireEvent.click(screen.getByText('Pat Family'))
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Reply as Hearthwood/).value).toBe(''))

    fireEvent.click(screen.getByText('Greta Family'))
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Reply as Hearthwood/).value).toBe('Half a reply to Greta'))
  })

  it('restores a reply after leaving the inbox and opening it again (e6cc5fe5)', async () => {
    state.schoolConvos = [convo(1, 'Greta')]
    const first = render(<SchoolInboxPage />, { route: '/inbox?tab=school&conversation=c1' })
    fireEvent.change(await screen.findByPlaceholderText(/Reply as Hearthwood/),
      { target: { value: 'Still writing' } })
    first.unmount()

    render(<SchoolInboxPage />, { route: '/inbox?tab=school&conversation=c1' })
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Reply as Hearthwood/).value).toBe('Still writing'))
  })

  it('keys the draft by the signed-in coordinator, not the shared school inbox (e6cc5fe5)', async () => {
    state.schoolConvos = [convo(1, 'Greta')]
    const first = render(<SchoolInboxPage />, { route: '/inbox?tab=school&conversation=c1' })
    fireEvent.change(await screen.findByPlaceholderText(/Reply as Hearthwood/),
      { target: { value: 'Mine, not my colleague\'s' } })
    expect(draftKeys()).toEqual(['optio:message-draft:me-1:school:org-1:dm:c1'])
    first.unmount()

    authUser = { id: 'me-2', role: 'org_admin' }
    render(<SchoolInboxPage />, { route: '/inbox?tab=school&conversation=c1' })
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Reply as Hearthwood/).value).toBe(''))
  })

  it('clears the draft once the reply sends (e6cc5fe5)', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.myConvos = [convo(2, 'Pat')]
    render(<SchoolInboxPage />)
    fireEvent.click(await screen.findByText('Pat Family'))
    fireEvent.change(await screen.findByPlaceholderText('Write a reply...'),
      { target: { value: 'On it' } })
    expect(draftKeys()).toHaveLength(1)
    fireEvent.click(screen.getByLabelText('Send message'))
    await waitFor(() => expect(draftKeys()).toHaveLength(0))
  })

  it('keeps the draft when the reply fails to send (e6cc5fe5)', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    state.myConvos = [convo(2, 'Pat')]
    api.post.mockImplementation((url) => (url.endsWith('/send')
      ? Promise.reject(Object.assign(new Error('500'), { response: { data: { error: 'boom' } } }))
      : Promise.resolve({ data: { success: true } })))
    render(<SchoolInboxPage />)
    fireEvent.click(await screen.findByText('Pat Family'))
    const box = await screen.findByPlaceholderText('Write a reply...')
    fireEvent.change(box, { target: { value: 'Did not go' } })
    fireEvent.click(screen.getByLabelText('Send message'))
    await waitFor(() => expect(box.value).toBe('Did not go'))
    expect(draftKeys()).toHaveLength(1)
  })
})
