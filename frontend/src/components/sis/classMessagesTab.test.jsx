import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'teacher-1' } }),
}))

// The chat windows are covered by their own tests; here we only care that the
// tab hands them the right conversation.
vi.mock('../communication/GroupChatWindow', () => ({
  default: ({ group }) => <div data-testid="group-chat">group:{group.id}</div>,
}))
vi.mock('../communication/ChatWindow', () => ({
  default: ({ conversation }) => <div data-testid="dm-chat">dm:{conversation.id}</div>,
}))

const { useConversations, useGroups } = vi.hoisted(() => ({
  useConversations: vi.fn(),
  useGroups: vi.fn(),
}))
vi.mock('../../hooks/api/useDirectMessages', () => ({ useConversations }))
vi.mock('../../hooks/api/useGroupMessages', () => ({ useGroups }))

import ClassMessagesTab from './ClassMessagesTab'

const PAYLOAD = {
  class: { id: 'c1', name: 'Musical Theater' },
  group: { id: 'g1', name: 'Musical Theater Class Chat', announcement_only: false },
  students: [
    { id: 's1', name: 'Ada Byron', preferred_name: null, avatar_url: null, relationship: 'student' },
    { id: 's2', name: 'Blaise Pascal', preferred_name: null, avatar_url: null, relationship: 'student' },
  ],
  teachers: [
    { id: 't2', name: 'Grace Hopper', preferred_name: null, avatar_url: null, relationship: 'teacher' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  useConversations.mockReturnValue({ data: { conversations: [] } })
  useGroups.mockReturnValue({ data: { groups: [] } })
})

describe('ClassMessagesTab', () => {
  it('loads the class messaging payload for the org', async () => {
    api.get.mockResolvedValue({ data: PAYLOAD })
    render(<ClassMessagesTab classId="c1" orgId="org1" className="Musical Theater" />)
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        '/api/sis/teacher/classes/c1/messaging?organization_id=org1'))
  })

  it('opens the class chat first', async () => {
    api.get.mockResolvedValue({ data: PAYLOAD })
    render(<ClassMessagesTab classId="c1" orgId="org1" className="Musical Theater" />)
    expect(await screen.findByTestId('group-chat')).toHaveTextContent('group:g1')
  })

  it('switches to a one-to-one conversation with a student', async () => {
    api.get.mockResolvedValue({ data: PAYLOAD })
    render(<ClassMessagesTab classId="c1" orgId="org1" className="Musical Theater" />)
    await screen.findByTestId('group-chat')

    await userEvent.click(screen.getByText('Ada Byron'))

    expect(await screen.findByTestId('dm-chat')).toHaveTextContent('dm:s1')
    expect(screen.queryByTestId('group-chat')).not.toBeInTheDocument()
  })

  it('lists co-teachers alongside students (never the viewer themselves)', async () => {
    api.get.mockResolvedValue({ data: PAYLOAD })
    render(<ClassMessagesTab classId="c1" orgId="org1" className="Musical Theater" />)
    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument()
    expect(screen.getByText('Students (2)')).toBeInTheDocument()
  })

  it('filters the people list by search', async () => {
    api.get.mockResolvedValue({ data: PAYLOAD })
    render(<ClassMessagesTab classId="c1" orgId="org1" className="Musical Theater" />)
    await screen.findByText('Ada Byron')

    await userEvent.type(screen.getByLabelText('Search people in this class'), 'blaise')

    expect(screen.getByText('Blaise Pascal')).toBeInTheDocument()
    expect(screen.queryByText('Ada Byron')).not.toBeInTheDocument()
  })

  it('shows unread badges from the conversation list', async () => {
    api.get.mockResolvedValue({ data: PAYLOAD })
    useConversations.mockReturnValue({
      data: { conversations: [{ id: 'conv1', other_user: { id: 's2' }, unread_count: 3 }] },
    })
    useGroups.mockReturnValue({ data: { groups: [{ id: 'g1', unread_count: 12 }] } })
    render(<ClassMessagesTab classId="c1" orgId="org1" className="Musical Theater" />)

    expect(await screen.findByText('3')).toBeInTheDocument()
    expect(screen.getByText('9+')).toBeInTheDocument()
  })

  it('explains an empty class instead of rendering a dead chat', async () => {
    api.get.mockResolvedValue({ data: { ...PAYLOAD, group: null, students: [], teachers: [] } })
    render(<ClassMessagesTab classId="c1" orgId="org1" className="Musical Theater" />)
    expect(await screen.findByText('The class chat starts once a student is enrolled.')).toBeInTheDocument()
    expect(screen.getByText('No students enrolled yet.')).toBeInTheDocument()
  })

  it('surfaces a load failure', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Class not found' } } })
    render(<ClassMessagesTab classId="c1" orgId="org1" className="Musical Theater" />)
    expect(await screen.findByText('Class not found')).toBeInTheDocument()
  })
})
