/**
 * The wizard's review step: with the pillars hidden (a student 13+, or a school
 * that switched them off) the task's main diploma subject leads, not the pillar.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TaskReviewStep from './TaskReviewStep'

const TASK = {
  title: 'Write a sonnet',
  description: 'Fourteen lines about the garden.',
  pillar: 'communication',
  xp_value: 150,
  diploma_subjects: { language_arts: 100, fine_arts: 50 },
}

const renderStep = (hidePillars) =>
  render(
    <TaskReviewStep
      acceptedTasks={[]}
      adjustingTask={false}
      currentTask={TASK}
      currentTaskIndex={0}
      generatedTasks={[TASK]}
      getPillarData={() => ({ name: 'Communication' })}
      handleAcceptTask={() => {}}
      handleAdjustTask={() => {}}
      handleSkipTask={() => {}}
      hideDiplomaSubjects={false}
      hidePillars={hidePillars}
      loading={false}
      MAX_ADJUST_STEPS={2}
      onFinish={() => {}}
      setShowFlagModal={() => {}}
      taskAdjustments={{}}
    />
  )

describe('wizard review step lead label', () => {
  it('leads with the diploma subject when pillars are hidden', () => {
    renderStep(true)
    expect(screen.getByTestId('review-lead-subject')).toHaveTextContent('Language Arts')
    expect(screen.queryByText('Communication')).not.toBeInTheDocument()
  })

  it('keeps the pillar when pillars show', () => {
    renderStep(false)
    expect(screen.getByText('Communication')).toBeInTheDocument()
    expect(screen.queryByTestId('review-lead-subject')).not.toBeInTheDocument()
  })
})
