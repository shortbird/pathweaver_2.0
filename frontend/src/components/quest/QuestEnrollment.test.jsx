import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import QuestEnrollment from './QuestEnrollment'

const baseProps = {
  isQuestCompleted: false,
  totalTasks: 0,
  isEnrolling: false,
  onEnroll: vi.fn(),
  onShowPersonalizationWizard: vi.fn(),
  onPreloadWizard: vi.fn(),
}

// An enrolled quest with no tasks yet — the state a student lands in right
// after creating a class.
const emptyEnrolled = (extra) => ({
  quest_tasks: [],
  user_enrollment: { id: 'e1' },
  template_tasks: [],
  ...extra,
})

describe('QuestEnrollment empty state', () => {
  it('speaks in class terms for a credit class', () => {
    render(
      <QuestEnrollment
        {...baseProps}
        quest={emptyEnrolled({ quest_type: 'class', transcript_subject: 'pe' })}
      />,
    )

    expect(screen.getByText(/your class is ready/i)).toBeInTheDocument()
    expect(screen.getByText(/toward your PE credit/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add your first tasks/i })).toBeInTheDocument()
    expect(screen.queryByText(/personalize this quest/i)).not.toBeInTheDocument()
  })

  it('keeps the quest wording for an ordinary quest', () => {
    render(<QuestEnrollment {...baseProps} quest={emptyEnrolled({ quest_type: 'optio' })} />)

    expect(screen.getByText(/ready to personalize this quest/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start personalizing/i })).toBeInTheDocument()
  })
})
