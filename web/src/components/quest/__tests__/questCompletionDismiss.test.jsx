import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The Quest Complete screen must be dismissable.
 *
 * Finn O'Neill, 2026-09-07: "I end up having to click add more and then click
 * cancel to just exit out of that screen because there isn't just an X button."
 * The celebration auto-opens on the last task, and the task he had just
 * finished is behind it waiting for a Request Credit press -- so the only exit
 * was to open the add-tasks picker and cancel it.
 *
 * Neither of the two actions is required: the quest is already complete either
 * way. Close, backdrop and Escape all just close.
 */

vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, effectiveRole: 'student' }),
}))

import QuestCompletionCelebration from '../QuestCompletionCelebration'

const quest = {
  id: 'q1',
  title: 'Social Studies 4',
  quest_tasks: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
}

let onClose, onAddMoreTasks, onFinishQuest

const show = (props = {}) => {
  onClose = vi.fn()
  onAddMoreTasks = vi.fn()
  onFinishQuest = vi.fn()
  return render(
    <MemoryRouter>
      <QuestCompletionCelebration
        quest={quest}
        completedTasksCount={3}
        totalXP={600}
        onAddMoreTasks={onAddMoreTasks}
        onFinishQuest={onFinishQuest}
        onClose={onClose}
        {...props}
      />
    </MemoryRouter>
  )
}

describe('Quest Complete screen', () => {
  beforeEach(() => vi.clearAllMocks())

  it('has a close button that dismisses without adding or finishing', () => {
    show()
    fireEvent.click(screen.getByLabelText('Close'))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onAddMoreTasks).not.toHaveBeenCalled()
    expect(onFinishQuest).not.toHaveBeenCalled()
  })

  it('closes when the backdrop is clicked', () => {
    const { container } = show()
    fireEvent.click(container.querySelector('button[aria-hidden="true"]'))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onFinishQuest).not.toHaveBeenCalled()
  })

  it('does not close when the panel itself is clicked', () => {
    show()
    fireEvent.click(screen.getByText('Quest Complete!'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('offers exactly one Close to assistive tech', () => {
    // The backdrop duplicates the X; a screen reader should hear one.
    show()
    expect(screen.getAllByLabelText('Close')).toHaveLength(1)
  })

  it('closes on Escape', () => {
    show()
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('leaves Escape to the confirm dialog once that is open', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: /Finish Quest/i }))
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('still offers both original actions', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: /Add More Tasks/i }))

    expect(onAddMoreTasks).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('is dismissable on a class quest too', () => {
    show({ isClass: true, onSubmitForReview: vi.fn() })
    fireEvent.click(screen.getByLabelText('Close'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
