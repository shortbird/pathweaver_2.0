/**
 * A group chat can be made without a name.
 *
 * Ticket 9c774b30 (iCreate, campus coordinator, web /messages): "is there a
 * way we can have a group chat without making a whole GROUP thread? I would
 * like to just send a message to two other people." The form required a name
 * before it would create anything. A blank name is now sent as blank and the
 * server names the group from its members' first names
 * (message_compose_service.default_group_name), so the client builds no name.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CreateGroupModal from './CreateGroupModal'

const createGroup = { mutateAsync: vi.fn().mockResolvedValue({ group: { id: 'g1' } }), isPending: false }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('../../hooks/api/useDirectMessages', () => ({
  useMessagingContacts: () => ({
    data: {
      contacts: [
        { id: 'ada', first_name: 'Ada', last_name: 'L' },
        { id: 'sam', first_name: 'Sam', last_name: 'P' }
      ]
    }
  })
}))
vi.mock('../../hooks/api/useGroupMessages', () => ({ useCreateGroup: () => createGroup }))

const createButton = () => screen.getByRole('button', { name: /create group/i })

describe('CreateGroupModal without a name', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a group of two people with no name and leaves the name to the server', async () => {
    const onGroupCreated = vi.fn()
    render(<CreateGroupModal isOpen onClose={vi.fn()} onGroupCreated={onGroupCreated} />)

    fireEvent.click(screen.getByText('Ada L'))
    fireEvent.click(screen.getByText('Sam P'))
    expect(createButton()).not.toBeDisabled()
    fireEvent.click(createButton())

    await waitFor(() => expect(createGroup.mutateAsync).toHaveBeenCalled())
    const sent = createGroup.mutateAsync.mock.calls[0][0]
    expect(sent.name).toBe('')
    expect(sent.memberIds).toEqual(['ada', 'sam'])
    expect(onGroupCreated).toHaveBeenCalledWith({ id: 'g1' })
  })

  it('says the name is optional', () => {
    render(<CreateGroupModal isOpen onClose={vi.fn()} />)
    expect(screen.getByText('(optional)')).toBeInTheDocument()
  })

  it('with no name and nobody picked there is nothing to create', () => {
    render(<CreateGroupModal isOpen onClose={vi.fn()} />)
    expect(createButton()).toBeDisabled()
  })

  it('a typed name is still sent as typed', async () => {
    render(<CreateGroupModal isOpen onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/group name/i), { target: { value: ' Tuesday cover ' } })
    fireEvent.click(createButton())
    await waitFor(() => expect(createGroup.mutateAsync).toHaveBeenCalled())
    expect(createGroup.mutateAsync.mock.calls[0][0].name).toBe('Tuesday cover')
  })
})
