import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '../../../services/api'
import PersonFile from './PersonFile'

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../../contexts/ConfirmContext', () => ({
  useConfirm: () => () => Promise.resolve(true),
}))

const PERSON = {
  id: 'u1', email: 'pat@example.com', first_name: 'Pat', last_name: 'Lee',
  role: 'parent', created_at: '2026-01-05T00:00:00Z',
}

const DOC_URL = 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit'

const serve = ({ notes = [], leads = [] } = {}) =>
  api.get.mockResolvedValue({ data: { person: PERSON, notes, leads } })

const mount = (props = {}) =>
  render(
    <MemoryRouter>
      <PersonFile personId="u1" {...props} />
    </MemoryRouter>
  )

describe('PersonFile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds a meeting note for a user who is not a lead', async () => {
    serve()
    api.post.mockResolvedValue({ data: { note: {} } })
    mount({ showHeader: true })

    expect(await screen.findByText('Pat Lee')).toBeInTheDocument()
    expect(screen.getByText('No notes yet')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Note'), 'Talked about fall classes.')
    await userEvent.type(screen.getByLabelText('Meeting date'), '2026-09-20')
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }))

    expect(api.post).toHaveBeenCalledWith('/api/admin/crm/people/u1/notes', {
      body: 'Talked about fall classes.',
      met_on: '2026-09-20',
    })
    // Reloads the file so the new note shows.
    expect(api.get.mock.calls.filter(([url]) => url === '/api/admin/crm/people/u1')).toHaveLength(2)
  })

  it('attaches a Google Doc with no typed note', async () => {
    serve()
    api.post.mockResolvedValue({ data: { note: {}, doc_warning: null } })
    mount()

    const add = await screen.findByRole('button', { name: 'Add note' })
    expect(add).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Google Doc link'), DOC_URL)
    expect(add).toBeEnabled()
    await userEvent.click(add)

    expect(api.post).toHaveBeenCalledWith('/api/admin/crm/people/u1/notes', {
      body: '',
      met_on: null,
      doc_url: DOC_URL,
    })
  })

  it('shows the doc link and its copied text, and refreshes it', async () => {
    serve({
      notes: [{
        id: 'n1', body: 'Intro call', met_on: null,
        doc_url: DOC_URL, doc_title: 'Pat Lee intro call',
        doc_text: 'Wants Tue/Thu classes.', doc_fetched_at: '2026-09-24T15:00:00Z',
        created_at: '2026-09-24T15:00:00Z', updated_at: '2026-09-24T15:00:00Z',
      }],
    })
    api.post.mockResolvedValue({ data: { note: {}, doc_warning: null } })
    mount()

    const link = await screen.findByRole('link', { name: 'Pat Lee intro call' })
    expect(link).toHaveAttribute('href', DOC_URL)
    expect(screen.getByText('Wants Tue/Thu classes.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Refresh from doc' }))
    expect(api.post).toHaveBeenCalledWith('/api/admin/crm/person-notes/n1/doc/refresh', {})
  })

  it('says who to share an unreadable doc with', async () => {
    api.get.mockImplementation((url) =>
      Promise.resolve({
        data: url === '/api/admin/crm/google-docs'
          ? { share_with: 'reader@optio.iam.gserviceaccount.com' }
          : {
              person: PERSON,
              leads: [],
              notes: [{
                id: 'n1', body: 'Meeting notes', doc_url: DOC_URL, doc_text: null,
                created_at: '2026-09-24T15:00:00Z', updated_at: '2026-09-24T15:00:00Z',
              }],
            },
      })
    )
    mount()
    expect(
      await screen.findByText(/Share it \(or its folder\) with reader@optio\.iam\.gserviceaccount\.com/)
    ).toBeInTheDocument()
  })

  it('shows the meeting date as the calendar day, not the day before', async () => {
    serve({
      notes: [{
        id: 'n1', body: 'Coffee with Pat', met_on: '2026-09-20',
        created_at: '2026-09-21T15:00:00Z', updated_at: '2026-09-21T15:00:00Z',
        author_name: 'Tanner Bowman',
      }],
    })
    mount()
    expect(await screen.findByText('Meeting on Sep 20, 2026')).toBeInTheDocument()
    expect(screen.getByText('Coffee with Pat')).toBeInTheDocument()
  })

  it('shows notes from the lead that is the same person', async () => {
    serve({
      leads: [{
        id: 'lead-1', email: 'pat@example.com', status: 'converted', lead_source: 'demo',
        created_at: '2026-08-01T00:00:00Z',
        notes: [{ id: 'ev-1', detail: { body: 'Booked a demo' }, created_at: '2026-08-01T00:00:00Z' }],
      }],
    })
    mount()
    expect(await screen.findByText('As a lead')).toBeInTheDocument()
    expect(screen.getByText('Booked a demo')).toBeInTheDocument()
  })

  it('edits and deletes a note', async () => {
    serve({
      notes: [{
        id: 'n1', body: 'draft', met_on: null,
        created_at: '2026-09-21T15:00:00Z', updated_at: '2026-09-21T15:00:00Z',
      }],
    })
    api.put.mockResolvedValue({ data: { note: {} } })
    api.delete.mockResolvedValue({ data: { deleted: true } })
    mount()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const editor = screen.getAllByLabelText('Note')[1]
    await userEvent.clear(editor)
    await userEvent.type(editor, 'final')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(api.put).toHaveBeenCalledWith('/api/admin/crm/person-notes/n1', { body: 'final', met_on: null })

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(api.delete).toHaveBeenCalledWith('/api/admin/crm/person-notes/n1')
  })
})
