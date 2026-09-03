import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Composing a formatted announcement.
 *
 * iCreate, 2026-08-01: "A rich text editor would be nice on the announcements
 * and on the messages."
 *
 * The editor sends HTML, which breaks two habits the composers had: trimming
 * the body (an editor body has no meaningful leading whitespace) and treating
 * a non-empty string as written text — an empty editor still emits "<p></p>",
 * so the old `!message.trim()` guard would have let a blank announcement go
 * out to every family in the school.
 */

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'org_admin' } }) }))
vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ organization: { id: 'org-1', name: 'Org' } }),
}))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
// TipTap's contenteditable can't be typed into in jsdom; this stands in for it
// and hands back exactly what a real editor would (HTML).
vi.mock('../../components/course/outline/RichTextEditor', () => ({
  default: ({ value, onChange, placeholder }) => (
    <textarea value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} />
  ),
}))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: { success: true, announcements: [] } })),
    post: vi.fn((url) => {
      if (url === '/api/messages/attachments') {
        return Promise.resolve({ data: { data: { attachment: {
          url: 'stored-url', display_url: 'signed-url',
          type: 'file', name: 'flyer.pdf', size: 1,
        } } } })
      }
      return Promise.resolve({ data: { success: true, sent: 4 } })
    }),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import AnnouncementComposer from '../../components/sis/AnnouncementComposer'

const write = (body) => {
  fireEvent.change(screen.getByPlaceholderText('Subject line'), { target: { value: 'Early dismissal' } })
  fireEvent.change(screen.getByPlaceholderText('Write your announcement…'), { target: { value: body } })
  fireEvent.click(screen.getByText('Send announcement'))
}

beforeEach(() => { vi.clearAllMocks() })

describe('composing a formatted announcement', () => {
  it('sends the formatting, not a flattened copy', async () => {
    render(<AnnouncementComposer />)
    write('<p>Buses leave at <strong>noon</strong>.</p>')
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/announcements',
      expect.objectContaining({ message: '<p>Buses leave at <strong>noon</strong>.</p>' })))
  })

  it('refuses an empty editor even though it is not an empty string', async () => {
    const { toast } = await import('react-hot-toast')
    render(<AnnouncementComposer />)
    write('<p></p>')
    expect(api.post).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Title and message are required')
  })

  it('shows a past formatted announcement as formatting', async () => {
    api.get.mockResolvedValue({ data: { success: true, announcements: [
      { id: 'a1', title: 'Early dismissal', content: '<p>Buses at <strong>noon</strong></p>',
        target_audience: 'parents', created_at: '2026-08-01T12:00:00Z' },
    ] } })
    const { container } = render(<AnnouncementComposer />)
    fireEvent.click(await screen.findByRole('button', { name: /Recent announcements/ }))
    await screen.findByText('Early dismissal')
    expect(container.querySelector('strong')).toHaveTextContent('noon')
  })

  it('still shows an older plain-text announcement with its line breaks', async () => {
    api.get.mockResolvedValue({ data: { success: true, announcements: [
      { id: 'a1', title: 'Snow day', content: 'No school today.\nStay warm.',
        target_audience: 'parents', created_at: '2026-08-01T12:00:00Z' },
    ] } })
    const { container } = render(<AnnouncementComposer />)
    fireEvent.click(await screen.findByRole('button', { name: /Recent announcements/ }))
    await screen.findByText('Snow day')
    expect(container.querySelector('.whitespace-pre-wrap')).toHaveTextContent('No school today.')
  })
})

describe('delivery channels', () => {
  it('defaults to an app-only send', async () => {
    render(<AnnouncementComposer />)
    write('<p>Buses at noon.</p>')
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/announcements',
      expect.objectContaining({ send_app: true, send_email: false })))
  })

  it('can send as email only', async () => {
    render(<AnnouncementComposer />)
    fireEvent.click(screen.getByRole('button', { name: 'Email' }))
    write('<p>Buses at noon.</p>')
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/announcements',
      expect.objectContaining({ send_app: false, send_email: true })))
  })

  it('can send as both', async () => {
    render(<AnnouncementComposer />)
    fireEvent.click(screen.getByRole('button', { name: 'Both' }))
    write('<p>Buses at noon.</p>')
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/announcements',
      expect.objectContaining({ send_app: true, send_email: true })))
  })
})

describe('attachments', () => {
  it('uploads a file and sends its pointer with the announcement', async () => {
    render(<AnnouncementComposer />)
    const file = new File(['x'], 'flyer.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Attach files'), { target: { files: [file] } })
    expect(await screen.findByText('flyer.pdf')).toBeInTheDocument()

    write('<p>See the flyer.</p>')
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/announcements',
      expect.objectContaining({
        // The durable pointer, never the signed display twin.
        attachments: [{ url: 'stored-url', type: 'file', name: 'flyer.pdf', size: 1 }],
      })))
  })

  it('can be taken back off before the send', async () => {
    render(<AnnouncementComposer />)
    const file = new File(['x'], 'flyer.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Attach files'), { target: { files: [file] } })
    await screen.findByText('flyer.pdf')
    fireEvent.click(screen.getByLabelText('Remove flyer.pdf'))
    expect(screen.queryByText('flyer.pdf')).not.toBeInTheDocument()
  })
})

describe('announcement history', () => {
  const rows = [
    { id: 'a1', title: 'From Sam', content: 'x', target_audience: 'parents',
      created_at: '2026-08-30T12:00:00Z', author_id: 'u1', author_name: 'Sam Kim' },
    { id: 'a2', title: 'From Penny', content: 'y', target_audience: 'parents',
      created_at: '2026-08-29T12:00:00Z', author_id: 'u2', author_name: 'Penny Lu',
      in_app: false, recipient_count: 5, read_count: 0 },
  ]

  it('starts folded and opens on the toggle', async () => {
    api.get.mockResolvedValue({ data: { success: true, announcements: rows } })
    render(<AnnouncementComposer />)
    const toggle = await screen.findByRole('button', { name: /Recent announcements \(2\)/ })
    expect(screen.queryByText('From Sam')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(await screen.findByText('From Sam')).toBeInTheDocument()
  })

  it('filters by who sent them', async () => {
    api.get.mockResolvedValue({ data: { success: true, announcements: rows } })
    render(<AnnouncementComposer />)
    fireEvent.click(await screen.findByRole('button', { name: /Recent announcements/ }))
    await screen.findByText('From Sam')
    fireEvent.change(screen.getByLabelText('Filter announcements by sender'),
      { target: { value: 'u2' } })
    expect(screen.queryByText('From Sam')).not.toBeInTheDocument()
    expect(screen.getByText('From Penny')).toBeInTheDocument()
  })

  it('marks an email-only send and shows no read receipts for it', async () => {
    api.get.mockResolvedValue({ data: { success: true, announcements: rows } })
    render(<AnnouncementComposer />)
    fireEvent.click(await screen.findByRole('button', { name: /Recent announcements/ }))
    await screen.findByText('From Penny')
    expect(screen.getByText('Email only')).toBeInTheDocument()
    expect(screen.queryByText(/Seen by/)).not.toBeInTheDocument()
  })
})
