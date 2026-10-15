/**
 * Ticket d0cc8d45: the quest task evidence editor autosaves every change, so
 * a file path pasted into a link block was in the database before the
 * student pressed anything. The save step now drops a link item whose URL is
 * a path on the student's computer when it was typed in this session; the
 * editor shows the student why.
 *
 * A local-path item that was already saved before the editor opened is kept.
 * Deleting it would silently remove the student's record, and the reviewer's
 * "saved only on the student's device" note with it. A normal https link
 * still saves.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EvidenceEditorProvider, useEvidenceEditor } from './EvidenceEditorContext'

const autoSave = vi.hoisted(() => vi.fn())
const service = vi.hoisted(() => ({ getDocument: vi.fn() }))
vi.mock('../../services/evidenceDocumentService', () => ({
  evidenceDocumentService: {
    getDocument: service.getDocument,
    createAutoSaver: () => ({ autoSave, clearAutoSave: vi.fn() }),
    saveDocument: vi.fn(),
  },
}))
vi.mock('../../hooks/useUploadQueue', () => ({
  useUploadQueue: () => ({ uploadingBlocks: new Set() }),
}))

const SAVED_LOCAL = 'file:///home/chronos/u-3f2a9c/MyFiles/Downloads/Old screenshot.png'
const TYPED_LOCAL = 'file:///home/chronos/u-3f2a9c/MyFiles/Downloads/New screenshot.png'
const GOOD = 'https://docs.google.com/document/d/abc/edit'

const savedBlock = {
  id: 'b1',
  block_type: 'link',
  content: { items: [{ url: SAVED_LOCAL, title: '' }] },
  order_index: 0,
}

// Stands in for the student typing: appends items to the saved link block,
// and adds a second block holding a typed Windows path.
const Typist = () => {
  const { setBlocks } = useEvidenceEditor()
  return (
    <button
      onClick={() =>
        setBlocks(prev => [
          {
            ...prev[0],
            content: {
              items: [
                ...prev[0].content.items,
                { url: TYPED_LOCAL, title: '' },
                { url: GOOD, title: 'Essay' },
              ],
            },
          },
          { id: 'b2', type: 'link', content: { url: 'C:\\Users\\maci\\art.jpg' } },
        ])
      }
    >
      type
    </button>
  )
}

beforeEach(() => {
  autoSave.mockClear()
  service.getDocument.mockResolvedValue({
    success: true,
    document: { status: 'draft' },
    blocks: [savedBlock],
  })
})

const typeAndGetSaved = async () => {
  render(
    <EvidenceEditorProvider taskId="t1" userId="u1">
      <Typist />
    </EvidenceEditorProvider>,
  )
  // The load triggers one autosave of what came from the server.
  await waitFor(() => expect(autoSave).toHaveBeenCalled())
  autoSave.mockClear()
  fireEvent.click(screen.getByText('type'))
  await waitFor(() => expect(autoSave).toHaveBeenCalled())
  return autoSave.mock.calls.at(-1)[0]
}

describe('evidence editor autosave (ticket d0cc8d45)', () => {
  it('keeps a local-path item that was already saved before the editor opened', async () => {
    const saved = await typeAndGetSaved()
    expect(saved[0].content.items.map(i => i.url)).toContain(SAVED_LOCAL)
  })

  it('the autosave on load does not delete the saved local-path item', async () => {
    render(
      <EvidenceEditorProvider taskId="t1" userId="u1">
        <Typist />
      </EvidenceEditorProvider>,
    )
    await waitFor(() => expect(autoSave).toHaveBeenCalled())
    expect(autoSave.mock.calls[0][0][0].content.items).toEqual([{ url: SAVED_LOCAL, title: '' }])
  })

  it('does not save a local path typed in this session', async () => {
    const saved = await typeAndGetSaved()
    expect(saved[0].content.items.map(i => i.url)).not.toContain(TYPED_LOCAL)
    expect(saved[1].content.url).toBeUndefined()
  })

  it('still saves a normal https link', async () => {
    const saved = await typeAndGetSaved()
    expect(saved[0].content.items).toContainEqual({ url: GOOD, title: 'Essay' })
  })
})
