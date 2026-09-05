/**
 * The class check-in view: one screen for what a whole roster did this week.
 *
 * The week boundary is the fiddly part. Arete runs check-ins on Fridays, so the
 * week has to END on Friday — a Monday-start week splits the conversation in
 * half. And it has to be built from local calendar days: `new Date('2026-09-04')`
 * parses as UTC midnight, which is the previous day in every US timezone, so a
 * Friday afternoon check-in would silently load the wrong week.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import ClassActivityTab, { weekContaining } from './ClassActivityTab'
import classService from '../../services/classService'

vi.mock('../../services/classService', () => ({
  default: { getClassActivity: vi.fn() },
}))

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const response = (students, summary = {}) => ({
  success: true,
  start_date: '2026-08-29',
  end_date: '2026-09-04',
  students,
  summary: {
    total_students: students.length,
    active_students: students.filter((s) => s.tasks_completed > 0).length,
    total_xp: students.reduce((n, s) => n + s.xp, 0),
    total_tasks: students.reduce((n, s) => n + s.tasks_completed, 0),
    total_quests: students.reduce((n, s) => n + s.quests.length, 0),
    ...summary,
  },
})

const student = (first, xp, quests) => ({
  student_id: first.toLowerCase(),
  student: { first_name: first, last_name: 'Test' },
  xp,
  tasks_completed: quests.reduce((n, q) => n + q.tasks.length, 0),
  last_activity: '2026-09-01T10:00:00Z',
  quests,
})

const quest = (id, title, xp, tasks) => ({ quest_id: id, title, xp, tasks })
const task = (title, xp) => ({
  title,
  xp,
  pillar: 'STEM',
  completed_at: '2026-09-01T10:00:00Z',
})

describe('weekContaining', () => {
  // Local-noon construction: the boundary logic is about calendar days, and
  // midnight would let a timezone offset roll the date backwards.
  const day = (iso) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d, 12)
  }

  it.each([
    ['2026-09-04', 'a Friday', '2026-08-29', '2026-09-04'],
    ['2026-08-29', 'a Saturday', '2026-08-29', '2026-09-04'],
    ['2026-09-01', 'a midweek Tuesday', '2026-08-29', '2026-09-04'],
    ['2026-09-05', 'the next Saturday', '2026-09-05', '2026-09-11'],
  ])('%s (%s) resolves to %s – %s', (today, _label, start, end) => {
    expect(weekContaining(day(today))).toEqual({ startDate: start, endDate: end })
  })

  it('always spans seven days ending on a Friday', () => {
    for (let offset = 0; offset < 14; offset += 1) {
      const { startDate, endDate } = weekContaining(
        new Date(2026, 8, 1 + offset, 12)
      )
      expect(day(startDate).getDay()).toBe(6) // Saturday
      expect(day(endDate).getDay()).toBe(5) // Friday
      expect((day(endDate) - day(startDate)) / 86400000).toBe(6)
    }
  })
})

describe('ClassActivityTab', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // A Friday — check-in day.
    vi.setSystemTime(new Date(2026, 8, 4, 12))
    classService.getClassActivity.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const renderTab = () =>
    render(<ClassActivityTab orgId="org1" classId="c1" className="Chesapeake" />)

  it('requests the Saturday-to-Friday week on load', async () => {
    classService.getClassActivity.mockResolvedValue(response([]))
    renderTab()

    await waitFor(() =>
      expect(classService.getClassActivity).toHaveBeenCalledWith('org1', 'c1', {
        startDate: '2026-08-29',
        endDate: '2026-09-04',
      })
    )
  })

  it("shows each student's projects and XP without opening their account", async () => {
    classService.getClassActivity.mockResolvedValue(
      response([
        student('Maci', 300, [
          quest('q1', 'Marine Biology', 200, [task('Dissect a squid', 200)]),
          quest('q2', 'Explorers Geography', 100, [task('Map the coast', 100)]),
        ]),
      ])
    )
    renderTab()

    expect(await screen.findByText('Maci Test')).toBeInTheDocument()
    expect(screen.getByText('300 XP')).toBeInTheDocument()
    expect(screen.getByText('2 projects · 2 tasks')).toBeInTheDocument()

    // Projects are one click away, on the same screen.
    await userEvent.click(screen.getByRole('button', { name: /Maci Test/ }))
    expect(screen.getByText('Marine Biology')).toBeInTheDocument()
    expect(screen.getByText('Dissect a squid')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Marine Biology/ })).toHaveAttribute(
      'href',
      '/quests/q1'
    )
  })

  it('lists students with no activity instead of dropping them', async () => {
    classService.getClassActivity.mockResolvedValue(
      response([
        student('Maci', 100, [quest('q1', 'Marine Biology', 100, [task('A', 100)])]),
        student('Toby', 0, []),
      ])
    )
    renderTab()

    expect(await screen.findByText('No activity this week (1)')).toBeInTheDocument()
    expect(screen.getByText('Toby Test')).toBeInTheDocument()
  })

  it('steps back a week and disables stepping past the current one', async () => {
    classService.getClassActivity.mockResolvedValue(response([]))
    renderTab()
    await waitFor(() => expect(classService.getClassActivity).toHaveBeenCalled())

    expect(screen.getByLabelText('Next week')).toBeDisabled()

    await userEvent.click(screen.getByLabelText('Previous week'))
    await waitFor(() =>
      expect(classService.getClassActivity).toHaveBeenLastCalledWith('org1', 'c1', {
        startDate: '2026-08-22',
        endDate: '2026-08-28',
      })
    )
    expect(screen.getByLabelText('Next week')).not.toBeDisabled()
  })
})
