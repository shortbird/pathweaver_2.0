import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import QuestEnrollment from './QuestEnrollment'

// QuestEnrollment reads the viewer's roles for the staff note beside Start
// Quest (ticket a87602cf). Student by default.
const auth = { hasAnyRole: vi.fn(() => false) }
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => auth,
}))

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

// A quest not yet picked up, with an authored task list — what a staff member
// or student sees on /quests/<id> before starting it.
const notEnrolled = (extra) => ({
  user_enrollment: null,
  template_tasks: [
    {
      id: 't1',
      title: 'Plan the garden',
      description: 'Step one: measure the bed.\nStep two: sketch the rows.',
      is_required: true,
      pillar: 'stem',
      xp_value: 50,
    },
  ],
  ...extra,
})

describe('QuestEnrollment template tasks', () => {
  beforeEach(() => {
    auth.hasAnyRole.mockReset()
    auth.hasAnyRole.mockReturnValue(false)
  })

  it('keeps the hard returns in a task description (ticket 3a9e16c1)', () => {
    render(<QuestEnrollment {...baseProps} quest={notEnrolled()} />)

    const description = screen.getByText(/Step one: measure the bed\./)
    expect(description.textContent).toContain('\n')
    expect(description).toHaveClass('whitespace-pre-line')
  })

  it('labels the button Start Quest, as the quest cards and mobile do (ticket a87602cf)', () => {
    render(<QuestEnrollment {...baseProps} quest={notEnrolled()} />)

    expect(screen.getByRole('button', { name: /start quest/i })).toBeInTheDocument()
    expect(screen.queryByText(/pick up quest/i)).not.toBeInTheDocument()
  })

  it('says Starting... while the enrollment is in flight (ticket a87602cf)', () => {
    render(<QuestEnrollment {...baseProps} isEnrolling quest={notEnrolled()} />)

    expect(screen.getByRole('button', { name: /starting\.\.\./i })).toBeDisabled()
  })

  it('tells an org_admin what Start Quest does for students (ticket a87602cf)', () => {
    auth.hasAnyRole.mockImplementation((roles) => roles.includes('org_admin'))
    render(<QuestEnrollment {...baseProps} quest={notEnrolled()} />)

    expect(
      screen.getByText('Students click Start Quest to add this quest and its tasks to their account.'),
    ).toBeInTheDocument()
    // Staff keep the button: they pick quests up to build task lists.
    expect(screen.getByRole('button', { name: /start quest/i })).toBeInTheDocument()
  })

  it('does not show the staff note to a student (ticket a87602cf)', () => {
    render(<QuestEnrollment {...baseProps} quest={notEnrolled()} />)

    expect(screen.queryByText(/students click start quest/i)).not.toBeInTheDocument()
  })
})
