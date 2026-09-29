/**
 * A moment on the quest page has no Edit button.
 *
 * Tickets a1757214 / badbc85f / 40fdda03 (Sentry, 2026-09-28): a moment
 * attached to a quest is shown as a virtual task with id "moment-<uuid>". The
 * Edit button opened the task editor for it, which asked
 * GET /api/tasks/authoring-rules?task_id=moment-... and the server answered
 * 500. There is no task row to edit, so the button must not be offered.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TaskDetailsSection from '../taskWorkspace/TaskDetailsSection'

vi.mock('../QuestResourceList', () => ({ default: () => null }))

const renderDetails = (task, setIsEditModalOpen = () => {}) =>
  render(
    <TaskDetailsSection
      task={task}
      pillarData={{ name: 'STEM', color: '#3b82f6' }}
      pillarsVisible
      isDescriptionExpanded={false}
      setIsDescriptionExpanded={() => {}}
      setIsEditModalOpen={setIsEditModalOpen}
      setIsStepsModalOpen={() => {}}
      canUseTaskGeneration={false}
    />
  )

describe('Edit button on the task details', () => {
  it('is not offered on a moment', () => {
    renderDetails({ id: 'moment-915a0ca3-a8e4-4e67-a376-4a9471452d28', title: 'Museum trip', is_moment: true, is_completed: true })
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
  })

  it('still opens the editor on a real task', () => {
    const open = vi.fn()
    renderDetails({ id: 't1', title: 'Build a bridge', xp_value: 100 }, open)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(open).toHaveBeenCalledWith(true)
  })
})
