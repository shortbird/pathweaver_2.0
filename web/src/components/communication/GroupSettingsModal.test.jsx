/**
 * The only admin of a group is offered Delete, not Leave.
 *
 * Karin Jaccard, iCreate, 2026-09-19: she made a group with herself as its
 * only member and pressed Leave. The backend refuses that (an ownerless group
 * is what the rule prevents), and this modal offered nothing else, so the
 * click was a 403 and a toast every time (OPTIO-WEB 7742875918). Mobile had
 * Delete all along.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GroupSettingsModal from './GroupSettingsModal'

let groupDetails = { data: null, refetch: vi.fn() }
const leaveGroup = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }
const deleteGroup = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }
const confirm = vi.fn().mockResolvedValue(true)

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => confirm }))
vi.mock('../../hooks/api/useGroupMessages', () => ({
  useGroup: () => groupDetails,
  useAvailableMembers: () => ({ data: null }),
  useUpdateGroup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLeaveGroup: () => leaveGroup,
  useDeleteGroup: () => deleteGroup,
  useUpdateGroupSettings: () => ({ mutateAsync: vi.fn(), isPending: false })
}))

const member = (user_id, role) => ({ user_id, role, user: { first_name: user_id, last_name: '' } })
const groupWith = (members) => ({ data: { group: { id: 'g1', name: 'Panther Teachers', members } }, refetch: vi.fn() })

describe('GroupSettingsModal footer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    confirm.mockResolvedValue(true)
  })

  it('the only admin sees Delete, not Leave, and the delete goes through', async () => {
    groupDetails = groupWith([member('u1', 'admin')])
    const onClose = vi.fn()
    render(<GroupSettingsModal isOpen onClose={onClose} group={{ id: 'g1', name: 'Panther Teachers' }} />)

    expect(screen.queryByText('Leave Group')).not.toBeInTheDocument()
    expect(screen.getByText(/only admin, so you cannot leave/i)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Delete Group'))
    await waitFor(() => expect(deleteGroup.mutateAsync).toHaveBeenCalledWith('g1'))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Panther Teachers'))
    expect(onClose).toHaveBeenCalled()
    expect(leaveGroup.mutateAsync).not.toHaveBeenCalled()
  })

  it('an admin with a co-admin can leave, and can still delete', () => {
    groupDetails = groupWith([member('u1', 'admin'), member('u2', 'admin')])
    render(<GroupSettingsModal isOpen onClose={vi.fn()} group={{ id: 'g1' }} />)

    expect(screen.getByText('Leave Group')).toBeInTheDocument()
    expect(screen.getByText('Delete Group')).toBeInTheDocument()
  })

  it('a plain member can only leave', () => {
    groupDetails = groupWith([member('u2', 'admin'), member('u1', 'member')])
    render(<GroupSettingsModal isOpen onClose={vi.fn()} group={{ id: 'g1' }} />)

    expect(screen.getByText('Leave Group')).toBeInTheDocument()
    expect(screen.queryByText('Delete Group')).not.toBeInTheDocument()
  })

  it('a cancelled confirm deletes nothing', async () => {
    groupDetails = groupWith([member('u1', 'admin')])
    confirm.mockResolvedValue(false)
    render(<GroupSettingsModal isOpen onClose={vi.fn()} group={{ id: 'g1' }} />)

    fireEvent.click(screen.getByText('Delete Group'))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(deleteGroup.mutateAsync).not.toHaveBeenCalled()
  })
})

describe('GroupSettingsModal Add Members', () => {
  // Ticket 6da3f51f (iCreate, 2026-10-12): "I am not sure who started the Sub
  // Pool group chat, but we need to be able to add people to that group." A
  // parent started it and was its only admin; the school's admin, a plain
  // member, had no way to add anyone. The server now says who may add.
  beforeEach(() => vi.clearAllMocks())

  const withCanAdd = (members, can_add_members) => ({
    data: { group: { id: 'g1', name: 'Sub Pool', members, can_add_members } }, refetch: vi.fn(),
  })

  it('a plain member the server allows (the school admin) sees Add Members', () => {
    groupDetails = withCanAdd([member('u2', 'admin'), member('u1', 'member')], true)
    render(<GroupSettingsModal isOpen onClose={vi.fn()} group={{ id: 'g1' }} />)
    expect(screen.getByText('Add Members')).toBeInTheDocument()
  })

  it('a plain member the server refuses does not', () => {
    groupDetails = withCanAdd([member('u2', 'admin'), member('u1', 'member')], false)
    render(<GroupSettingsModal isOpen onClose={vi.fn()} group={{ id: 'g1' }} />)
    expect(screen.queryByText('Add Members')).not.toBeInTheDocument()
  })

  it('without the field, a group admin still sees it and a member does not', () => {
    groupDetails = groupWith([member('u1', 'admin')])
    const { unmount } = render(<GroupSettingsModal isOpen onClose={vi.fn()} group={{ id: 'g1' }} />)
    expect(screen.getByText('Add Members')).toBeInTheDocument()
    unmount()
    groupDetails = groupWith([member('u2', 'admin'), member('u1', 'member')])
    render(<GroupSettingsModal isOpen onClose={vi.fn()} group={{ id: 'g1' }} />)
    expect(screen.queryByText('Add Members')).not.toBeInTheDocument()
  })
})
