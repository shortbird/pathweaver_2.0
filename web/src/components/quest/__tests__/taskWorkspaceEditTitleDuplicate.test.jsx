/**
 * What the task workspace sends when the edit dialog saves.
 *
 * Ticket 03ee5c2d, Karen Boyd (parent, Optio Academy): "everything but the
 * title can be edited." handleSaveTaskEdit dropped every field but pillar,
 * XP, subjects and the Definition of Done, so a title from the dialog would
 * never have reached PUT /api/tasks/<id>.
 *
 * Ticket 4476c061, Karen Boyd: "copy an existing task to create a new one by
 * just changing the title while keeping the same task description and
 * evidence requirements." Duplicate posts to /api/tasks/<id>/duplicate and
 * hands the copy up, so the quest page can add and select it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TaskWorkspace from '../TaskWorkspace'

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  toast: { success: vi.fn(), error: vi.fn() },
}))
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
vi.mock('../../../services/evidenceDocumentService', () => ({
  evidenceDocumentService: {
    getDocument: vi.fn(() => Promise.resolve({ success: true, blocks: [] })),
    saveDocument: vi.fn(),
    uploadFile: vi.fn(),
  },
}))
// The dialog itself is tested in StudentTaskEditModal.test.jsx. Here it only
// hands the workspace what the real one would.
vi.mock('../StudentTaskEditModal', () => ({
  default: ({ onSave }) => (
    <div>
      <button onClick={() => onSave({ title: 'Read chapter 4', pillar: 'stem', xp_value: 75 })}>
        save-title
      </button>
      <button onClick={() => onSave({ duplicate: true })}>duplicate</button>
    </div>
  ),
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() },
}))
vi.mock('../../../services/api', () => ({ default: api }))

const TASK = { id: 'task-1', title: 'Read chapter 3', pillar: 'stem', xp_amount: 75, is_completed: false }

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: {} })
})

const openEditor = async (props = {}) => {
  const onTaskUpdate = vi.fn()
  render(<TaskWorkspace task={TASK} tasks={[TASK]} questId="quest-1" onTaskUpdate={onTaskUpdate} {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: /Edit/ }))
  return onTaskUpdate
}

describe('handleSaveTaskEdit', () => {
  it('sends the title with the other fields', async () => {
    api.put.mockResolvedValue({ data: { task: { ...TASK, title: 'Read chapter 4' } } })
    const onTaskUpdate = await openEditor()
    fireEvent.click(screen.getByText('save-title'))

    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const [url, body] = api.put.mock.calls[0]
    expect(url).toBe('/api/tasks/task-1')
    expect(body.title).toBe('Read chapter 4')
    await waitFor(() => expect(onTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Read chapter 4' })))
  })

  it('duplicates through the copy endpoint and hands the copy up, not completed', async () => {
    const copy = { id: 'task-2', title: 'Read chapter 3 (copy)', pillar: 'stem', xp_value: 75 }
    api.post.mockResolvedValue({ data: { success: true, task: copy } })
    const onTaskUpdate = await openEditor()
    fireEvent.click(screen.getByText('duplicate'))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/tasks/task-1/duplicate', {}))
    expect(api.put).not.toHaveBeenCalled()
    await waitFor(() => expect(onTaskUpdate).toHaveBeenCalledWith({ ...copy, is_completed: false }))
  })
})
