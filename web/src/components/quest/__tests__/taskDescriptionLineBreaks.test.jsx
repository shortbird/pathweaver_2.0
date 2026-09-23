/**
 * Task descriptions keep the hard returns their author typed.
 *
 * iCreate, 2026-09-22, ticket 3a9e16c1: "Can we have formatting in the task
 * descriptions (like hard returns)?" The descriptions were stored with their
 * newlines all along; every web renderer collapsed them into one paragraph
 * because HTML folds whitespace. Mobile Text keeps them already. The fix is
 * `whitespace-pre-line` on each description element, not markdown.
 *
 * QuestEnrollment and the SIS submissions panel carry their own checks in
 * their own test files; these cover the remaining screens that are cheap to
 * render in isolation.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TaskDetailsSection from '../taskWorkspace/TaskDetailsSection'
import TaskDetailModal from '../TaskDetailModal'
import CourseTaskItem from '../../../pages/courses/courseHomepage/CourseTaskItem'
import QuestPreviewModal from '../../sis/QuestPreviewModal'

vi.mock('../../../hooks/useHidePillars', () => ({ default: () => false }))
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: {} })) } }))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})

const DESCRIPTION = 'Step one: measure the bed.\nStep two: sketch the rows.'

const task = {
  id: 'task-1',
  title: 'Plan the garden',
  description: DESCRIPTION,
  pillar: 'stem',
  xp_value: 50,
}

const findDescription = () => screen.getByText(/Step one: measure the bed\./)

describe('task descriptions keep their hard returns (ticket 3a9e16c1)', () => {
  it('in the task workspace (TaskDetailsSection)', () => {
    render(
      <TaskDetailsSection
        canUseTaskGeneration={false}
        isDescriptionExpanded={false}
        pillarData={{ name: 'STEM', color: '#2469D1' }}
        pillarsVisible
        setIsDescriptionExpanded={() => {}}
        setIsEditModalOpen={() => {}}
        setIsStepsModalOpen={() => {}}
        task={task}
      />,
    )

    expect(findDescription().textContent).toBe(DESCRIPTION)
    expect(findDescription()).toHaveClass('whitespace-pre-line')
  })

  it('in the task detail modal', () => {
    render(<TaskDetailModal task={task} isOpen onClose={() => {}} />)

    expect(findDescription()).toHaveClass('whitespace-pre-line')
  })

  it('in a course task, once expanded', () => {
    render(<CourseTaskItem task={task} preview />)
    fireEvent.click(screen.getByText('Plan the garden'))

    expect(findDescription()).toHaveClass('whitespace-pre-line')
  })

  it('in the SIS quest preview', () => {
    render(
      <QuestPreviewModal open onClose={() => {}} title="Garden" description="" tasks={[task]} />,
    )

    expect(findDescription()).toHaveClass('whitespace-pre-line')
  })
})
