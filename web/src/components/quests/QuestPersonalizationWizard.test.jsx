import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import QuestPersonalizationWizard from './QuestPersonalizationWizard'
import api from '../../services/api'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() }
}))

vi.mock('../../contexts/AIAccessContext', () => ({
  useAIAccess: () => ({ canUseTaskGeneration: true })
}))

let mockUser = { id: 'u1', preferred_challenge_level: null }
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser })
}))

vi.mock('../../utils/logger', () => ({
  default: { error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() }
}))

const PATHS = [
  {
    label: 'The Personal Site',
    description: 'A site that is all about you.',
    tasks: [
      { title: 'Sketch your pages', pillar: 'communication', xp_value: 75, description: 'Plan a sitemap.' },
      { title: 'Build your homepage', pillar: 'stem', xp_value: 125, description: 'Real HTML.' }
    ]
  },
  {
    label: 'The Game',
    description: 'Make a small game.',
    tasks: [
      { title: 'Design the rules', pillar: 'stem', xp_value: 100, description: 'Sketch the rules.' }
    ]
  }
]

const baseProps = {
  questId: 'q1',
  questTitle: 'Build Your Own Website',
  onComplete: vi.fn(),
  onCancel: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUser = { id: 'u1', preferred_challenge_level: null }
  api.get.mockResolvedValue({ data: { success: true, subject_xp: [] } })
  api.post.mockResolvedValue({ data: { success: true, tasks: [], approach_label: 'The Personal Site' } })
})

// Drive the wizard to the AI interests step (step 2).
async function openInterestsStep() {
  api.post.mockResolvedValueOnce({ data: { session_id: 'sess-1' } })
  fireEvent.click(await screen.findByText('AI Generate'))
  await screen.findByText('Challenge Level')
}

// Drive the wizard to the one-at-a-time review step (step 4) with given tasks.
async function openReviewStep(tasks) {
  await openInterestsStep()
  api.post.mockResolvedValueOnce({ data: { success: true, tasks } })
  fireEvent.click(screen.getByText('Generate Tasks'))
  await screen.findByText('Review Tasks')
}

const AI_TASKS = [
  { title: 'Build a Chess Opening Tracker', description: 'Track your favorite openings.', pillar: 'stem', xp_value: 100, diploma_subjects: { Math: 100 } },
  { title: 'Teach a Friend Chess Basics', description: 'Show a friend how pieces move.', pillar: 'communication', xp_value: 75, diploma_subjects: { Electives: 75 } }
]

describe('QuestPersonalizationWizard - curated paths', () => {
  it('hides the "Choose a Path" option when approachExamples is an empty array', async () => {
    render(<QuestPersonalizationWizard {...baseProps} approachExamples={[]} />)
    expect(await screen.findByText('AI Generate')).toBeInTheDocument()
    expect(screen.getByText('Write My Own')).toBeInTheDocument()
    expect(screen.queryByText('Choose a Path')).not.toBeInTheDocument()
  })

  it('hides the "Choose a Path" option when approachExamples is null', async () => {
    render(<QuestPersonalizationWizard {...baseProps} approachExamples={null} />)
    expect(await screen.findByText('AI Generate')).toBeInTheDocument()
    expect(screen.queryByText('Choose a Path')).not.toBeInTheDocument()
  })

  it('hides the option when entries carry no tasks', async () => {
    render(
      <QuestPersonalizationWizard
        {...baseProps}
        approachExamples={[{ label: 'Empty', description: 'no tasks', tasks: [] }]}
      />
    )
    expect(await screen.findByText('AI Generate')).toBeInTheDocument()
    expect(screen.queryByText('Choose a Path')).not.toBeInTheDocument()
  })

  it('shows the option and opens a picker listing each path', async () => {
    render(<QuestPersonalizationWizard {...baseProps} approachExamples={PATHS} xpThreshold={500} />)
    fireEvent.click(await screen.findByText('Choose a Path'))

    // Picker view lists the path labels and their tasks.
    expect(await screen.findByText('The Personal Site')).toBeInTheDocument()
    expect(screen.getByText('The Game')).toBeInTheDocument()
    expect(screen.getByText('Sketch your pages')).toBeInTheDocument()
  })

  it('creates the path tasks server-side and lands in the post-wizard view', async () => {
    const onComplete = vi.fn()
    render(
      <QuestPersonalizationWizard
        {...baseProps}
        onComplete={onComplete}
        approachExamples={PATHS}
        xpThreshold={500}
      />
    )
    fireEvent.click(await screen.findByText('Choose a Path'))
    await screen.findByText('The Personal Site')

    fireEvent.click(screen.getAllByText('Choose This Path')[0])

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/quests/q1/add-path-tasks', { approach_index: 0 })
      expect(onComplete).toHaveBeenCalled()
    })
  })
})

