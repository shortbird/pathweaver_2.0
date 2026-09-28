/**
 * With the pillars hidden (a student 13+, or a school that switched them off)
 * the task's diploma subject leads: "Language Arts", not "Communication".
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TaskDetailsSection from '../taskWorkspace/TaskDetailsSection'

vi.mock('../QuestResourceList', () => ({ default: () => null }))

const TASK = {
  id: 't1',
  title: 'Semester check-in',
  description: 'Show the work from this semester.',
  xp_value: 1000,
  subject_xp_distribution: { language_arts: 1000 },
}
const PILLAR = { name: 'Communication', color: '#3b82f6' }

const renderDetails = (pillarsVisible, task = TASK) =>
  render(
    <TaskDetailsSection
      task={task}
      pillarData={PILLAR}
      pillarsVisible={pillarsVisible}
      isDescriptionExpanded={false}
      setIsDescriptionExpanded={() => {}}
      setIsEditModalOpen={() => {}}
      setIsStepsModalOpen={() => {}}
      canUseTaskGeneration={false}
    />
  )

describe('task details lead label', () => {
  it('leads with the diploma subject when pillars are hidden', () => {
    renderDetails(false)
    expect(screen.getByTestId('task-subject-chip')).toHaveTextContent('Language Arts')
    expect(screen.queryByText('Communication')).not.toBeInTheDocument()
  })

  it('shows every subject with its XP, biggest first, in one section', () => {
    renderDetails(false, { ...TASK, xp_value: 200, subject_xp_distribution: { science: 50, math: 150 } })
    const chips = screen.getAllByTestId('task-subject-chip')
    expect(chips.map(c => c.textContent)).toEqual(['Math150 XP', 'Science50 XP'])
    // The total still shows beside a split, and the old Credits row is gone.
    expect(screen.getByText('200 XP')).toBeInTheDocument()
    expect(screen.queryByText('Credits')).not.toBeInTheDocument()
  })

  it('colours each subject by its own accent when credit is keyed by name', () => {
    // Tasks store credit under the subject NAME. A key-only colour lookup
    // painted both of these the same fallback grey (2026-09-28).
    renderDetails(false, { ...TASK, xp_value: 100, subject_xp_distribution: { 'Digital Literacy': 50, 'Fine Arts': 50 } })
    const [a, b] = screen.getAllByTestId('task-subject-chip').map(c => c.style.backgroundColor)
    expect(a).not.toBe(b)
    expect([a, b]).not.toContain('rgb(107, 114, 128)')
  })

  it('does not repeat the total when one subject holds all of it', () => {
    renderDetails(false)
    expect(screen.getAllByText(/1000 XP/)).toHaveLength(1)
  })

  it('keeps the pillar and the Credits row, and no subject chips, when pillars show', () => {
    renderDetails(true)
    expect(screen.getByText('Communication')).toBeInTheDocument()
    expect(screen.getByText('Credits')).toBeInTheDocument()
    expect(screen.queryByTestId('task-subject-chip')).not.toBeInTheDocument()
  })
})
