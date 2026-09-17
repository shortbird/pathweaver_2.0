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

describe('tasksCarryChosenSubjects', () => {
  it('is false for tasks on their pillar default, or with no subject at all', () => {
    expect(tasksCarryChosenSubjects([task(), task({ diploma_subjects: [] })])).toBe(false)
  })

  it('is true once any task names a subject other than its default, or more than one', () => {
    expect(tasksCarryChosenSubjects([task(), task({ diploma_subjects: ['social_studies'] })])).toBe(true)
    expect(tasksCarryChosenSubjects([task({ diploma_subjects: ['electives', 'language_arts'] })])).toBe(true)
  })
})
