/**
 * Two Horizon tickets on the quest form, both from Jon England, 2026-10-07.
 *
 * a6f7b429: "When we save a task, the XP minimum goes back to 25 and overrides
 * the custom XP we set for that task... Students are now seeing odd totals
 * like 100/65." An org may now lower its task XP floor; the quest editor's
 * payload carries it (min_task_xp) and the form's min, step and copy follow
 * it, so the picker never offers a number the server will raise.
 *
 * 19646f5f: "Right now we can only add links at the quest level... Being able
 * to add a link inside each task would help a lot." Per-task links existed,
 * behind an unlabeled "+ Add a resource" on saved tasks and a small text link
 * on unsaved ones. Each task now says "Links and files for this task", and the
 * quest-level help says where one task's links go.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import QuestDraftForm, { blankTask, TASK_LINKS_LABEL } from './QuestDraftForm'

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

const noop = () => {}
const form = (props) => render(
  <QuestDraftForm title="T" setTitle={noop} description="D" setDescription={noop}
    setTasks={noop} tasks={[blankTask()]} {...props} />
)

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { quest: [], by_task: {} } })
})

describe('the task XP floor comes from the org (a6f7b429)', () => {
  it('at Optio\'s default 25: min 25, step 25, and the copy says 25', () => {
    form({ minTaskXp: 25 })
    const xp = screen.getByLabelText('Task 1 XP')
    expect(xp).toHaveAttribute('min', '25')
    expect(xp).toHaveAttribute('step', '25')
    expect(screen.getByText(/at least 25 XP/)).toBeInTheDocument()
  })

  it('with no floor passed it is still 25', () => {
    form({})
    expect(screen.getByLabelText('Task 1 XP')).toHaveAttribute('min', '25')
  })

  it('at a floor of 5: min 5, step 1, and the copy says 5', () => {
    form({ minTaskXp: 5 })
    const xp = screen.getByLabelText('Task 1 XP')
    expect(xp).toHaveAttribute('min', '5')
    expect(xp).toHaveAttribute('step', '1')
    expect(screen.getByText(/at least 5 XP/)).toBeInTheDocument()
    expect(screen.queryByText(/at least 25 XP/)).toBeNull()
  })

  it('an invalid floor reads as 25', () => {
    form({ minTaskXp: 0 })
    expect(screen.getByLabelText('Task 1 XP')).toHaveAttribute('min', '25')
  })
})

describe('links on each task are labelled (19646f5f)', () => {
  it('a saved task shows "Links and files for this task"', async () => {
    form({ questId: 'quest-1', tasks: [{ ...blankTask(), id: 'task-1', title: 'Read part 1' }] })
    expect(await screen.findByText(TASK_LINKS_LABEL)).toBeInTheDocument()
    expect(TASK_LINKS_LABEL).toBe('Links and files for this task')
    expect(await screen.findByRole('button', { name: '+ Add a link or file' })).toBeInTheDocument()
  })

  it('an unsaved task shows a button with the same label, which saves the quest', () => {
    const save = vi.fn().mockResolvedValue(undefined)
    form({ questId: 'quest-1', onSaveForAttachments: save,
      tasks: [{ ...blankTask(), title: 'Fresh from the AI draft' }] })
    const button = screen.getByRole('button', { name: TASK_LINKS_LABEL })
    fireEvent.click(button)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('the quest-level help says links for one task go on that task', () => {
    form({ questId: 'quest-1' })
    expect(screen.getByText(/A link for one task goes on that task below/)).toBeInTheDocument()
  })
})
