import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: { sheet_url: 'https://docs.google.com/spreadsheets/d/abc/edit' } })),
    post: vi.fn(),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import ScheduleSyncModal from './ScheduleSyncModal'

const PROPOSAL = {
  summary: 'Compared the sheet against Optio: 1 new, 1 not in the sheet.',
  warnings: ['Teacher column "Zed" matches no staff member — their classes will be created/left unassigned.'],
  operations: [
    { action: 'create_class', fields: { name: 'Chess' }, meetings: [],
      group: 'create', default_selected: true, label: 'Create "Chess" (Zed, 1 meeting/week)' },
    { action: 'archive_class', class_id: 'c9',
      group: 'archive', default_selected: false, label: 'Archive "Retired Pottery" — not in the sheet' },
  ],
}

const setup = () => {
  const onClose = vi.fn()
  const onApplied = vi.fn()
  render(<ScheduleSyncModal orgId="org-1" onClose={onClose} onApplied={onApplied} />)
  return { onClose, onApplied }
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { sheet_url: 'https://docs.google.com/spreadsheets/d/abc/edit' } })
})

describe('ScheduleSyncModal', () => {
  it('prefills the stored sheet url and previews the diff', async () => {
    api.post.mockResolvedValueOnce({ data: PROPOSAL })
    setup()
    await waitFor(() => expect(screen.getByDisplayValue(/docs.google.com/)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
    expect(await screen.findByText(/Create "Chess"/)).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/api/sis/schedule-sync/propose', {
      organization_id: 'org-1',
      sheet_url: 'https://docs.google.com/spreadsheets/d/abc/edit',
    })
    // Warning surfaced
    expect(screen.getByText(/matches no staff member/)).toBeInTheDocument()
  })

  it('leaves archive operations unchecked and applies only selected ops', async () => {
    api.post
      .mockResolvedValueOnce({ data: PROPOSAL }) // propose
      .mockResolvedValueOnce({ data: { applied: ['Create "Chess"'], errors: [], undo_operations: [{ action: 'archive_class', class_id: 'new' }] } })
    const { onApplied } = setup()
    await waitFor(() => expect(screen.getByDisplayValue(/docs.google.com/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
    await screen.findByText(/Create "Chess"/)

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes[0]).toBeChecked()      // create
    expect(checkboxes[1]).not.toBeChecked()  // archive

    fireEvent.click(screen.getByRole('button', { name: 'Apply 1 change' }))
    await waitFor(() => expect(api.post).toHaveBeenLastCalledWith('/api/sis/schedule-ai/apply', {
      organization_id: 'org-1',
      operations: [expect.objectContaining({ action: 'create_class' })],
    }))
    expect(onApplied).toHaveBeenCalled()
    // Undo affordance appears after apply
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('shows the in-sync state when there is nothing to change', async () => {
    api.post.mockResolvedValueOnce({ data: { summary: 'Sheet and Optio schedule already match.', warnings: [], operations: [] } })
    setup()
    await waitFor(() => expect(screen.getByDisplayValue(/docs.google.com/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
    expect(await screen.findByText(/already matches the sheet/)).toBeInTheDocument()
  })
})
