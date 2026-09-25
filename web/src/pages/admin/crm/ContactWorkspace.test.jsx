import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '../../../services/api'
import ContactWorkspace from './ContactWorkspace'

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

const DRAFT = {
  id: 'd1', to_email: 'lee@example.com', subject: 'Checking in', body_text: 'Hi Lee',
  status: 'draft', origin: 'ai', reason: 'No contact in 3 weeks', updated_at: 'x',
}

const serve = ({ drafts = [], messages = [], tasks = [], connected = true } = {}) =>
  api.get.mockImplementation((url) =>
    Promise.resolve({
      data: url.startsWith('/api/admin/crm/gmail')
        ? { connected }
        : { email: 'lee@example.com', client_org: null, drafts, messages, tasks },
    })
  )

const mount = () =>
  render(
    <MemoryRouter>
      <ContactWorkspace email="lee@example.com" />
    </MemoryRouter>
  )

describe('ContactWorkspace', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends a draft only when Send is clicked, with the edit on screen', async () => {
    serve({ drafts: [DRAFT] })
    api.post.mockResolvedValue({ data: { draft: { ...DRAFT, status: 'sent' } } })
    mount()

    const message = await screen.findByLabelText('Message')
    expect(api.post).not.toHaveBeenCalled()
    await userEvent.clear(message)
    await userEvent.type(message, 'Hi Lee, edited')
    await userEvent.click(screen.getByRole('button', { name: 'Send to lee@example.com' }))

    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith('/api/admin/crm/drafts/d1/send', {
      to_email: 'lee@example.com', subject: 'Checking in', body_text: 'Hi Lee, edited',
    })
  })

  it('cannot send until Gmail is connected', async () => {
    serve({ drafts: [DRAFT], connected: false })
    mount()
    const send = await screen.findByRole('button', { name: 'Send to lee@example.com' })
    expect(send).toBeDisabled()
    expect(screen.getByText(/to send\./)).toBeInTheDocument()
  })

  it('adds a to-do with a due date', async () => {
    serve()
    api.post.mockResolvedValue({ data: { task: {} } })
    mount()
    await userEvent.type(await screen.findByLabelText('New to-do'), 'Send the pricing sheet')
    await userEvent.type(screen.getByLabelText('Due date'), '2026-09-30')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(api.post).toHaveBeenCalledWith('/api/admin/crm/tasks', {
      email: 'lee@example.com', title: 'Send the pricing sheet', due_on: '2026-09-30', detail: undefined,
    })
  })

  it('groups email into threads and starts a reply in the thread', async () => {
    serve({
      messages: [
        { id: 'm2', thread_id: 't1', direction: 'outbound', from_email: 'tanner@optioeducation.com',
          subject: 'Re: Fall', snippet: 'Sure', body_text: 'Sure', sent_at: '2026-09-24T12:00:00Z' },
        { id: 'm1', thread_id: 't1', direction: 'inbound', from_email: 'lee@example.com',
          subject: 'Fall', snippet: 'Question', body_text: 'Question', sent_at: '2026-09-23T12:00:00Z' },
      ],
    })
    api.post.mockResolvedValue({ data: { draft: {} } })
    mount()
    const thread = await screen.findByRole('button', { name: /^Re: Fall/ })
    await userEvent.click(thread)
    const item = thread.closest('li')
    await userEvent.click(within(item).getByRole('button', { name: 'Reply' }))
    expect(api.post).toHaveBeenCalledWith('/api/admin/crm/drafts', expect.objectContaining({
      email: 'lee@example.com', thread_id: 't1',
    }))
  })
})
