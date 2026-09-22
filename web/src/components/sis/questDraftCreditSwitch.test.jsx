/**
 * One "counts toward high school credit" switch per quest, over the per-task
 * subject pickers.
 *
 * Credit lives on tasks (a quest can earn credit in several subjects at once),
 * so the switch is not a field: on, each task shows the subject it earns
 * credit toward; off, the pickers are out of the way and each task keeps its
 * pillar's default. Molly (iCreate, 2026-09-17, 1aed3f6c): "Instead of
 * 'counts towards credit' on every task showing, it would be nice to just
 * select 'counts towards high school credit' once per quest. Then the subject
 * areas could show up on the tasks and be filled in."
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import QuestDraftForm, { tasksCarryChosenSubjects } from './QuestDraftForm'

const task = (over = {}) => ({
  title: 'Read the handbook', description: '', pillar: 'art', xp_value: 100, is_required: true,
  ...over,
})

const draft = (tasks, props = {}) => render(
  <QuestDraftForm
    title="" setTitle={() => {}}
    description="" setDescription={() => {}}
    tasks={tasks} setTasks={() => {}}
    {...props}
  />
)

describe('the quest-level credit switch', () => {
  it('starts on for a student quest and shows a subject picker on every task', () => {
    draft([task(), task({ title: 'Visit the makerspace' })])
    expect(screen.getByLabelText(/counts toward high school credit/i)).toBeChecked()
    expect(screen.getAllByText('Counts toward credit')).toHaveLength(2)
  })

  it('starts off where the caller says so, and the pickers are gone', () => {
    draft([task(), task()], { creditDefault: false })
    expect(screen.getByLabelText(/counts toward high school credit/i)).not.toBeChecked()
    expect(screen.queryByText('Counts toward credit')).toBeNull()
    // The tasks themselves are still there to edit.
    expect(screen.getByLabelText('Task 1 XP')).toBeInTheDocument()
  })

  it('turning it on reveals the pickers, turning it off hides them again', () => {
    draft([task()], { creditDefault: false })
    const toggle = screen.getByLabelText(/counts toward high school credit/i)
    fireEvent.click(toggle)
    expect(screen.getAllByText('Counts toward credit')).toHaveLength(1)
    fireEvent.click(toggle)
    expect(screen.queryByText('Counts toward credit')).toBeNull()
  })

  it('starts on regardless of the default when a task already carries a chosen subject', () => {
    // A US History unit saved with Social Studies on its tasks must not open
    // with its subjects hidden because the page defaults the switch off.
    draft([task({ pillar: 'civics', diploma_subjects: ['social_studies', 'language_arts'] })],
          { creditDefault: false })
    expect(screen.getByLabelText(/counts toward high school credit/i)).toBeChecked()
  })
})

// iCreate, 2026-09-22 (f2c4d88e): "I marked this as 'Not for high school
// credit' but it is showing Credits - science and language arts." The switch
// only set showSubjects, so the tasks still saved with their pillar's default
// subject and the quest page credited them anyway.
describe('the credit switch writes what it says', () => {
  const withTasks = (initial, props = {}) => {
    let tasks = initial
    const setTasks = (fn) => { tasks = typeof fn === 'function' ? fn(tasks) : fn }
    const { rerender } = render(
      <QuestDraftForm
        title="" setTitle={() => {}}
        description="" setDescription={() => {}}
        tasks={tasks} setTasks={setTasks}
        {...props}
      />
    )
    return { get: () => tasks, rerender }
  }

  it('turning it off clears the subject columns on every task', () => {
    const state = withTasks([
      task({ pillar: 'stem', diploma_subjects: ['science'], subject_xp_distribution: { science: 100 } }),
      task({ pillar: 'civics', diploma_subjects: ['social_studies'], subject_xp_distribution: { social_studies: 100 } }),
    ])
    fireEvent.click(screen.getByLabelText(/counts toward high school credit/i))
    expect(state.get().every((t) => t.diploma_subjects.length === 0)).toBe(true)
    expect(state.get().every((t) => Object.keys(t.subject_xp_distribution).length === 0)).toBe(true)
  })

  // An omitted column takes the table's ['Electives'] default. "No credit"
  // has to be a written empty list, not a missing key.
  it('clears to an empty list rather than dropping the columns', () => {
    const state = withTasks([task({ pillar: 'stem', diploma_subjects: ['science'] })])
    fireEvent.click(screen.getByLabelText(/counts toward high school credit/i))
    expect(state.get()[0].diploma_subjects).toEqual([])
    expect(state.get()[0].subject_xp_distribution).toEqual({})
  })

  it('turning it back on refills each task from its pillar', () => {
    const state = withTasks([task({ pillar: 'stem', diploma_subjects: [] })], { creditDefault: false })
    fireEvent.click(screen.getByLabelText(/counts toward high school credit/i))
    expect(state.get()[0].diploma_subjects).toEqual(['science'])
  })

  it('says plainly what off means', () => {
    draft([task()], { creditDefault: false })
    expect(screen.getByText(/no diploma subject credit/i)).toBeInTheDocument()
  })
})

describe('tasksCarryChosenSubjects', () => {
  it('is false for tasks on their pillar default, or with no subject at all', () => {
    expect(tasksCarryChosenSubjects([task(), task({ diploma_subjects: [] })])).toBe(false)
  })

  it('is true once any task names a subject other than its default, or more than one', () => {
    expect(tasksCarryChosenSubjects([task(), task({ diploma_subjects: ['social_studies'] })])).toBe(true)
    expect(tasksCarryChosenSubjects([task({ diploma_subjects: ['electives', 'language_arts'] })])).toBe(true)
  })
})
