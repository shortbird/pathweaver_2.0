import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import StaffComposeModal from './StaffComposeModal'

/**
 * Writing to several staff at once.
 *
 * The console had one way to reach teachers: pick one person, and do it again.
 * The only multi-select in it was the announcement composer, which is a
 * broadcast — no thread, no replies (iCreate, 2026-09-10).
 *
 * What these pin is the part that goes quietly wrong: which shape the send
 * takes, and who ends up in the room.
 */

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const PEOPLE = [
  { id: 'ada', name: 'Ada L', first_name: 'Ada', roles: ['advisor'], role_labels: ['Teacher'] },
  { id: 'sam', name: 'Sam P', first_name: 'Sam', roles: ['advisor'], role_labels: ['Teacher'] },
  { id: 'rae', name: 'Rae Q', first_name: 'Rae', roles: ['advisor'], role_labels: ['Teacher'] },
  { id: 'kate', name: 'Kate A', first_name: 'Kate', roles: ['org_admin'], role_labels: ['Admin'] },
]
const PRESETS = [
  { key: 'all_teachers', label: 'All teachers', member_ids: ['ada', 'sam', 'rae'] },
  { key: 'weekday:2', label: 'Teaching Tuesday', member_ids: ['ada'],
    description: 'Anyone with a class that meets on Tuesday' },
]

const open = (props = {}) => render(
  <StaffComposeModal isOpen orgId="org-1" onClose={vi.fn()} onSent={vi.fn()} {...props} />,
)

const pick = async (name) => {
  fireEvent.click(await screen.findByLabelText(`Select ${name}`))
}

describe('StaffComposeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { people: PEOPLE, presets: PRESETS } })
    api.post.mockResolvedValue({ data: { mode: 'group', sent: 2, skipped: [] } })
  })

  it('sends two people as one group thread by default', async () => {
    open()
    await pick('Ada L')
    await pick('Sam P')
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Gate code is 4821' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [, payload] = api.post.mock.calls[0]
    expect(payload.mode).toBe('group')
    expect(payload.recipient_ids.sort()).toEqual(['ada', 'sam'])
    expect(payload.body).toBe('Gate code is 4821')
  })

  it('sends separately when the toggle is on', async () => {
    open()
    await pick('Ada L')
    await pick('Sam P')
    fireEvent.click(screen.getByLabelText(/Send separately/))
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Your paperwork' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].mode).toBe('separate')
  })

  it('offers no group toggle for a single recipient', async () => {
    open()
    await pick('Ada L')
    expect(screen.queryByLabelText(/Send separately/)).not.toBeInTheDocument()
  })

  it('a preset fills the chip list', async () => {
    open()
    fireEvent.click(await screen.findByRole('button', { name: /All teachers/ }))
    expect(await screen.findByLabelText('Remove Ada L')).toBeInTheDocument()
    expect(screen.getByLabelText('Remove Sam P')).toBeInTheDocument()
    expect(screen.getByLabelText('Remove Rae Q')).toBeInTheDocument()
  })

  it('one person can be dropped from a preset before sending', async () => {
    /* "All teachers except Sam" is the common case, and a preset that resolved
       only at send time could not express it. */
    open()
    fireEvent.click(await screen.findByRole('button', { name: /All teachers/ }))
    fireEvent.click(await screen.findByLabelText('Remove Sam P'))
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].recipient_ids.sort()).toEqual(['ada', 'rae'])
  })

  it('two presets are unioned, not duplicated', async () => {
    open()
    fireEvent.click(await screen.findByRole('button', { name: /All teachers/ }))
    fireEvent.click(screen.getByRole('button', { name: /Teaching Tuesday/ }))
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].recipient_ids.sort()).toEqual(['ada', 'rae', 'sam'])
  })

  it('will not send with nobody chosen', async () => {
    open()
    await screen.findByLabelText('Select Ada L')
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('will not send an empty message', async () => {
    open()
    await pick('Ada L')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('names the thread when one is given', async () => {
    open()
    await pick('Ada L')
    await pick('Sam P')
    fireEvent.change(screen.getByLabelText(/Name this thread/), { target: { value: 'Tuesday cover' } })
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].name).toBe('Tuesday cover')
  })

  it('searching narrows the list without dropping who is already chosen', async () => {
    open()
    await pick('Ada L')
    fireEvent.change(screen.getByLabelText('Search staff'), { target: { value: 'sam' } })
    expect(screen.queryByLabelText('Select Ada L')).not.toBeInTheDocument()
    // Still in the chip list, so the send is not silently narrowed by a search.
    expect(screen.getByLabelText('Remove Ada L')).toBeInTheDocument()
  })

  it('reports anyone who could not be reached', async () => {
    const { toast } = await import('react-hot-toast')
    api.post.mockResolvedValue({ data: { mode: 'separate', sent: 1, skipped: ['sam'] } })
    open()
    await pick('Ada L')
    await pick('Sam P')
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('1 could not be reached'))
  })

  it('keeps the modal open when the send fails', async () => {
    const onClose = vi.fn()
    api.post.mockRejectedValue({ response: { data: { error: 'Nope' } } })
    open({ onClose })
    await pick('Ada L')
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
  })
})
