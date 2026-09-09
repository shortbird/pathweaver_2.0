import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { meetingsByDay } from './WeeklySchedule'
import ScheduleByDay from './ScheduleByDay'

/**
 * Families read a schedule day-first.
 *
 * The family surfaces used to list one row per class with every meeting crammed
 * into a "When" cell ("Mon 9:30am-10:30am; Wed 1pm-2pm"). That answers "when
 * does Pottery meet?", but a parent asking "where is she at 10:30 on Tuesday?"
 * had to read every row and re-sort mentally — reported by an iCreate parent on
 * 2026-08-25 as "super clunky to find out where they are at certain times...
 * at least separated by days and ideeeeeally in schedule order".
 */

const cls = (id, name, meetings, extra = {}) => ({ id, name, meetings, ...extra })

describe('meetingsByDay', () => {
  it('splits one class across the days it actually meets', () => {
    const days = meetingsByDay([
      cls('c1', 'Pottery', [
        { day_of_week: 3, start_time: '13:00', end_time: '14:00' },
        { day_of_week: 1, start_time: '09:30', end_time: '10:30' },
      ]),
    ])
    expect(days.map((d) => d.label)).toEqual(['Monday', 'Wednesday'])
    expect(days[0].rows).toHaveLength(1)
  })

  it('orders each day by start time, not by class name', () => {
    const days = meetingsByDay([
      cls('c1', 'Zoology', [{ day_of_week: 2, start_time: '09:30', end_time: '10:30' }]),
      cls('c2', 'Art', [{ day_of_week: 2, start_time: '11:30', end_time: '12:30' }]),
      cls('c3', 'Math', [{ day_of_week: 2, start_time: '10:30', end_time: '11:30' }]),
    ])
    expect(days).toHaveLength(1)
    // 9:30, then 10:30, then 11:30 — exactly the parent's ask.
    expect(days[0].rows.map((r) => r.cls.name)).toEqual(['Zoology', 'Math', 'Art'])
  })

  it('runs Monday-first with Sunday last', () => {
    const days = meetingsByDay([
      cls('c1', 'A', [{ day_of_week: 0, start_time: '09:00' }]),
      cls('c2', 'B', [{ day_of_week: 6, start_time: '09:00' }]),
      cls('c3', 'C', [{ day_of_week: 1, start_time: '09:00' }]),
    ])
    expect(days.map((d) => d.label)).toEqual(['Monday', 'Saturday', 'Sunday'])
  })

  it('omits days with nothing scheduled', () => {
    const days = meetingsByDay([cls('c1', 'Pottery', [{ day_of_week: 1, start_time: '09:30' }])])
    expect(days.map((d) => d.label)).toEqual(['Monday'])
  })

  it('keeps a class with no meetings instead of dropping it', () => {
    const days = meetingsByDay([
      cls('c1', 'Pottery', [{ day_of_week: 1, start_time: '09:30' }]),
      cls('c2', 'Choir', []),
    ])
    const last = days[days.length - 1]
    expect(last.label).toBe('Not scheduled yet')
    expect(last.rows[0].cls.name).toBe('Choir')
  })

  it('groups a one-off dated meeting by its date, not as a weekly slot', () => {
    const days = meetingsByDay([
      cls('c1', 'Field trip', [{ specific_date: '2026-09-12', start_time: '09:00' }]),
      cls('c2', 'Pottery', [{ day_of_week: 1, start_time: '09:30' }]),
    ])
    expect(days.map((d) => d.label)).toEqual(['Monday', '2026-09-12'])
  })

  it('sinks a meeting with no start time below the timed ones in its day', () => {
    const days = meetingsByDay([
      cls('c1', 'TBD', [{ day_of_week: 2 }]),
      cls('c2', 'Math', [{ day_of_week: 2, start_time: '10:30' }]),
    ])
    expect(days[0].rows.map((r) => r.cls.name)).toEqual(['Math', 'TBD'])
  })
})

describe('ScheduleByDay', () => {
  it('renders each day as its own heading with times in order', () => {
    render(<ScheduleByDay classes={[
      cls('c1', 'Zoology', [{ day_of_week: 2, start_time: '09:30', end_time: '10:30' }]),
      cls('c2', 'Art', [{ day_of_week: 2, start_time: '11:30', end_time: '12:30' }]),
      cls('c3', 'Pottery', [{ day_of_week: 1, start_time: '09:30', end_time: '10:30' }]),
    ]} />)

    expect(screen.getByText('Monday')).toBeInTheDocument()
    const tuesday = screen.getByText('Tuesday').parentElement
    const rows = within(tuesday).getAllByRole('listitem')
    // Both ends carry am/pm, exactly as the grid above labels its blocks.
    expect(rows[0]).toHaveTextContent('9:30am–10:30am')
    expect(rows[0]).toHaveTextContent('Zoology')
    expect(rows[1]).toHaveTextContent('Art')
  })

  it('shows the meeting room over the class default', () => {
    render(<ScheduleByDay classes={[
      cls('c1', 'Pottery', [{ day_of_week: 1, start_time: '09:30', location: 'Kiln' }],
        { location: 'Room 2' }),
    ]} />)
    expect(screen.getByText(/Kiln/)).toBeInTheDocument()
    expect(screen.queryByText(/Room 2/)).not.toBeInTheDocument()
  })

  it('falls back to the class room and shows the teacher', () => {
    render(<ScheduleByDay classes={[
      cls('c1', 'Pottery', [{ day_of_week: 1, start_time: '09:30' }],
        { location: 'Room 2', primary_instructor: { name: 'Ms. Vance' } }),
    ]} />)
    expect(screen.getByText('Ms. Vance · Room 2')).toBeInTheDocument()
  })

  it('renders nothing when there are no classes', () => {
    const { container } = render(<ScheduleByDay classes={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
