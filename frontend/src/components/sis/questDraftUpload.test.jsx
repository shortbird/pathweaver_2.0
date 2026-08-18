/**
 * Choosing a document arms the generator; it does not fire it.
 *
 * Picking a file used to call generate() from the file input's onChange, so the
 * run started with whatever the task-count and emphasis fields happened to hold
 * at that moment — and the Generate button sat disabled, because it only ever
 * enabled on pasted text. iCreate, 2026-08-17: "When you upload the document, it
 * starts generating it automatically, it'd be better if it let me click the
 * generate draft button when I was ready."
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import QuestAiDraftPanel from './QuestAiDraftPanel'
import api from '../../services/api'

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const pickFile = () => {
  const file = new File(['the handbook'], 'handbook.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText('Upload a document'), { target: { files: [file] } })
  return file
}

describe('uploading a document', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.post.mockResolvedValue({ data: { quest: { title: 'T', description: 'D', tasks: [] } } })
  })

  it('does not start generating the moment a file is chosen', () => {
    render(<QuestAiDraftPanel alwaysOpen onDrafted={() => {}} />)
    pickFile()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('says it is holding the file and waiting, so it is clear nothing ran yet', () => {
    render(<QuestAiDraftPanel alwaysOpen onDrafted={() => {}} />)
    pickFile()
    const hint = screen.getByText(/ready to read/i)
    expect(hint).toHaveTextContent('handbook.pdf')
    expect(hint).toHaveTextContent(/press generate draft/i)
  })

  it('enables Generate on a chosen file, not only on pasted text', () => {
    render(<QuestAiDraftPanel alwaysOpen onDrafted={() => {}} />)
    expect(screen.getByRole('button', { name: /generate draft/i })).toBeDisabled()
    pickFile()
    expect(screen.getByRole('button', { name: /generate draft/i })).toBeEnabled()
  })

  it('sends the file only when Generate is pressed', async () => {
    render(<QuestAiDraftPanel alwaysOpen onDrafted={() => {}} />)
    pickFile()
    fireEvent.click(screen.getByRole('button', { name: /generate draft/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/api/sis/quest-drafts/generate')
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('file')).toBeInstanceOf(File)
  })

  it('carries the task count chosen AFTER the file was picked', async () => {
    // The whole point of the split: the fields are read at Generate time.
    render(<QuestAiDraftPanel alwaysOpen onDrafted={() => {}} />)
    pickFile()
    fireEvent.change(screen.getByLabelText('How many tasks to generate'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: /generate draft/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].get('task_count')).toBe('7')
  })
})
