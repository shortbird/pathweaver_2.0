import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

/**
 * A saved quest in the draft form carries its resources.
 *
 * iCreate, 2026-09-08 (774e2fe2): "I need to be able to link to videos in the
 * training section. I know you added 'upload video' in the quests, but I'm
 * not sure you want to be a video host too. So maybe it's a link to a video
 * to watch?" Quest resources (links, videos, files, per quest and per task)
 * existed for class quests; the training editor built its quest through the
 * same form and never got them. The form now takes the saved quest's id and
 * shows the panel for the quest and for every saved task.
 */

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import QuestDraftForm, { blankTask } from './QuestDraftForm'

const PAYLOAD = {
  quest: [{ id: 'r1', kind: 'video', title: 'Welcome video', url: 'https://youtu.be/x' }],
  by_task: { 'task-1': [{ id: 'r2', kind: 'link', title: 'Handbook part 1', url: 'https://a' }] },
}

const noop = () => {}
const form = (props) => (
  <QuestDraftForm title="T" setTitle={noop} description="D" setDescription={noop}
    setTasks={noop} {...props} />
)

describe('resources on the quest draft form', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: PAYLOAD })
  })

  it('shows the quest resources and each saved task\'s resources when editing a saved quest', async () => {
    render(form({
      questId: 'quest-1',
      tasks: [{ ...blankTask(), id: 'task-1', title: 'Read the handbook' },
              { ...blankTask(), title: 'Not saved yet' }],
    }))
    expect(await screen.findByText('Welcome video')).toBeInTheDocument()
    expect(await screen.findByText('Handbook part 1')).toBeInTheDocument()
    // One read for the quest, one for the saved task; the unsaved task has no
    // id and asks for nothing.
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    expect(api.get).toHaveBeenCalledWith('/api/sis/quests/quest-1/resources')
  })

  it('offers nothing to attach to on a brand-new draft', () => {
    render(form({ tasks: [blankTask()] }))
    expect(screen.queryByRole('button', { name: '+ Add a resource' })).not.toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })
})
