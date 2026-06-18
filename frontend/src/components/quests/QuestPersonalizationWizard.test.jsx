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
  api.get.mockResolvedValue({ data: { success: true, subject_xp: [] } })
  api.post.mockResolvedValue({ data: { success: true, tasks: [], approach_label: 'The Personal Site' } })
})

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
