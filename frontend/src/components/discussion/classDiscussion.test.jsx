import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import ClassDiscussion from './ClassDiscussion'

const POSTS = [{
  id: 'p1', body: 'hop on the table', author_name: 'Tarien', created_at: '2026-08-27T19:43:00Z',
  deleted: false, can_delete: true, replies: [],
}]

const board = (extra = {}) => ({
  data: { success: true, posts: POSTS, is_moderator: false, can_post: true, discussion_enabled: true, ...extra },
})

beforeEach(() => {
  vi.clearAllMocks()
  api.patch.mockResolvedValue({ data: { success: true } })
})

// Gryffin, 2026-08-29: "is there a way that teachers and parents see a group
// chat?" The board now answers with what the viewer may do, and the component
// draws exactly that.
describe('ClassDiscussion — who may do what', () => {
  it('a guardian reads the board with no way to post or reply', async () => {
    api.get.mockResolvedValue(board({ can_post: false }))
    render(<ClassDiscussion classId="c1" title="Earth Science" />)

    expect(await screen.findByText('hop on the table')).toBeInTheDocument()
    expect(screen.getByText('Earth Science')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Share something with the class...')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Turn off/ })).not.toBeInTheDocument()
  })

  it('a student keeps the composers and never sees the switch', async () => {
    api.get.mockResolvedValue(board())
    render(<ClassDiscussion questId="q1" />)

    expect(await screen.findByText('hop on the table')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Share something with the class...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Turn off/ })).not.toBeInTheDocument()
  })

  it('the teacher can switch the board off, and the history stays', async () => {
    api.get.mockResolvedValueOnce(board({ is_moderator: true }))
      .mockResolvedValueOnce(board({ is_moderator: true, can_post: false, discussion_enabled: false }))
    render(<ClassDiscussion classId="c1" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Turn off for this class' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/classes/c1/discussion/settings', { enabled: false }))

    expect(await screen.findByRole('button', { name: 'Turn on for this class' })).toBeInTheDocument()
    expect(screen.getByText(/Discussion is off/)).toBeInTheDocument()
    expect(screen.getByText('hop on the table')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Share something with the class...')).not.toBeInTheDocument()
  })

  it('a 403 (not a participant, or the board is off) hides the board entirely', async () => {
    api.get.mockRejectedValue({ response: { status: 403 } })
    const { container } = render(<ClassDiscussion classId="c1" />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