describe('QuestPersonalizationWizard - challenge level', () => {
  it('renders the three levels with Standard selected by default', async () => {
    render(<QuestPersonalizationWizard {...baseProps} />)
    await openInterestsStep()

    expect(screen.getByText('Easier')).toBeInTheDocument()
    expect(screen.getByText('Standard')).toBeInTheDocument()
    expect(screen.getByText('Challenge')).toBeInTheDocument()
    expect(screen.getByText('Standard').closest('button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('pre-selects the user\'s remembered preference', async () => {
    mockUser = { id: 'u1', preferred_challenge_level: 'challenge' }
    render(<QuestPersonalizationWizard {...baseProps} />)
    await openInterestsStep()

    expect(screen.getByText('Challenge').closest('button')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Standard').closest('button')).toHaveAttribute('aria-pressed', 'false')
  })

  it('sends the selected challenge_level with generate-tasks', async () => {
    render(<QuestPersonalizationWizard {...baseProps} />)
    await openInterestsStep()

    fireEvent.click(screen.getByText('Challenge'))
    api.post.mockResolvedValueOnce({ data: { success: true, tasks: AI_TASKS } })
    fireEvent.click(screen.getByText('Generate Tasks'))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/quests/q1/generate-tasks',
        expect.objectContaining({ challenge_level: 'challenge' })
      )
    })
  })
})

describe('QuestPersonalizationWizard - success criteria', () => {
  it('renders the criteria checklist on the review card', async () => {
    render(<QuestPersonalizationWizard {...baseProps} />)
    await openReviewStep([
      {
        ...AI_TASKS[0],
        success_criteria: ['You played 5 games of chess', 'You wrote down one mistake from each game']
      }
    ])

    expect(screen.getByText('Definition of Done')).toBeInTheDocument()
    expect(screen.getByText('You played 5 games of chess')).toBeInTheDocument()
    expect(screen.getByText('You wrote down one mistake from each game')).toBeInTheDocument()
  })

  it('hides the criteria section when a task has none', async () => {
    render(<QuestPersonalizationWizard {...baseProps} />)
    await openReviewStep(AI_TASKS)

    expect(screen.queryByText('Definition of Done')).not.toBeInTheDocument()
  })

  it('swaps in the adjusted criteria when the dial rewrites a task', async () => {
    render(<QuestPersonalizationWizard {...baseProps} />)
    await openReviewStep([
      { ...AI_TASKS[0], success_criteria: ['You tracked 3 openings'] }
    ])
    expect(screen.getByText('You tracked 3 openings')).toBeInTheDocument()

    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        task: {
          ...AI_TASKS[0],
          xp_value: 150,
          success_criteria: ['You analyzed 3 of your own games', 'You showed a failed attempt and what you changed']
        }
      }
    })
    fireEvent.click(screen.getByText('Harder'))

    await waitFor(() => {
      expect(screen.getByText('You analyzed 3 of your own games')).toBeInTheDocument()
    })
    expect(screen.queryByText('You tracked 3 openings')).not.toBeInTheDocument()
  })
})

describe('QuestPersonalizationWizard - complexity dial', () => {
  it('swaps in the adjusted task and updates the XP badge', async () => {
    render(<QuestPersonalizationWizard {...baseProps} />)
    await openReviewStep(AI_TASKS)

    expect(screen.getByText('Build a Chess Opening Tracker')).toBeInTheDocument()
    expect(screen.getByText('100 XP')).toBeInTheDocument()

    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        task: { title: 'Build a Chess Engine Evaluator', description: 'Harder version.', pillar: 'stem', xp_value: 150, diploma_subjects: { Math: 150 } }
      }
    })
    fireEvent.click(screen.getByText('Harder'))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/quests/q1/adjust-task-difficulty', {
        task: expect.objectContaining({ title: 'Build a Chess Opening Tracker' }),
        direction: 'harder'
      })
      expect(screen.getByText('Build a Chess Engine Evaluator')).toBeInTheDocument()
      expect(screen.getByText('150 XP')).toBeInTheDocument()
    })
  })

  it('restores cached variants when revisiting a difficulty, without new AI calls', async () => {
    render(<QuestPersonalizationWizard {...baseProps} />)
    await openReviewStep(AI_TASKS)

    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        task: { title: 'Build a Chess Engine Evaluator', description: 'Harder version.', pillar: 'stem', xp_value: 150, diploma_subjects: { Math: 150 } }
      }
    })
    fireEvent.click(screen.getByText('Harder'))
    await waitFor(() => expect(screen.getByText('Build a Chess Engine Evaluator')).toBeInTheDocument())
    const callsAfterHarder = api.post.mock.calls.length

    // Step back down: the original task returns from cache, no API call.
    fireEvent.click(screen.getByText('Easier'))
    await waitFor(() => expect(screen.getByText('Build a Chess Opening Tracker')).toBeInTheDocument())
    expect(api.post.mock.calls.length).toBe(callsAfterHarder)

    // Step harder again: the same harder variant returns from cache.
    fireEvent.click(screen.getByText('Harder'))
    await waitFor(() => expect(screen.getByText('Build a Chess Engine Evaluator')).toBeInTheDocument())
    expect(screen.getByText('150 XP')).toBeInTheDocument()
    expect(api.post.mock.calls.length).toBe(callsAfterHarder)
  })

  it('disables the dial after two net steps in one direction', async () => {
    render(<QuestPersonalizationWizard {...baseProps} />)
    await openReviewStep(AI_TASKS)

    const harderBtn = () => screen.getByText('Harder').closest('button')

    for (const xp of [125, 150]) {
      api.post.mockResolvedValueOnce({
        data: { success: true, task: { ...AI_TASKS[0], xp_value: xp } }
      })
      fireEvent.click(harderBtn())
      await waitFor(() => expect(screen.getByText(`${xp} XP`)).toBeInTheDocument())
    }

    expect(harderBtn()).toBeDisabled()
    expect(screen.getByText('Easier').closest('button')).not.toBeDisabled()
  })

  it('keeps the original task when the adjust call fails', async () => {
    render(<QuestPersonalizationWizard {...baseProps} />)
    await openReviewStep(AI_TASKS)

    api.post.mockRejectedValueOnce({ response: { data: { error: 'Failed to adjust task. Please try again.' } } })
    fireEvent.click(screen.getByText('Harder'))

    await waitFor(() => {
      expect(screen.getByText('Failed to adjust task. Please try again.')).toBeInTheDocument()
    })
    expect(screen.getByText('Build a Chess Opening Tracker')).toBeInTheDocument()
    expect(screen.getByText('100 XP')).toBeInTheDocument()
  })
})
