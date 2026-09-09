import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * The subject control on a SIS preset task.
 *
 * Gryffin, 2026-09-09: "when I am putting in an assignment I can only choose
 * one." There was in fact no subject control on that screen at all, so every
 * task a school typed in kept the table's ['Electives'] default -- a US
 * History unit, a Latin unit and an Earth Science unit among them.
 *
 * These tests pin the two things that make the control trustworthy: it shows
 * the credit a task is about to earn BEFORE anyone picks (so a wrong default is
 * visible while it can still be changed), and adding a subject gives it a real
 * share rather than a zero the backend then drops.
 */

import TaskSubjectPicker from '../TaskSubjectPicker'
import { followPillar } from '../QuestDraftForm'
import { evenSplit, defaultSubjectForPillar } from '../../../constants/diplomaSubjects'

const setup = (props = {}) => {
  const onChange = vi.fn()
  render(
    <TaskSubjectPicker
      subjects={props.subjects}
      distribution={props.distribution}
      xpValue={props.xpValue ?? 100}
      pillar={props.pillar ?? 'civics'}
      onChange={onChange}
    />
  )
  return onChange
}

describe('TaskSubjectPicker', () => {
  it('shows the pillar default when the task has no subject of its own', () => {
    setup({ subjects: [] })
    expect(screen.getByText('Social Studies')).toBeInTheDocument()
  })

  it('never defaults a task with a pillar to Electives', () => {
    // Electives stays available to pick deliberately -- it is a real subject.
    // What must not happen is landing there by default, which is the bug.
    setup({ subjects: [], pillar: 'communication' })
    expect(screen.getByText('Language Arts')).toBeInTheDocument()
    const chosen = screen.queryByLabelText('Remove Electives')
    expect(chosen).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Electives' })).toBeInTheDocument()
  })

  it('shows the subjects a task already carries', () => {
    setup({
      subjects: ['social_studies', 'language_arts'],
      distribution: { social_studies: 75, language_arts: 25 }
    })
    expect(screen.getByText('Social Studies')).toBeInTheDocument()
    expect(screen.getByText('Language Arts')).toBeInTheDocument()
  })

  it('gives a newly added subject a real share, not zero', () => {
    const onChange = setup({ subjects: ['social_studies'], xpValue: 100 })
    fireEvent.change(screen.getByLabelText(/add a subject/i),
      { target: { value: 'language_arts' } })
    expect(onChange).toHaveBeenCalledWith({
      diploma_subjects: ['social_studies', 'language_arts'],
      subject_xp_distribution: { social_studies: 50, language_arts: 50 }
    })
  })

  it('hides the XP boxes while there is only one subject', () => {
    setup({ subjects: ['social_studies'] })
    expect(screen.queryByLabelText('Social Studies XP')).not.toBeInTheDocument()
  })

  it('shows per-subject XP once there is more than one', () => {
    setup({
      subjects: ['social_studies', 'language_arts'],
      distribution: { social_studies: 60, language_arts: 40 }
    })
    expect(screen.getByLabelText('Social Studies XP')).toHaveValue(60)
    expect(screen.getByLabelText('Language Arts XP')).toHaveValue(40)
  })

  it('lets the teacher change one subject XP without touching the others', () => {
    const onChange = setup({
      subjects: ['social_studies', 'language_arts'],
      distribution: { social_studies: 50, language_arts: 50 }
    })
    fireEvent.change(screen.getByLabelText('Social Studies XP'),
      { target: { value: '75' } })
    expect(onChange).toHaveBeenCalledWith({
      diploma_subjects: ['social_studies', 'language_arts'],
      subject_xp_distribution: { social_studies: 75, language_arts: 50 }
    })
  })

  it('re-splits evenly when a subject is removed', () => {
    const onChange = setup({
      subjects: ['social_studies', 'language_arts'],
      distribution: { social_studies: 75, language_arts: 25 },
      xpValue: 100
    })
    fireEvent.click(screen.getByLabelText('Remove Language Arts'))
    expect(onChange).toHaveBeenCalledWith({
      diploma_subjects: ['social_studies'],
      subject_xp_distribution: { social_studies: 100 }
    })
  })

  it('will not let the last subject be removed', () => {
    setup({ subjects: ['social_studies'] })
    expect(screen.queryByLabelText('Remove Social Studies')).not.toBeInTheDocument()
  })

  it('says so when the parts do not add up to the task XP', () => {
    setup({
      subjects: ['social_studies', 'language_arts'],
      distribution: { social_studies: 50, language_arts: 25 },
      xpValue: 100
    })
    expect(screen.getByText(/add up to 75 XP, and the task is worth 100/)).toBeInTheDocument()
  })
})

describe('evenSplit', () => {
  it('sums to exactly the task XP', () => {
    for (const xp of [25, 50, 75, 100, 150, 200]) {
      for (const n of [1, 2, 3, 4]) {
        const keys = ['a', 'b', 'c', 'd'].slice(0, n)
        const split = evenSplit(keys, xp)
        expect(Object.values(split).reduce((a, b) => a + b, 0)).toBe(xp)
      }
    }
  })

  it('keeps every share a multiple of 5, which is what the backend stores', () => {
    const split = evenSplit(['a', 'b', 'c'], 100)
    for (const value of Object.values(split)) expect(value % 5).toBe(0)
  })
})

describe('followPillar', () => {
  it('moves the subject with the pillar while it is still the default', () => {
    const task = { pillar: 'civics', xp_value: 100, diploma_subjects: ['social_studies'] }
    expect(followPillar(task, 'stem')).toEqual({
      pillar: 'stem',
      diploma_subjects: ['science'],
      subject_xp_distribution: { science: 100 }
    })
  })

  it('leaves a subject the teacher chose alone', () => {
    const task = { pillar: 'civics', xp_value: 100, diploma_subjects: ['language_arts'] }
    expect(followPillar(task, 'stem')).toEqual({ pillar: 'stem' })
  })

  it('leaves a multi-subject task alone', () => {
    const task = {
      pillar: 'civics', xp_value: 100,
      diploma_subjects: ['social_studies', 'language_arts']
    }
    expect(followPillar(task, 'stem')).toEqual({ pillar: 'stem' })
  })

  it('fills in a task that had no subject at all', () => {
    const task = { pillar: 'civics', xp_value: 50, diploma_subjects: [] }
    expect(followPillar(task, 'art').diploma_subjects)
      .toEqual([defaultSubjectForPillar('art')])
  })
})
