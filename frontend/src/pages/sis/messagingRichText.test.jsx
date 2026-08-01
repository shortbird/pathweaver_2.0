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
    post: vi.fn(() => Promise.resolve({ data: { success: true, sent: 4 } })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import FamilyMessagingPage from './FamilyMessagingPage'

const write = (body) => {
  fireEvent.change(screen.getByPlaceholderText('Subject line'), { target: { value: 'Early dismissal' } })
  fireEvent.change(screen.getByPlaceholderText('Write your announcement…'), { target: { value: body } })
  fireEvent.click(screen.getByText('Send announcement'))
}

beforeEach(() => { vi.clearAllMocks() })

describe('composing a formatted announcement', () => {
  it('sends the formatting, not a flattened copy', async () => {
    render(<FamilyMessagingPage />)
    write('<p>Buses leave at <strong>noon</strong>.</p>')
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/announcements',
      expect.objectContaining({ message: '<p>Buses leave at <strong>noon</strong>.</p>' })))
  })

  it('refuses an empty editor even though it is not an empty string', async () => {
    const { toast } = await import('react-hot-toast')
    render(<FamilyMessagingPage />)
    write('<p></p>')
    expect(api.post).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Title and message are required')
  })

  it('shows a past formatted announcement as formatting', async () => {
    api.get.mockResolvedValue({ data: { success: true, announcements: [
      { id: 'a1', title: 'Early dismissal', content: '<p>Buses at <strong>noon</strong></p>',
        target_audience: 'parents', created_at: '2026-08-01T12:00:00Z' },
    ] } })
    const { container } = render(<FamilyMessagingPage />)
    await screen.findByText('Early dismissal')
    expect(container.querySelector('strong')).toHaveTextContent('noon')
  })

  it('still shows an older plain-text announcement with its line breaks', async () => {
    api.get.mockResolvedValue({ data: { success: true, announcements: [
      { id: 'a1', title: 'Snow day', content: 'No school today.\nStay warm.',
        target_audience: 'parents', created_at: '2026-08-01T12:00:00Z' },
    ] } })
    const { container } = render(<FamilyMessagingPage />)
    await screen.findByText('Snow day')
    expect(container.querySelector('.whitespace-pre-wrap')).toHaveTextContent('No school today.')
  })
})
