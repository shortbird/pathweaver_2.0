/**
 * Assigning an assistant teacher (TA) to a class.
 *
 * iCreate, 2026-08-06: "I think we built a way to assign TAs to classes but I
 * don't see where to do that."
 *
 * They were half right. The picker existed in the class editor, but
 * ClassesPage's classBody() — the one funnel every class save goes through —
 * rebuilt the payload field by field and simply never copied
 * assistant_instructor_ids across. So you could pick an assistant, save, and
 * watch it come back empty: indistinguishable from the feature not existing.
 *
 * These tests pin both halves of the fix: the field survives the save, and the
 * row editor (where the office actually works) offers it at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'org_admin' } }) }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => ({ organization: { id: 'org-1', name: 'Org' } }) }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const CLASS = {
  id: 'c1', name: 'Pottery', description: 'Clay', enrolled_count: 2, capacity: 10,
  min_age: 8, max_age: 12, is_full: false, registration_status: 'closed',
  waitlist_count: 0, meetings: [], price_cents: 12000,
  primary_instructor_id: 's1', primary_instructor: { id: 's1', name: 'Jane Doe' },
  assistant_instructor_ids: [], show_assistants: true,
}

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import ClassesPage from './ClassesPage'

beforeEach(() => {
  vi.clearAllMocks()
  try { window.localStorage.removeItem('sis_classes_view') } catch { /* jsdom quirk */ }
  api.get.mockImplementation((url) => {
    if (url.includes('/waitlist')) return Promise.resolve({ data: { waitlist: [] } })
    if (url.includes('/api/sis/staff')) {
      return Promise.resolve({ data: { staff: [
        { id: 's1', name: 'Jane Doe', roles: ['advisor'] },
        { id: 's2', name: 'Sam Lee', roles: ['advisor'] },
      ] } })
    }
    if (url.includes('/api/sis/classes')) return Promise.resolve({ data: { classes: [CLASS] } })
    return Promise.resolve({ data: {} })
  })
  api.patch.mockResolvedValue({ data: { class: CLASS } })
  api.post.mockResolvedValue({ data: { class: { id: 'c2' } } })
})

// Open the class list's inline row editor.
const openRow = async () => {
  render(<ClassesPage />)
  fireEvent.click(await screen.findByText('Pottery'))
  return screen.findByPlaceholderText('Add an assistant…')
}

describe('assigning an assistant teacher', () => {
  it('offers an assistant picker in the class row editor', async () => {
    await openRow()
    expect(screen.getByText('Assistant teacher(s)')).toBeInTheDocument()
  })

  it('leaves the teacher out of their own assistant list', async () => {
    const picker = await openRow()
    fireEvent.focus(picker)
    fireEvent.change(picker, { target: { value: 'a' } })
    // Sam is selectable; Jane already teaches the class, so she isn't offered
    // as her own assistant.
    expect(await screen.findByRole('button', { name: 'Sam Lee' })).toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: 'Jane Doe' })).toHaveLength(0)
  })

  it('sends the assistant through to the save — the bug iCreate hit', async () => {
    const picker = await openRow()
    fireEvent.focus(picker)
    fireEvent.change(picker, { target: { value: 'Sam' } })
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'Sam Lee' }))
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/classes/c1',
      expect.objectContaining({ assistant_instructor_ids: ['s2'] }),
    ))
  })

  it('carries the families-can-see-them choice with it', async () => {
    const picker = await openRow()
    fireEvent.focus(picker)
    fireEvent.change(picker, { target: { value: 'Sam' } })
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'Sam Lee' }))
    fireEvent.click(screen.getByLabelText(/Show the assistant to families/i))
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/classes/c1',
      expect.objectContaining({ show_assistants: false }),
    ))
  })

  it('removes an assistant already on the class', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/waitlist')) return Promise.resolve({ data: { waitlist: [] } })
      if (url.includes('/api/sis/staff')) {
        return Promise.resolve({ data: { staff: [
          { id: 's1', name: 'Jane Doe', roles: ['advisor'] },
          { id: 's2', name: 'Sam Lee', roles: ['advisor'] },
        ] } })
      }
      if (url.includes('/api/sis/classes')) {
        return Promise.resolve({ data: { classes: [
          { ...CLASS, assistant_instructor_ids: ['s2'] },
        ] } })
      }
      return Promise.resolve({ data: {} })
    })
    await openRow()
    fireEvent.click(screen.getByLabelText('Remove Sam Lee'))
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/classes/c1',
      expect.objectContaining({ assistant_instructor_ids: [] }),
    ))
  })
})

/**
 * The fields that used to need the "full editor".
 *
 * iCreate, 2026-08-06: "maybe remove the need for the full editor?" The row
 * editor was missing exactly two things — the image and the materials allowance
 * — and the allowance was worse than missing: it was already read into the row's
 * draft and then dropped by the payload builder, so setting it did nothing.
 */
describe('the row editor is now the whole editor', () => {
  it('saves the materials allowance, which the payload used to drop', async () => {
    await openRow()
    fireEvent.change(screen.getByLabelText('Materials allowance per student'), { target: { value: '75' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/classes/c1',
      expect.objectContaining({ supply_budget_per_student: 75 }),
    ))
  })

  it('offers the class image without leaving the row', async () => {
    await openRow()
    expect(screen.getByLabelText('Class image')).toBeInTheDocument()
  })

  it('sends you to the modal only for what it uniquely has', async () => {
    await openRow()
    expect(screen.getByRole('button', { name: 'Roster & waitlist' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Full editor' })).not.toBeInTheDocument()
  })

  it('keeps registration out of the draft — it saves on its own', async () => {
    await openRow()
    fireEvent.click(screen.getByRole('switch', { name: /Toggle registration/ }))
    // Straight to the API, with no Save press.
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/classes/c1',
      expect.objectContaining({ registration_status: 'open' }),
    ))
  })
})
