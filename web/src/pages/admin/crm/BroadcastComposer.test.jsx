import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '../../../services/api'
import BroadcastComposer from './BroadcastComposer'

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

const confirmMock = vi.fn()
vi.mock('../../../contexts/ConfirmContext', () => ({ useConfirm: () => confirmMock }))

const recipients = [
  { id: 'a1', name: 'Pat Lee', email: 'pat@school.test', organization_id: 'org-a' },
  { id: 'a2', name: 'Sam Ng', email: 'sam@other.test', organization_id: 'org-b' },
]
const orgName = { 'org-a': 'Horizon', 'org-b': 'Gryffin' }

const preview = (sendable) => ({
  data: {
    preview: { to: 'pat@school.test', subject: 'Your bill', html: '<p>x</p>', text: 'x', unknown: [], blank: [], person_id: 'a1' },
    summary: { sendable, skipped: [], unknown: [], blank: [] },
  },
})

describe('BroadcastComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    api.get.mockImplementation((url) =>
      Promise.resolve(
        url.endsWith('/variables')
          ? { data: { variables: [{ name: 'first_name', token: '{{first_name}}', label: 'First name', group: 'person' }] } }
          : { data: { broadcast: { id: 'b1', status: 'sent', sent_count: 2, failed_count: 0, skipped_count: 0 }, recipients: [] } }
      )
    )
    api.post.mockImplementation((url) => {
      if (url.endsWith('/school-sheet')) {
        return Promise.resolve({
          data: { schools: { 'org-a': { student_count: 40, students: [] }, 'org-b': { student_count: 6, students: [] } } },
        })
      }
      if (url.endsWith('/preview')) return Promise.resolve(preview(2))
      return Promise.resolve({ data: { broadcast: { id: 'b1', status: 'sending', sent_count: 0, failed_count: 0, skipped_count: 0 } } })
    })
  })

  it('fills the sheet from the roster and sends count x price', async () => {
    render(<BroadcastComposer recipients={recipients} orgName={orgName} list={{ id: 'l1', name: 'School admins' }} onClose={() => {}} />)

    expect(await screen.findByLabelText('Students at Horizon')).toHaveValue('40')
    fireEvent.change(screen.getByLabelText('Price per student'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use for every school' }))
    expect(screen.getByLabelText('Amount at Horizon')).toHaveValue('1000.00')
    expect(screen.getByLabelText('Amount at Gryffin')).toHaveValue('150.00')

    // A typed amount wins over the arithmetic.
    fireEvent.change(screen.getByLabelText('Amount at Gryffin'), { target: { value: '0' } })

    const sendButton = await screen.findByRole('button', { name: 'Send to 2' }, { timeout: 2000 })
    confirmMock.mockResolvedValue(true)
    fireEvent.click(sendButton)

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/admin/crm/broadcasts', expect.anything()))
    const sent = api.post.mock.calls.find(([url]) => url === '/api/admin/crm/broadcasts')[1]
    expect(sent.expected_count).toBe(2)
    expect(sent.recipient_ids).toEqual(['a1', 'a2'])
    expect(sent.list_id).toBe('l1')
    expect(sent.sheet.schools['org-a'].amount_due).toBe('1000.00')
    expect(sent.sheet.schools['org-b'].amount_due).toBe('0')
    expect(await screen.findByText('2 sent, 0 failed, 0 skipped.')).toBeInTheDocument()
  })

  it('does not send when the confirm is declined', async () => {
    render(<BroadcastComposer recipients={recipients} orgName={orgName} list={null} onClose={() => {}} />)
    const sendButton = await screen.findByRole('button', { name: 'Send to 2' }, { timeout: 2000 })
    confirmMock.mockResolvedValue(false)
    fireEvent.click(sendButton)
    await waitFor(() => expect(confirmMock).toHaveBeenCalled())
    expect(api.post.mock.calls.some(([url]) => url === '/api/admin/crm/broadcasts')).toBe(false)
  })
})
