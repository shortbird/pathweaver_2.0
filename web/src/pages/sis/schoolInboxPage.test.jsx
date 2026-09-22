import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The combined /inbox (messaging + inbox merged, 2026-08-31).
 *
 * The front office reads the shared school inbox and replies as the school;
 * a teacher reads their OWN threads (/api/messages) and replies as themself.
 * The Announcements tab holds the group composer that used to be /messaging.
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

// The board tab drags in TipTap; this page only has to mount it.
vi.mock('../../components/sis/BoardAnnouncementsTab', () => ({
  // Prints its orgId: the tab loads nothing without one, and the page once
  // handed it null for everybody but a superadmin.
  default: ({ orgId }) => <div>composer-stub {orgId || 'no-org'}</div>,
}))
// Realtime needs a Supabase socket; the hook is covered by its own tests.
vi.mock('../../hooks/api/useMessagingRealtime', () => ({
  default: vi.fn(),
  useMessagingRealtime: vi.fn(),
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
    fireEvent.click(screen.getByLabelText('Send message'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/school-inbox/conversations/u9/send',
        { content: 'Your spot is ready' }))
  })

  it('offers no New message button to a teacher — the shared inbox is the office\'s', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    render(<SchoolInboxPage />)
    await screen.findByRole('tab', { name: /^My messages/ })
    expect(screen.queryByRole('button', { name: 'New message' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Message a group' })).not.toBeInTheDocument()
  })

  // iCreate, 2026-09-17 (b32b2fca), from this tab: "Right now we can only send
  // to one person. I'm needing to message all the elementary school parents."
  it('opens the composer on Families from the school tab', async () => {
    render(<SchoolInboxPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Message a group' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Families' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/sis/messaging/family-audience')))
  })

  it('shows the announcements composer on its tab, for teachers too', async () => {
    authUser = { id: 'me-1', role: 'advisor' }
    render(<SchoolInboxPage />, { route: '/inbox?tab=announcements' })
    // With the org it is for -- not null -- or the list never loads.
    expect(await screen.findByText('composer-stub org-1')).toBeInTheDocument()
    // And the tabs switch back to threads.
    fireEvent.click(screen.getByRole('tab', { name: /^My messages/ }))
    expect(screen.queryByText(/composer-stub/)).not.toBeInTheDocument()
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
    expect(await screen.findByRole('tab', { name: /^Hearthwood/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^My messages/ })).toBeInTheDocument()
  })

  it('opens an admin on the school queue, which is the one they work', async () => {
    authUser = { id: 'me-1', role: 'org_admin' }
    state.schoolConvos = [{
      id: 'c-school', other_user: { id: 'parent-1', first_name: 'Dana', last_name: 'P' },
      last_message_preview: 'from a parent', unread_count: 0,
      last_message_at: '2026-08-30T12:00:00Z', last_message_sender_id: 'parent-1',
    }]
    render(<SchoolInboxPage />)
    expect(await screen.findByText('from a parent')).toBeInTheDocument()
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
    render(<SchoolInboxPage />)
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
    await screen.findByRole('tab', { name: /^My messages/ })
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
    render(<SchoolInboxPage />)
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
    render(<SchoolInboxPage />)
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
    render(<SchoolInboxPage />)
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
    render(<SchoolInboxPage />)
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
    render(<SchoolInboxPage />)
    fireEvent.click(screen.getByText('All'))
    fireEvent.click(await screen.findByText('Tyler Family'))
    expect(await screen.findByText(/· Seen/)).toBeInTheDocument()
  })

  it('ignores a ?conversation= that is not in this inbox', async () => {
    state.schoolConvos = [convo(1, 'Greta')]
    render(<SchoolInboxPage />, { route: '/inbox?conversation=not-mine' })
    await screen.findByText('Greta Family')
    expect(api.get).not.toHaveBeenCalledWith('/api/school-inbox/conversations/not-mine')
  })
})
