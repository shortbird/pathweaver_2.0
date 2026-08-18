/**
 * The instructional text under a task title is editable.
 *
 * It was always stored (quest_template_tasks.description), always copied onto
 * the learner's account, and always rendered — the preview modal shows it, and
 * so does the learner's own task list. But no form ever wrote it: the AI drafter
 * set one when it generated a task, and nothing else could. So a task typed by
 * hand had no instructions at all, and a generated one could not be corrected.
 *
 * iCreate hit exactly that on the orientation quest (2026-08-17): "when you
 * preview the draft, you can see the instructional text that goes with the task,
 * which is nice. But there is no way to edit that instructional text!" Ten of
 * that quest's sixteen tasks were hand-added and reached families blank.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import QuestDraftForm, { blankTask, MIN_TASK_XP } from './QuestDraftForm'

const renderForm = (tasks, setTasks = () => {}) => render(
  <QuestDraftForm
    title="" setTitle={() => {}}
    description="" setDescription={() => {}}
    tasks={tasks} setTasks={setTasks}
  />
)

describe('task instructions are editable', () => {
  it('gives every task a field for its instructions', () => {
    renderForm([{ ...blankTask(), title: 'Find the Lost & Found' }])
    expect(screen.getByLabelText('Task 1 instructions')).toBeInTheDocument()
  })

  it('shows the instructions a task already has', () => {
    renderForm([{ ...blankTask(), title: 'Find it', description: 'Walk the building and look.' }])
    expect(screen.getByLabelText('Task 1 instructions')).toHaveValue('Walk the building and look.')
  })

  it('edits are handed back to the caller to save', () => {
    const setTasks = vi.fn()
    renderForm([{ ...blankTask(), title: 'Find it' }], setTasks)
    fireEvent.change(screen.getByLabelText('Task 1 instructions'),
      { target: { value: 'Ask a staff member if you get stuck.' } })
    // setTasks is called with an updater, so apply it to see what it produces.
    const updater = setTasks.mock.calls[0][0]
    const next = updater([{ ...blankTask(), title: 'Find it' }])
    expect(next[0].description).toBe('Ask a staff member if you get stuck.')
  })

  it('a task added by hand carries the field, not just generated ones', () => {
    // The gap that produced the blank tasks: the AI set a description, the
    // "add a task" button produced an object with no description key at all.
    expect(blankTask()).toHaveProperty('description', '')
  })

  it('does not disturb the title next to it', () => {
    const setTasks = vi.fn()
    renderForm([{ ...blankTask(), title: 'Find it', description: 'old' }], setTasks)
    fireEvent.change(screen.getByLabelText('Task 1 instructions'), { target: { value: 'new' } })
    const next = setTasks.mock.calls[0][0]([{ ...blankTask(), title: 'Find it', description: 'old' }])
    expect(next[0].title).toBe('Find it')
  })
})

describe('tasks can be reordered', () => {
  // Order IS order_index — the sequence a learner walks the quest in. A
  // sixteen-station orientation route has an order that matters, and before
  // this the only way to move one was to retype every title below it.
  const three = () => [
    { ...blankTask(), title: 'first' },
    { ...blankTask(), title: 'second' },
    { ...blankTask(), title: 'third' },
  ]

  const applyClick = (label) => {
    const setTasks = vi.fn()
    renderForm(three(), setTasks)
    fireEvent.click(screen.getByLabelText(label))
    return setTasks.mock.calls[0][0](three()).map((t) => t.title)
  }

  it('moves a task up', () => {
    expect(applyClick('Move task 2 up')).toEqual(['second', 'first', 'third'])
  })

  it('moves a task down', () => {
    expect(applyClick('Move task 2 down')).toEqual(['first', 'third', 'second'])
  })

  it('cannot move the first task up', () => {
    renderForm(three())
    expect(screen.getByLabelText('Move task 1 up')).toBeDisabled()
  })

  it('cannot move the last task down', () => {
    renderForm(three())
    expect(screen.getByLabelText('Move task 3 down')).toBeDisabled()
  })

  it('carries the whole task, not just its title', () => {
    const setTasks = vi.fn()
    const tasks = [
      { ...blankTask(), title: 'first', description: 'do this', xp_value: 50 },
      { ...blankTask(), title: 'second', description: 'then this', xp_value: 75 },
    ]
    renderForm(tasks, setTasks)
    fireEvent.click(screen.getByLabelText('Move task 1 down'))
    const next = setTasks.mock.calls[0][0](tasks)
    expect(next[0]).toMatchObject({ title: 'second', description: 'then this', xp_value: 75 })
    expect(next[1]).toMatchObject({ title: 'first', description: 'do this', xp_value: 50 })
  })
})

describe('the XP floor is stated rather than silently applied', () => {
  it('names the floor where the XP is typed', () => {
    renderForm([blankTask()])
    // "I told it to give all the tasks 5 XP, it gave them all 25" — 25 is the
    // platform floor, not the model disobeying, and nothing said so.
    expect(screen.getByText(/at least 25 XP/i)).toBeInTheDocument()
  })

  it('will not let the picker produce a value the backend would raise', () => {
    renderForm([blankTask()])
    expect(screen.getByLabelText('Task 1 XP')).toHaveAttribute('min', String(MIN_TASK_XP))
  })
})
