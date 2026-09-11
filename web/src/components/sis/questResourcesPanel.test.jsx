import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import QuestResourcesPanel from './QuestResourcesPanel'

/**
 * The teacher's side: attaching a worksheet to step 3.
 *
 * Same panel at two scopes — pass a taskId for one task's attachments, omit it
 * for the quest's own — because they are the same thing; what changes is which
 * list the API writes to.
 */

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

const PAYLOAD = {
  quest: [{ id: 'q1', kind: 'link', title: 'Syllabus', url: 'https://a' }],
  by_task: { 'task-1': [{ id: 't1', kind: 'file', title: 'Worksheet.pdf', url: 'https://b' }] },
}

describe('QuestResourcesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: PAYLOAD })
    api.post.mockResolvedValue({ data: { success: true } })
    api.delete.mockResolvedValue({ data: { success: true } })
  })

  it('shows the quest-level resources when given no task', async () => {
    render(<QuestResourcesPanel questId="quest-1" />)
    expect(await screen.findByText('Syllabus')).toBeInTheDocument()
    expect(screen.queryByText('Worksheet.pdf')).not.toBeInTheDocument()
  })

  it('shows one task\'s resources when given a task', async () => {
    render(<QuestResourcesPanel questId="quest-1" taskId="task-1" />)
    expect(await screen.findByText('Worksheet.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Syllabus')).not.toBeInTheDocument()
  })

  it('says to save first when the quest has no id yet', () => {
    /* An unsaved quest has nothing to attach to; a control here would 404. */
    render(<QuestResourcesPanel questId={null} />)
    expect(screen.getByText('Save the quest to attach resources.')).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('attaches a link to the task it was opened for', async () => {
    render(<QuestResourcesPanel questId="quest-1" taskId="task-1" />)
    fireEvent.click(await screen.findByRole('button', { name: '+ Add a resource' }))
    fireEvent.change(screen.getByLabelText('Resource URL'),
      { target: { value: 'https://example.com/sheet' } })
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, payload] = api.post.mock.calls[0]
    expect(url).toBe('/api/sis/quests/quest-1/resources')
    expect(payload.task_id).toBe('task-1')
    expect(payload.kind).toBe('link')
  })

  it('recognises a video URL as a video', async () => {
    render(<QuestResourcesPanel questId="quest-1" />)
    fireEvent.click(await screen.findByRole('button', { name: '+ Add a resource' }))
    fireEvent.change(screen.getByLabelText('Resource URL'),
      { target: { value: 'https://youtube.com/watch?v=abcdefghijk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].kind).toBe('video')
  })

  it('refuses to attach nothing', async () => {
    const { toast } = await import('react-hot-toast')
    render(<QuestResourcesPanel questId="quest-1" />)
    fireEvent.click(await screen.findByRole('button', { name: '+ Add a resource' }))
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }))

    expect(toast.error).toHaveBeenCalledWith('Paste a link first')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('removes a resource', async () => {
    render(<QuestResourcesPanel questId="quest-1" />)
    fireEvent.click(await screen.findByLabelText('Remove Syllabus'))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      '/api/sis/quests/quest-1/resources/q1'))
  })

  it('reloads after attaching, so the new row appears', async () => {
    render(<QuestResourcesPanel questId="quest-1" />)
    await screen.findByText('Syllabus')
    const before = api.get.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: '+ Add a resource' }))
    fireEvent.change(screen.getByLabelText('Resource URL'),
      { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }))
    await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(before))
  })

  it('keeps the form open when the server refuses', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'Links have to start with http' } } })
    render(<QuestResourcesPanel questId="quest-1" />)
    fireEvent.click(await screen.findByRole('button', { name: '+ Add a resource' }))
    fireEvent.change(screen.getByLabelText('Resource URL'), { target: { value: 'ftp://x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(screen.getByLabelText('Resource URL')).toBeInTheDocument()
  })
})
