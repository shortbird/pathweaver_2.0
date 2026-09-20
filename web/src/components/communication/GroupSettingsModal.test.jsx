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
