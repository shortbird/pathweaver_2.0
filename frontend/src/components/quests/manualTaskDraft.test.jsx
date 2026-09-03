/**
 * Manual task creation survives a crash.
 *
 * From a student's bug bounty submission, 2026-08-27:
 *
 *   "every time I work on quest tasks and it crashes, all of my tasks are
 *    deleted. I was hoping you could add an autosave feature kinda inbetween
 *    making tasks."
 *
 * She was right about the mechanism. Tasks accumulated in React state and
 * nothing reached the server until the single batch POST behind "Finish", so
 * anything that ended the page early -- a crash, a reload, an expired session,
 * a stray back-navigation -- took the lot. The AI path never had this problem:
 * it POSTs each accepted task as it is accepted.
 *
 * These cover the promise the fix makes: work in progress comes back, it is
 * scoped to the right child, and it stops being kept once it is really saved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ManualTaskCreator from './ManualTaskCreator'
import api from '../../services/api'

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../hooks/useCanEditXp', () => ({ default: () => true }))
vi.mock('../../hooks/useHidePillars', () => ({ default: () => false }))

const QUEST = 'quest-1'

const renderCreator = (props = {}) =>
  render(
    <ManualTaskCreator
      questId={QUEST}
      sessionId="session-1"
      onTasksCreated={vi.fn()}
      onCancel={vi.fn()}
      {...props}
    />
  )

/** Fill the form and press Add, the way a student builds one task. */
const addTask = (title, description = 'Something I will actually do') => {
  fireEvent.change(screen.getByLabelText(/Task Title/i), { target: { value: title } })
  fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: description } })
  fireEvent.change(screen.getByLabelText(/^Pillar/i), { target: { value: 'stem' } })
  fireEvent.click(screen.getByRole('button', { name: /Add This Task/i }))
}

const draftKey = (scope = 'self') => `optio:manual-tasks:${scope}:${QUEST}`
const storedTasks = (scope) => JSON.parse(localStorage.getItem(draftKey(scope))).addedTasks

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('manual task drafts', () => {
  it('keeps tasks that were never submitted, and brings them back', () => {
    const { unmount } = renderCreator()
    addTask('Interview my grandpa')
    addTask('Build the shelf')

    expect(storedTasks()).toHaveLength(2)

    // The crash: the component goes away without Finish ever being pressed.
    unmount()
    expect(api.post).not.toHaveBeenCalled()

    renderCreator()
    expect(screen.getByText('Interview my grandpa')).toBeInTheDocument()
    expect(screen.getByText('Build the shelf')).toBeInTheDocument()
    expect(screen.getByText(/Picked up where you left off/i)).toBeInTheDocument()
  })

  it('keeps the half-typed task too, not just the finished ones', () => {
    const { unmount } = renderCreator()
    fireEvent.change(screen.getByLabelText(/Task Title/i), {
      target: { value: 'Half a thought' },
    })
    unmount()

    renderCreator()
    expect(screen.getByLabelText(/Task Title/i)).toHaveValue('Half a thought')
  })

  it('stops keeping the draft once the tasks are really on the server', async () => {
    api.post.mockResolvedValue({ data: { success: true, tasks: [] } })
    const onTasksCreated = vi.fn()

    renderCreator({ onTasksCreated })
    addTask('Interview my grandpa')
    fireEvent.click(screen.getByRole('button', { name: /^Finish/i }))

    await vi.waitFor(() => expect(onTasksCreated).toHaveBeenCalled())
    expect(localStorage.getItem(draftKey())).toBeNull()
  })

  it('keeps the draft when the save fails, which is when it matters most', async () => {
    api.post.mockRejectedValue(new Error('network gone'))

    renderCreator()
    addTask('Interview my grandpa')
    fireEvent.click(screen.getByRole('button', { name: /^Finish/i }))

    await vi.waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(storedTasks()).toHaveLength(1)
  })

  it('does not hand one child\'s unsubmitted tasks to another', () => {
    const { unmount } = renderCreator({ draftScope: 'child-a' })
    addTask('Only for child A')
    unmount()

    renderCreator({ draftScope: 'child-b' })
    expect(screen.queryByText('Only for child A')).not.toBeInTheDocument()
    expect(screen.queryByText(/Picked up where you left off/i)).not.toBeInTheDocument()
  })

  it('lets a student throw the restored draft away', () => {
    const { unmount } = renderCreator()
    addTask('Changed my mind about this')
    unmount()

    renderCreator()
    fireEvent.click(screen.getByRole('button', { name: /Start over/i }))

    expect(screen.queryByText('Changed my mind about this')).not.toBeInTheDocument()
    expect(localStorage.getItem(draftKey())).toBeNull()
  })

  it('ignores a draft old enough to be forgotten', () => {
    localStorage.setItem(draftKey(), JSON.stringify({
      addedTasks: [{ title: 'From another era', description: 'x', xp_value: 100 }],
      currentTask: {},
      savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
    }))

    renderCreator()
    expect(screen.queryByText('From another era')).not.toBeInTheDocument()
    expect(localStorage.getItem(draftKey())).toBeNull()
  })

  it('still works when localStorage throws, which is Safari private mode', () => {
    const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    try {
      renderCreator()
      addTask('Works anyway')
      expect(screen.getByText('Works anyway')).toBeInTheDocument()
    } finally {
      spy.mockRestore()
    }
  })
})
