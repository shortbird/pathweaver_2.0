import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import QuestEnrollment from './QuestEnrollment'

// QuestEnrollment reads the viewer's roles for the staff note beside Start
// Quest (ticket a87602cf). Student by default.
const auth = { hasAnyRole: vi.fn(() => false) }
// useHidePillars reads AuthContext itself, which the AuthContext mock
// here does not export. Pillars shown, as for a learner under 13.
vi.mock('../../hooks/useHidePillars', () => ({ default: () => false }))
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

// A quest nobody has authored tasks for, not yet picked up. Since the AI
// "starter paths" card was removed (2026-09-28) this prompt is the only way to
// start such a quest, so it must always offer a button.
const unauthored = (extra) => ({
  user_enrollment: null,
  quest_tasks: [],
  template_tasks: [],
  allow_custom_tasks: true,
  ...extra,
})

describe('QuestEnrollment start prompt (no authored tasks)', () => {
  beforeEach(() => {
    auth.hasAnyRole.mockReset()
    auth.hasAnyRole.mockReturnValue(false)
    baseProps.onEnroll.mockReset()
    baseProps.onShowPersonalizationWizard.mockReset()
  })

  it('renders for an unenrolled quest with no template tasks', () => {
    render(<QuestEnrollment {...baseProps} quest={unauthored()} />)

    expect(screen.getByText(/ready to personalize this quest/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start personalizing/i })).toBeInTheDocument()
  })

  it('enrolls when Start Personalizing is clicked', () => {
    render(<QuestEnrollment {...baseProps} quest={unauthored()} />)

    fireEvent.click(screen.getByRole('button', { name: /start personalizing/i }))

    expect(baseProps.onEnroll).toHaveBeenCalledTimes(1)
    expect(baseProps.onShowPersonalizationWizard).not.toHaveBeenCalled()
  })

  it('says Starting... and disables while the enrollment is in flight', () => {
    render(<QuestEnrollment {...baseProps} isEnrolling quest={unauthored()} />)

    expect(screen.getByRole('button', { name: /starting\.\.\./i })).toBeDisabled()
  })

  it('is absent when the quest has template tasks', () => {
    render(<QuestEnrollment {...baseProps} quest={notEnrolled()} />)

    expect(screen.queryByRole('button', { name: /start personalizing/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start quest/i })).toBeInTheDocument()
  })

  it('is absent once enrolled (the enrolled prompt opens the wizard instead)', () => {
    render(<QuestEnrollment {...baseProps} quest={unauthored({ user_enrollment: { id: 'e1' } })} />)

    fireEvent.click(screen.getByRole('button', { name: /start personalizing/i }))

    expect(baseProps.onEnroll).not.toHaveBeenCalled()
    expect(baseProps.onShowPersonalizationWizard).toHaveBeenCalled()
  })

  it('is absent for an ended enrollment, which QuestDetail offers to reopen', () => {
    render(<QuestEnrollment {...baseProps} quest={unauthored({ completed_enrollment: true })} />)

    expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument()
  })

  it('tells staff what the button does for students', () => {
    auth.hasAnyRole.mockImplementation((roles) => roles.includes('org_admin'))
    render(<QuestEnrollment {...baseProps} quest={unauthored()} />)

    expect(
      screen.getByText('Students click Start Personalizing to add this quest to their account and build their own tasks.'),
    ).toBeInTheDocument()
  })

  it('still offers a plain Start Quest to a simplified-view program (Treehouse)', () => {
    render(<QuestEnrollment {...baseProps} hidePersonalizationPrompt quest={unauthored()} />)

    expect(screen.queryByText(/personalize/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /start quest/i }))
    expect(baseProps.onEnroll).toHaveBeenCalledTimes(1)
  })

  it('offers no button when the quest takes no custom tasks', () => {
    render(<QuestEnrollment {...baseProps} quest={unauthored({ allow_custom_tasks: false })} />)

    expect(screen.getByText(/contact your teacher/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

// Optional template tasks are ideas the student picks to take with them
// (TemplateTaskPreview, 2026-09-28); required ones always come.
const withIdeas = (extra) => notEnrolled({
  allow_custom_tasks: true,
  template_tasks: [
    { id: 'req', title: 'Plan the garden', is_required: true, pillar: 'stem', xp_value: 50 },
    { id: 'a', title: 'Build a trellis', is_required: false, pillar: 'art', xp_value: 50 },
    { id: 'b', title: 'Start a compost bin', is_required: false, pillar: 'stem', xp_value: 50 },
  ],
  ...extra,
})

describe('QuestEnrollment picking ideas before starting', () => {
  beforeEach(() => {
    auth.hasAnyRole.mockReset()
    auth.hasAnyRole.mockReturnValue(false)
    baseProps.onEnroll.mockReset()
  })

  it('puts Start Quest above the tasks', () => {
    render(<QuestEnrollment {...baseProps} quest={withIdeas()} />)
    const start = screen.getByRole('button', { name: /start quest/i })
    const firstIdea = screen.getByRole('checkbox', { name: /build a trellis/i })
    expect(start.compareDocumentPosition(firstIdea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('offers optional tasks as ideas and required ones as fixed', () => {
    render(<QuestEnrollment {...baseProps} quest={withIdeas()} />)
    expect(screen.getByText('Ways to approach this quest')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(screen.getByText('Every student does these')).toBeInTheDocument()
    expect(screen.getByText(/You'll start with 1 task\./)).toBeInTheDocument()
  })

  it('starts with the picked ideas', () => {
    render(<QuestEnrollment {...baseProps} quest={withIdeas()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /start a compost bin/i }))
    expect(screen.getByText(/You'll start with 2 tasks\./)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /start quest/i }))
    expect(baseProps.onEnroll).toHaveBeenCalledWith({ template_task_ids: ['b'] })
  })

  it('unpicks an idea on a second click', () => {
    render(<QuestEnrollment {...baseProps} quest={withIdeas()} />)
    const idea = screen.getByRole('checkbox', { name: /build a trellis/i })
    fireEvent.click(idea)
    fireEvent.click(idea)
    expect(idea).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByRole('button', { name: /start quest/i }))
    expect(baseProps.onEnroll).toHaveBeenCalledWith({ template_task_ids: [] })
  })

  it('says the student builds their own when there is nothing to start with', () => {
    const quest = withIdeas({ template_tasks: withIdeas().template_tasks.filter((t) => !t.is_required) })
    render(<QuestEnrollment {...baseProps} quest={quest} />)
    expect(screen.getByText(/You'll build your own tasks next\./)).toBeInTheDocument()
  })

  it('offers no picking when the quest forbids custom tasks, and takes every task', () => {
    render(<QuestEnrollment {...baseProps} quest={withIdeas({ allow_custom_tasks: false })} />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /start quest/i }))
    expect(baseProps.onEnroll).toHaveBeenCalledWith()
  })
})
