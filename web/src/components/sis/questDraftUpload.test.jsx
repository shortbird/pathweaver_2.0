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

/**
 * "Enter my tasks as I wrote them." iCreate, 2026-09-05 (edb43711): "can we
 * check a box that makes it so it's just entered into the quest as we have it
 * written? Instead of AI changing what I uploaded?" The box sends keep_wording
 * with either kind of request, and retires the task-count picker while it is
 * on, because the material decides the count.
 */
describe('keeping the teacher\'s wording', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.post.mockResolvedValue({ data: { quest: { title: 'T', description: 'D', tasks: [] } } })
  })

  it('is off by default, and the request says so', async () => {
    render(<QuestAiDraftPanel alwaysOpen onDrafted={() => {}} />)
    fireEvent.change(screen.getByLabelText('Source material'), { target: { value: 'Week 1: read.' } })
    fireEvent.click(screen.getByRole('button', { name: /generate draft/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][1]).toMatchObject({ keep_wording: false, task_count: 4 })
  })

  it('sends keep_wording with pasted text', async () => {
    render(<QuestAiDraftPanel alwaysOpen onDrafted={() => {}} />)
    fireEvent.click(screen.getByLabelText(/enter my tasks as i wrote them/i))
    fireEvent.change(screen.getByLabelText('Source material'), { target: { value: 'Week 1: read.' } })
    fireEvent.click(screen.getByRole('button', { name: /generate draft/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][1]).toMatchObject({ keep_wording: true })
  })

  it('sends keep_wording with an uploaded document', async () => {
    render(<QuestAiDraftPanel alwaysOpen onDrafted={() => {}} />)
    fireEvent.click(screen.getByLabelText(/enter my tasks as i wrote them/i))
    pickFile()
    fireEvent.click(screen.getByRole('button', { name: /generate draft/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const body = api.post.mock.calls[0][1]
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('keep_wording')).toBe('true')
  })

  it('retires the task-count picker while it is on, since the material decides', () => {
    render(<QuestAiDraftPanel alwaysOpen onDrafted={() => {}} />)
    const picker = screen.getByLabelText('How many tasks to generate')
    expect(picker).toBeEnabled()
    fireEvent.click(screen.getByLabelText(/enter my tasks as i wrote them/i))
    expect(picker).toBeDisabled()
  })
})

/**
 * iCreate, d4cdfa81 (Molly): "I uploaded my quest doc and it added all the
 * quests, but not the descriptions. It would be helpful to add the XP too."
 * The verbatim rule that leaves a missing description blank stays; the panel
 * now says so. And the 30-task cap, which used to cut a list in silence, is
 * reported by the backend and shown here.
 */
describe('telling the teacher what the draft left out', () => {
  const quest = (n, description = '') => ({
    title: 'T', description: 'D',
    tasks: Array.from({ length: n }, (_, i) => ({ title: `Quest ${i}`, description, xp_value: 50 })),
  })

  const generate = async ({ keep = true, alwaysOpen = true } = {}) => {
    render(<QuestAiDraftPanel alwaysOpen={alwaysOpen} onDrafted={() => {}} />)
    if (!alwaysOpen) fireEvent.click(screen.getByText(/build it from something i already have/i))
    if (keep) fireEvent.click(screen.getByLabelText(/enter my tasks as i wrote them/i))
    fireEvent.change(screen.getByLabelText('Source material'), { target: { value: 'Quest 1' } })
    fireEvent.click(screen.getByRole('button', { name: /generate draft/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
  }

  beforeEach(() => { vi.clearAllMocks() })

  it('explains blank descriptions when the wording was kept', async () => {
    api.post.mockResolvedValue({ data: { quest: quest(3) } })
    await generate()
    const note = await screen.findByRole('status')
    expect(note).toHaveTextContent(
      'Your document had no descriptions for 3 tasks, so they are blank. Turn off '
      + '"Enter my tasks as I wrote them" to have them written for you, or fill them in here.',
    )
  })

  it('says nothing about descriptions when every task has one', async () => {
    api.post.mockResolvedValue({ data: { quest: quest(3, 'Do it') } })
    await generate()
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('does not blame the document for a blank description in the composed mode', async () => {
    api.post.mockResolvedValue({ data: { quest: quest(3) } })
    await generate({ keep: false })
    expect(screen.queryByText(/had no descriptions/i)).toBeNull()
  })

  it('warns when the 30-task cap cut the list short', async () => {
    api.post.mockResolvedValue({
      data: { quest: quest(30, 'Do it'), tasks_truncated: true, source_task_count: 42 },
    })
    await generate()
    expect(await screen.findByRole('status'))
      .toHaveTextContent('Your document had 42 tasks; the first 30 were kept.')
  })

  it('does not warn about the cap when the backend reports no cut', async () => {
    api.post.mockResolvedValue({
      data: { quest: quest(12, 'Do it'), tasks_truncated: false, source_task_count: 12 },
    })
    await generate()
    expect(screen.queryByText(/were kept/i)).toBeNull()
  })

  it('keeps the note on screen after the panel collapses onto the form', async () => {
    api.post.mockResolvedValue({
      data: { quest: quest(30), tasks_truncated: true, source_task_count: 42 },
    })
    await generate({ alwaysOpen: false })
    const note = await screen.findByRole('status')
    expect(screen.getByText(/build it from something i already have/i)).toBeInTheDocument()
    expect(note).toHaveTextContent('Your document had 42 tasks; the first 30 were kept.')
    expect(note).toHaveTextContent('no descriptions for 30 tasks')
  })

  it('can be dismissed', async () => {
    api.post.mockResolvedValue({ data: { quest: quest(1) } })
    await generate()
    expect(await screen.findByRole('status'))
      .toHaveTextContent('no descriptions for 1 task, so it is blank')
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByRole('status')).toBeNull()
  })
})
