/**
 * ChildFriendsCard -- the parent's consent, and what "off" costs.
 *
 * What's tested is the part that would be unsafe or misleading if it broke:
 * that turning Friends on is one deliberate click, that turning it off names
 * how many friends it removes before it does, that the rules are written to
 * the policy endpoint and nothing else, and that a parent who may not set
 * the policy is told rather than shown dead controls.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '../../services/api'
import ChildFriendsCard from './ChildFriendsCard'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() }
}))

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))

vi.mock('@heroicons/react/24/outline', () => ({
  UserGroupIcon: (props) => <svg data-testid="friends-icon" {...props} />,
}))
vi.mock('qrcode.react', () => ({ QRCodeSVG: () => <svg data-testid="qr" /> }))


const ON = {
  enabled: true, approval_mode: 'auto', request_sources: ['classmates', 'code', 'link'],
  friends_can: ['see', 'comment'], origin: 'child', reason: null,
}
const OFF = { enabled: false, origin: 'none', reason: null, who_can_enable: 'parent',
              request_sources: [], friends_can: [] }

const mountWith = (policy, { canSet = true, friends = 0 } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.endsWith('/policy')) return Promise.resolve({ data: { data: { policy, can_set: canSet } } })
    if (url.endsWith('/friends-count')) return Promise.resolve({ data: { data: { active: friends } } })
    return Promise.resolve({ data: {} })
  })
  api.put.mockImplementation((url, body) => Promise.resolve({
    data: { data: { policy: { ...policy, ...body }, revoked_count: body.enabled === false ? friends : 0 } },
  }))
  return render(<ChildFriendsCard studentId="s1" studentName="Robin" />)
}

describe('ChildFriendsCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('turns Friends on with one click and says it is the consent', async () => {
    mountWith(OFF)
    expect(await screen.findByText(/turning friends on is your consent/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /turn on/i }))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/connections/children/s1/policy', { enabled: true })
    })
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/friends is on for robin/i))
  })

  it('names how many friends turning off removes, before it does', async () => {
    mountWith(ON, { friends: 3 })
    await userEvent.click(await screen.findByRole('button', { name: /turn off/i }))

    expect(await screen.findByText(/this removes 3 friends/i)).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /turn friends off/i }))
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/connections/children/s1/policy', { enabled: false })
    })
    expect(toast.success).toHaveBeenCalledWith('3 friends removed')
  })

  it('lets the parent keep it on from the confirm step', async () => {
    mountWith(ON, { friends: 1 })
    await userEvent.click(await screen.findByRole('button', { name: /turn off/i }))
    await userEvent.click(await screen.findByRole('button', { name: /keep it on/i }))

    expect(screen.queryByText(/this removes/i)).toBeNull()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('writes ask-me-first as an approval mode', async () => {
    mountWith(ON)
    await userEvent.click(await screen.findByLabelText(/ask me first/i))
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/connections/children/s1/policy',
        { approval_mode: 'ask_first' })
    })
  })

  it('writes the request sources as a list', async () => {
    mountWith(ON)
    await userEvent.click(await screen.findByLabelText(/anyone at their school/i))
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/connections/children/s1/policy',
        { request_sources: ['classmates', 'code', 'link', 'school'] })
    })
  })

  it('keeps seeing as the floor and toggles commenting', async () => {
    mountWith(ON)
    const see = await screen.findByLabelText(/see robin/i)
    expect(see).toBeDisabled()
    await userEvent.click(screen.getByLabelText(/comment on robin/i))
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/connections/children/s1/policy',
        { friends_can: ['see'] })
    })
  })

  it('shows the state without controls to an adult who may not set it', async () => {
    mountWith({ ...ON }, { canSet: false })
    expect(await screen.findByText(/friends: on/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /turn off/i })).toBeNull()
  })

  it('says so when the school has Friends off', async () => {
    mountWith({ ...OFF, origin: 'module_off' })
    expect(await screen.findByText(/not turned on at robin/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /turn on/i })).toBeNull()
  })

  it('connects the child by another student\'s code, through student scope', async () => {
    mountWith(ON)
    api.post.mockResolvedValue({ data: { data: { id: 'c-9', status: 'pending_addressee' } } })
    const input = await screen.findByLabelText(/enter their code/i)
    await userEvent.type(input, 'abcd2345')
    await userEvent.click(screen.getByRole('button', { name: /send request/i }))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/connections/request', { code: 'ABCD2345', student_id: 's1' })
    })
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/request sent/i))
  })

  it('mints the child\'s own code for the other family', async () => {
    mountWith(ON)
    api.post.mockResolvedValue({ data: { data: { code: 'WXYZ2345', expires_at: 'x' } } })
    await userEvent.click(await screen.findByRole('button', { name: /get robin.s code/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/connections/code', { student_id: 's1' }))
    expect(await screen.findByText('WXYZ2345')).toBeInTheDocument()
    expect(screen.getByTestId('qr')).toBeInTheDocument()
  })

  it('surfaces the server refusal', async () => {
    mountWith(OFF)
    api.put.mockRejectedValue({ response: { data: { error: 'Not authorized' } } })
    await userEvent.click(await screen.findByRole('button', { name: /turn on/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Not authorized'))
  })
})
