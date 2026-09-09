import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ConversationList from './ConversationList'

let authState = { user: { id: 'u1', role: 'student' } }
let mockContacts = []

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../services/api', () => ({
  parentAPI: { getMyChildren: vi.fn().mockResolvedValue({ data: { children: [] } }) },
  observerAPI: { getMyObservers: vi.fn().mockResolvedValue({ data: { observers: [] } }) }
}))
vi.mock('../../hooks/api/useDirectMessages', () => ({
  useMessagingContacts: () => ({ data: { contacts: mockContacts } })
}))

const conversations = [
  { id: 's1', other_user: { id: 's1', first_name: 'Sam', last_name: 'Smith', role: 'student' }, last_message_at: '2025-01-02T00:00:00Z', last_message_preview: 'Hi Sam', unread_count: 2 }
]
const groups = [
  { id: 'g1', name: 'Study Group', last_message_at: '2025-01-01T00:00:00Z', unread_count: 0, member_count: 3 }
]

// `route` seeds the URL: the list reads ?user=<id> to open a deep-linked thread.
function renderList(props = {}, { route = '/messages' } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={client}>
        <ConversationList
          conversations={conversations}
          groupConversations={groups}
          selectedConversation={null}
          onSelectConversation={vi.fn()}
          isLoading={false}
          onCreateGroup={vi.fn()}
          {...props}
        />
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe('ConversationList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: { id: 'u1', role: 'student' } }
    mockContacts = [
      { id: 's1', first_name: 'Sam', last_name: 'Smith', role: 'student', relationship: 'student' },
      { id: 'sup', display_name: 'Optio Support', relationship: 'support' }
    ]
  })

  it('splits active conversations from the contacts directory', async () => {
    renderList()
    await waitFor(() => expect(screen.getByText('Conversations')).toBeInTheDocument())
    // Active thread (Sam) with its preview, plus the group, under Conversations
    expect(screen.getByText('Sam Smith')).toBeInTheDocument()
    expect(screen.getByText('Hi Sam')).toBeInTheDocument()
    expect(screen.getByText('Study Group')).toBeInTheDocument()
  })

  it('pins Optio Support below the list instead of burying it in Contacts', async () => {
    renderList()
    await waitFor(() => expect(screen.getByText('Need help? Message Optio')).toBeInTheDocument())
    // It is the pinned row, not a directory entry: no Contacts section is left
    // once support is the only contact without a thread.
    expect(screen.queryByText('Contacts')).not.toBeInTheDocument()
  })

  it('opens the support thread from the pinned row', async () => {
    const onSelect = vi.fn()
    renderList({ onSelectConversation: onSelect })
    await waitFor(() => expect(screen.getByText('Need help? Message Optio')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Need help? Message Optio'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'sup' }))
  })

  it('does not render relationship pills', () => {
    renderList()
    expect(screen.queryByText('Student')).not.toBeInTheDocument()
    expect(screen.queryByText('Advisor')).not.toBeInTheDocument()
  })

  it('filters by search query', async () => {
    renderList()
    await waitFor(() => expect(screen.getByText('Sam Smith')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'Study' } })
    expect(screen.getByText('Study Group')).toBeInTheDocument()
    expect(screen.queryByText('Sam Smith')).not.toBeInTheDocument()
  })

  it('auto-selects the most recent conversation on desktop', async () => {
    const onSelect = vi.fn()
    renderList({ onSelectConversation: onSelect })
    await waitFor(() => expect(onSelect).toHaveBeenCalled())
    expect(onSelect.mock.calls[0][0].id).toBe('s1')
  })

  it('shows the New group button only for users who can create groups', () => {
    renderList()
    expect(screen.queryByText('New group')).not.toBeInTheDocument()
    authState = { user: { id: 'a1', role: 'advisor' } }
    renderList()
    expect(screen.getByText('New group')).toBeInTheDocument()
  })

  // ?user=<id> is how "Message Dana" on the carpool board arrives at Messages:
  // the board links out instead of composing a one-shot DM of its own.
  describe('the ?user= deep link', () => {
    it('opens that person\'s thread on arrival', async () => {
      mockContacts = [
        { id: 'p9', first_name: 'Dana', last_name: 'Cole', relationship: 'parent' }
      ]
      const onSelectConversation = vi.fn()
      renderList({ onSelectConversation }, { route: '/messages?user=p9' })
      await waitFor(() => expect(onSelectConversation).toHaveBeenCalled())
      expect(onSelectConversation.mock.calls[0][0].other_user.id).toBe('p9')
    })

    it('stays on the list when that person is not a contact of this account', async () => {
      mockContacts = []
      const onSelectConversation = vi.fn()
      renderList({ onSelectConversation, conversations: [], groupConversations: [] },
        { route: '/messages?user=stranger' })
      await waitFor(() => expect(screen.getByText('No conversations yet')).toBeInTheDocument())
      expect(onSelectConversation).not.toHaveBeenCalled()
    })
  })

  it('shows an empty state when there is nothing to show', () => {
    mockContacts = []
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <ConversationList
            conversations={[]}
            groupConversations={[]}
            selectedConversation={{ id: 'x' }}
            onSelectConversation={vi.fn()}
            isLoading={false}
          />
        </QueryClientProvider>
      </MemoryRouter>
    )
    expect(screen.getByText('No conversations yet')).toBeInTheDocument()
  })

  // A parent of three reported the class threads as unusable on 2026-09-09:
  // 37 rows named after the class and nothing else, several sharing a name,
  // "so I would have to look it up before I can even respond." The mobile app
  // was fixed first; these are the same guarantees on the web list.
  describe('a guardian\'s class chats', () => {
    const kid = (id, first_name) => ({ id, first_name, last_name: 'T', display_name: first_name })
    const classChat = (id, name, students, meeting = null) => ({
      id, name, member_count: 4, unread_count: 0,
      last_message_at: '2025-01-03T00:00:00Z', last_message_preview: 'See you then',
      source_class_id: `c-${id}`, for_students: students, class_meeting: meeting
    })

    const threeChildren = [
      classChat('g1', 'Lego Lab Parent Chat', [kid('z', 'Zayah')]),
      classChat('g2', 'Peak Play PE Parent Chat', [kid('d', 'Daxton')],
        { day_of_week: 2, start_time: '09:30:00' }),
      classChat('g3', 'Peak Play PE Parent Chat', [kid('d', 'Daxton')],
        { day_of_week: 4, start_time: '14:00:00' })
    ]

    it('groups them under a heading per child, and out of Conversations', async () => {
      renderList({ groupConversations: threeChildren })

      await waitFor(() => expect(screen.getByText("Daxton's classes")).toBeInTheDocument())
      expect(screen.getByText("Zayah's classes")).toBeInTheDocument()
      // The DM is still in Conversations; the class chats are not listed twice.
      expect(screen.getByText('Sam Smith')).toBeInTheDocument()
      expect(screen.getAllByText('Lego Lab Parent Chat')).toHaveLength(1)
    })

    it('tells two same-named chats apart by when the class meets', async () => {
      renderList({ groupConversations: threeChildren })

      await waitFor(() => expect(screen.getAllByText('Peak Play PE Parent Chat')).toHaveLength(2))
      expect(screen.getByText('Tue 9:30 AM')).toBeInTheDocument()
      expect(screen.getByText('Thu 2:00 PM')).toBeInTheDocument()
    })

    it('lists a shared class under both children, and names them on the row', async () => {
      const shared = classChat('gs', 'Sword of Truth Parent Chat',
        [kid('d', 'Daxton'), kid('r', 'Rivers')])
      renderList({ groupConversations: [...threeChildren, shared] })

      await waitFor(() => expect(screen.getByText("Rivers's classes")).toBeInTheDocument())
      expect(screen.getAllByText('Sword of Truth Parent Chat')).toHaveLength(2)
      expect(screen.getAllByText('Daxton, Rivers')).toHaveLength(2)
    })

    it('finds a child\'s classes by searching the child\'s name', async () => {
      renderList({ groupConversations: threeChildren })

      await waitFor(() => expect(screen.getByText('Lego Lab Parent Chat')).toBeInTheDocument())
      fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'Daxton' } })

      expect(screen.getAllByText('Peak Play PE Parent Chat')).toHaveLength(2)
      expect(screen.queryByText('Lego Lab Parent Chat')).not.toBeInTheDocument()
    })

    // Splitting 36 chats by child made the list readable; folding two of the
    // three children away is what makes it short.
    describe('folding a child away', () => {
      beforeEach(() => localStorage.clear())

      it('starts open and hides the rows when the header is clicked', async () => {
        renderList({ groupConversations: threeChildren })

        await waitFor(() => expect(screen.getByText('Lego Lab Parent Chat')).toBeInTheDocument())
        fireEvent.click(screen.getByText("Zayah's classes"))

        expect(screen.queryByText('Lego Lab Parent Chat')).not.toBeInTheDocument()
        // Only that child folds; her siblings are untouched.
        expect(screen.getAllByText('Peak Play PE Parent Chat')).toHaveLength(2)
      })

      it('opens again on a second click', async () => {
        renderList({ groupConversations: threeChildren })

        await waitFor(() => expect(screen.getByText("Zayah's classes")).toBeInTheDocument())
        fireEvent.click(screen.getByText("Zayah's classes"))
        fireEvent.click(screen.getByText("Zayah's classes"))

        expect(screen.getByText('Lego Lab Parent Chat')).toBeInTheDocument()
      })

      it('remembers the fold across a remount', async () => {
        const first = renderList({ groupConversations: threeChildren })
        await waitFor(() => expect(screen.getByText("Zayah's classes")).toBeInTheDocument())
        fireEvent.click(screen.getByText("Zayah's classes"))
        first.unmount()

        renderList({ groupConversations: threeChildren })
        await waitFor(() => expect(screen.getByText("Zayah's classes")).toBeInTheDocument())
        expect(screen.queryByText('Lego Lab Parent Chat')).not.toBeInTheDocument()
      })

      // A closed section that silently swallowed a message would be worse than
      // the flat list this replaced.
      it('keeps the unread count on the header while it is closed', async () => {
        const unread = [
          { ...threeChildren[0], unread_count: 3 },
          threeChildren[1], threeChildren[2]
        ]
        renderList({ groupConversations: unread })

        await waitFor(() => expect(screen.getByText("Zayah's classes")).toBeInTheDocument())
        fireEvent.click(screen.getByText("Zayah's classes"))

        expect(screen.queryByText('Lego Lab Parent Chat')).not.toBeInTheDocument()
        expect(screen.getByText('3')).toBeInTheDocument()
      })

      it('shows a match inside a folded section rather than hiding it', async () => {
        renderList({ groupConversations: threeChildren })
        await waitFor(() => expect(screen.getByText("Zayah's classes")).toBeInTheDocument())
        fireEvent.click(screen.getByText("Zayah's classes"))
        expect(screen.queryByText('Lego Lab Parent Chat')).not.toBeInTheDocument()

        fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'Lego' } })
        expect(screen.getByText('Lego Lab Parent Chat')).toBeInTheDocument()

        // Clearing the box restores the fold; searching did not undo it.
        fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: '' } })
        expect(screen.queryByText('Lego Lab Parent Chat')).not.toBeInTheDocument()
      })

      it('survives a browser that refuses storage', async () => {
        const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
          throw new Error('private mode')
        })
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
          throw new Error('private mode')
        })

        renderList({ groupConversations: threeChildren })
        await waitFor(() => expect(screen.getByText("Zayah's classes")).toBeInTheDocument())
        fireEvent.click(screen.getByText("Zayah's classes"))
        expect(screen.queryByText('Lego Lab Parent Chat')).not.toBeInTheDocument()

        getItem.mockRestore()
        setItem.mockRestore()
      })
    })

    it('leaves a parent of one child, and a teacher, with the flat list', async () => {
      renderList({ groupConversations: [threeChildren[0]] })

      await waitFor(() => expect(screen.getByText('Conversations')).toBeInTheDocument())
      expect(screen.queryByText("Zayah's classes")).not.toBeInTheDocument()
      expect(screen.getByText('Lego Lab Parent Chat')).toBeInTheDocument()
    })
  })

  // The perf regression this list shipped with: ConversationItem was declared
  // inside ConversationList's body, so every render produced a new component
  // type and React remounted every row -- <img> included. Typing one character
  // in the search box tore down and re-fetched every avatar on screen.
  //
  // Identity of the DOM node across a keystroke is the observable proof the row
  // was reused rather than rebuilt. If someone moves these components back
  // inside the parent, this fails.
  it('reuses avatar DOM nodes when the search query changes', async () => {
    mockContacts = [
      { id: 'c9', first_name: 'Cora', last_name: 'Vance', role: 'advisor',
        relationship: 'advisor', avatar_url: 'https://example.test/cora.jpg' }
    ]
    renderList()

    const before = await screen.findByAltText('Cora Vance')
    fireEvent.change(
      screen.getByPlaceholderText('Search people and conversations...'),
      { target: { value: 'Cor' } }
    )
    const after = await screen.findByAltText('Cora Vance')

    expect(after).toBe(before)
  })

  it('defers offscreen avatar loading', async () => {
    mockContacts = [
      { id: 'c9', first_name: 'Cora', last_name: 'Vance', role: 'advisor',
        relationship: 'advisor', avatar_url: 'https://example.test/cora.jpg' }
    ]
    renderList()

    const img = await screen.findByAltText('Cora Vance')
    expect(img).toHaveAttribute('loading', 'lazy')
    // Explicit dimensions keep the list from reflowing as avatars arrive.
    expect(img).toHaveAttribute('width', '40')
    expect(img).toHaveAttribute('height', '40')
  })

  // Every one of these URLs fails eventually: a signed storage URL expires after
  // an hour, Google's CDN throttles a burst of OAuth avatars, an object gets
  // deleted. The row must degrade to the initial, not Chrome's broken-image
  // glyph with the alt text spilling out of a 40px circle.
  it('falls back to the initial when an avatar fails to load', async () => {
    mockContacts = [
      { id: 'c9', first_name: 'Cora', last_name: 'Vance', role: 'advisor',
        relationship: 'advisor', avatar_url: 'https://example.test/gone.jpg' }
    ]
    renderList()

    const img = await screen.findByAltText('Cora Vance')
    fireEvent.error(img)

    expect(screen.queryByAltText('Cora Vance')).not.toBeInTheDocument()
    expect(await screen.findByText('C')).toBeInTheDocument()
  })
})
