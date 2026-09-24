/**
 * Moving quests up and down, and attaching to the master quest. (Moving tasks
 * is the quest editor's since P6; see questEditor.test.jsx.)
 *
 * iCreate, 2026-09-14 (c7d1f7a5), three asks in one report:
 *   - "I would also really like to be able to move the quests up and down."
 *   - "when you edit a quest, you can't move the tasks up and down. You can
 *      only do that when you first create the quest."
 *   - "I know you added the ability to add resources and links to the quests
 *      somewhere, but I can't do that currently under curriculum."
 *
 * The task list goes to the server whole and in order (a single move is not
 * accepted -- see utils.template_tasks.reorder_template_tasks). The quest list
 * already went whole through the PUT; the arrows only change the order it is
 * sent in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CurriculumResources from './CurriculumResources'

// The curriculum panel lists its quest drafts through react-query (P6).
const withQuery = (ui) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {ui}
  </QueryClientProvider>
)

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))
vi.mock('../../pages/sis/useSisOrg', () => ({
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(async () => true) }))

const task = (id, title, order_index) => ({
  id, title, description: '', pillar: 'art', xp_value: 50, is_required: true, order_index,
})
const TASKS = [task('t1', 'Sketch', 0), task('t2', 'Paint', 1), task('t3', 'Frame', 2)]

// Moving a preset task up and down is the quest editor's now, saved with the
// whole list: components/sis/questEditor.test.jsx.

describe('reordering the quests on a curriculum, and the master quest\'s resources', () => {
  beforeEach(() => vi.clearAllMocks())
  const QUESTS = [{ id: 'q1', title: 'Alpha' }, { id: 'q2', title: 'Beta' }, { id: 'q3', title: 'Gamma' }]

  const mount = async () => {
    api.get.mockImplementation(async (url) => {
      if (url.includes('/api/sis/quests/')) return { data: { success: true, quest: [], by_task: {} } }
      if (url.includes('/api/sis/quest-editor/drafts')) return { data: { drafts: [] } }
      if (url.includes('/api/sis/quest-editor/q1')) {
        return { data: { quest: { id: 'q1', title: 'Alpha', description: '', is_active: true, is_draft: false,
          editable: true, can_lock_xp: true, tasks: [], xp_threshold: 0 } } }
      }
      if (url.includes('/curriculum/cur1/resources')) return { data: { success: true, quests: QUESTS } }
      if (url.includes('/assignable-quests')) return { data: { success: true, quests: [] } }
      if (url.includes('/curricula')) return { data: { on: [], available: [] } }
      if (url.includes('/quests/q1/tasks')) {
        return { data: { success: true, editable: true, quest: { id: 'q1', title: 'Alpha', description: '' }, tasks: [] } }
      }
      return { data: { success: true } }
    })
    render(withQuery(<CurriculumResources orgId="org1" curriculumId="cur1" canManage onChanged={vi.fn()} />))
    await screen.findByText('Beta')
  }

  it('re-sends the quest set in the new order when one moves down', async () => {
    await mount()
    api.put.mockResolvedValue({ data: { success: true, pushed_to_classes: 0 } })
    fireEvent.click(screen.getByLabelText('Move Alpha down'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      expect.stringContaining('/curriculum/cur1/quests'),
      { quest_ids: ['q2', 'q1', 'q3'] }))
    const titles = [...document.querySelectorAll('li span.truncate')].map((el) => el.textContent)
    expect(titles).toEqual(['Beta', 'Alpha', 'Gamma'])
  })

  it('shows the resources panel on the quest itself, not only on a class', async () => {
    // Since P6 the quest's attachments are in the quest editor, opened from
    // the curriculum's own row.
    await mount()
    fireEvent.click(screen.getByText('Alpha'))
    fireEvent.click(await screen.findByLabelText('Edit Alpha'))
    expect(await screen.findByText('Resources')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/sis/quests/q1/resources')
  })
})
