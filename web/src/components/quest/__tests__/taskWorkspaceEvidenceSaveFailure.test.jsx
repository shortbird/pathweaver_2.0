/**
 * A failed evidence save must not look like a saved one.
 *
 * Ticket a9d3cedb (Nicole Bunting, parent of Brock): "anytime he tries to
 * submit something on an assignment, it shows as being there, but when you
 * leave and then click back in, the submission is gone."
 *
 * handleSaveEvidence put the new item in the list before the save and, when
 * the save failed, only toasted "Failed to save evidence". The item stayed on
 * screen as if stored until a reload showed the truth. Now the list goes back
 * to what the server holds and the new item waits under "Not saved" with its
 * uploaded file URL, so Try again re-sends it without a second upload. After a
 * successful save the list carries the ids the server returned, or is read
 * back when the server's count disagrees.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { toast } from 'react-hot-toast'
// vi.mock calls below are hoisted above these imports.
import TaskWorkspace from '../TaskWorkspace'
import { evidenceDocumentService } from '../../../services/evidenceDocumentService'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(), error: vi.fn(), loading: vi.fn(() => 'toast-1'), dismiss: vi.fn(),
  })
  return { default: toast, toast }
})
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
vi.mock('../../../contexts/AIAccessContext', () => ({
  useAIAccess: () => ({ canUseTaskGeneration: false, hasAccess: false }),
}))
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'stu-1' }, effectiveRole: 'student' }),
}))
vi.mock('../../../hooks/useHidePillars', () => ({ default: () => false }))
vi.mock('../../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ organization: null }),
  useOrgFeature: () => false,
}))
vi.mock('../../../hooks/useStudentScope', () => ({
  useStudentScope: () => ({ studentId: null, params: {}, isDelegated: false }),
}))
vi.mock('../../../services/evidenceDocumentService', () => ({
  evidenceDocumentService: {
    getDocument: vi.fn(),
    saveDocument: vi.fn(),
    uploadFile: vi.fn(),
    deleteStorageUrls: vi.fn(),
  },
}))
vi.mock('../../../services/api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: {} })), post: vi.fn(), patch: vi.fn() },
}))

// The modal only has to hand TaskWorkspace a new item, the way the real one
// does when the student presses Save.
const NEW_FILE = new File(['png'], 'scavenger-hunt.png', { type: 'image/png' })
vi.mock('../../evidence/AddEvidenceModal', () => ({
  default: ({ onSave }) => (
    <button onClick={() => onSave([{
      id: 'temp-1',
      type: 'image',
      content: { items: [{ file: NEW_FILE, filename: 'scavenger-hunt.png', url: 'blob:x' }] },
    }])}
    >
      fake add
    </button>
  ),
}))

// The evidence list, reduced to what these tests read: one row per block.
vi.mock('../taskWorkspace/TaskEvidenceSection', () => ({
  default: ({ evidenceBlocks }) => (
    <ul data-testid="evidence-list">
      {evidenceBlocks.map((b) => (
        <li key={b.id}>
          {`${b.id}:${b.type === 'text' ? b.content.text : b.content.items.map((i) => i.filename).join(',')}`}
        </li>
      ))}
    </ul>
  ),
}))

const TASK = { id: 'task-1', title: 'Scavenger Hunt', pillar: 'art', xp_amount: 50, is_completed: false }
const SAVED_TEXT = { id: 'srv-0', block_type: 'text', content: { text: 'my notes' } }
const UPLOADED_URL = 'https://x.supabase.co/storage/v1/object/public/quest-evidence/evidence-tasks/u/a.png'

const listText = () => screen.getByTestId('evidence-list').textContent

beforeEach(() => {
  vi.clearAllMocks()
  evidenceDocumentService.getDocument.mockResolvedValue({ success: true, blocks: [SAVED_TEXT] })
  evidenceDocumentService.uploadFile.mockResolvedValue({ success: true, url: UPLOADED_URL })
})

const renderAndAdd = async () => {
  render(<TaskWorkspace task={TASK} tasks={[TASK]} questId="quest-1" />)
  await waitFor(() => expect(listText()).toContain('srv-0:my notes'))
  fireEvent.click(screen.getByText('fake add'))
}

describe('evidence save failure (ticket a9d3cedb)', () => {
  it('rolls the list back and keeps the new item under Not saved when the save throws', async () => {
    evidenceDocumentService.saveDocument.mockRejectedValueOnce(new Error('500'))

    await renderAndAdd()

    expect(await screen.findByTestId('unsaved-evidence')).toHaveTextContent('scavenger-hunt.png')
    expect(listText()).not.toContain('scavenger-hunt.png')
    expect(listText()).toContain('srv-0:my notes')
    expect(toast.error).toHaveBeenCalledWith('Your evidence was not saved. Press Try again.')
  })

  it('treats a { success: false } answer the same way', async () => {
    evidenceDocumentService.saveDocument.mockResolvedValueOnce({ success: false, error: 'nope' })

    await renderAndAdd()

    expect(await screen.findByTestId('unsaved-evidence')).toBeInTheDocument()
    expect(listText()).not.toContain('scavenger-hunt.png')
  })

  it('Try again re-sends the uploaded URL without uploading the file a second time', async () => {
    evidenceDocumentService.saveDocument.mockRejectedValueOnce(new Error('500'))
    await renderAndAdd()
    await screen.findByTestId('unsaved-evidence')

    evidenceDocumentService.saveDocument.mockResolvedValueOnce({
      success: true,
      blocks: [{ id: 'srv-a', order_index: 0 }, { id: 'srv-b', order_index: 1 }],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(listText()).toContain('srv-b:scavenger-hunt.png'))
    expect(screen.queryByTestId('unsaved-evidence')).not.toBeInTheDocument()
    expect(evidenceDocumentService.uploadFile).toHaveBeenCalledTimes(1)
    const sentBlocks = evidenceDocumentService.saveDocument.mock.calls[1][1]
    expect(sentBlocks[1].content.items[0].url).toBe(UPLOADED_URL)
  })

  it('Discard drops the item and deletes its uploaded file', async () => {
    evidenceDocumentService.saveDocument.mockRejectedValueOnce(new Error('500'))
    await renderAndAdd()
    await screen.findByTestId('unsaved-evidence')

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))

    expect(screen.queryByTestId('unsaved-evidence')).not.toBeInTheDocument()
    expect(evidenceDocumentService.deleteStorageUrls).toHaveBeenCalledWith([UPLOADED_URL])
  })
})

describe('evidence save success (ticket a9d3cedb)', () => {
  it('keeps the new item with the ids the server returned', async () => {
    evidenceDocumentService.saveDocument.mockResolvedValueOnce({
      success: true,
      blocks: [{ id: 'srv-a', order_index: 0 }, { id: 'srv-b', order_index: 1 }],
    })

    await renderAndAdd()

    await waitFor(() => expect(listText()).toContain('srv-b:scavenger-hunt.png'))
    expect(listText()).toContain('srv-a:my notes')
    expect(screen.queryByTestId('unsaved-evidence')).not.toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('Evidence saved')
  })

  it('reads the document back when the server holds a different number of blocks', async () => {
    evidenceDocumentService.saveDocument.mockResolvedValueOnce({
      success: true,
      blocks: [{ id: 'srv-a', order_index: 0 }],
    })

    await renderAndAdd()

    await waitFor(() => expect(evidenceDocumentService.getDocument).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(listText()).not.toContain('scavenger-hunt.png'))
  })
})
