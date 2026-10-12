import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SchoolActivityCard, { SignInTroubleCard } from './SchoolActivityCard'

const doors = { openStudent: vi.fn(), openFamily: vi.fn() }
vi.mock('./RecordDoors', () => ({ useRecordDoors: () => doors }))

const activity = {
  days: 7, students: 209, active_students: 18, active_students_prev: 14,
  parents: 98, active_parents: 50, active_parents_prev: 58, tasks: 155, tasks_prev: 155,
  classes: [
    { class_id: 'c1', name: '3D Modeling', students: 10, active: 0, tasks: 2 },
    { class_id: 'c2', name: 'Empty', students: 0, active: 0, tasks: 0 },
  ],
  quiet_total: 9,
  quiet: Array.from({ length: 9 }, (_, i) => ({
    user_id: `s${i}`, name: `Student ${i}`, last_active: null, open_quests: i === 0 ? 1 : 3,
  })),
}

describe('SchoolActivityCard', () => {
  it('compares the week with the last, names the quiet classes and students', () => {
    render(<SchoolActivityCard activity={activity} />)
    expect(screen.getByText('This week at your school')).toBeInTheDocument()
    expect(screen.getByText('▲ 4 from last week')).toBeInTheDocument() // students
    expect(screen.getByText('▼ 8 from last week')).toBeInTheDocument() // parents
    expect(screen.getByText('same as last week')).toBeInTheDocument() // tasks
    expect(screen.getByText('0 of 10 active · 2 tasks')).toBeInTheDocument()
    // A class with nobody enrolled says nothing about activity.
    expect(screen.queryByText('Empty')).not.toBeInTheDocument()
    expect(screen.getByText('Gone quiet (9)')).toBeInTheDocument()
    expect(screen.getByText('And 1 more.')).toBeInTheDocument()
    expect(screen.getAllByText(/never signed in/)[0]).toHaveTextContent('never signed in · 1 open quest')

    fireEvent.click(screen.getByRole('button', { name: 'Student 2' }))
    expect(doors.openStudent).toHaveBeenCalledWith('s2')
  })

  it('renders nothing without data', () => {
    const { container } = render(<SchoolActivityCard activity={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('SignInTroubleCard (school)', () => {
  it('is absent when nobody is stuck', () => {
    const { container } = render(<SignInTroubleCard people={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opens the student record or the parent\'s family', () => {
    const now = new Date().toISOString()
    render(<SignInTroubleCard people={[
      { email: 'kid@x.test', user_id: 'k1', name: 'Kid', role: 'student', failures: 5, locked: true, last_attempt: now },
      { email: 'mom@x.test', user_id: 'm1', name: 'Mom', role: 'parent', household_id: 'h1', failures: 2, last_attempt: now },
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(doors.openStudent).toHaveBeenCalledWith('k1')
    fireEvent.click(screen.getByRole('button', { name: 'Family' }))
    expect(doors.openFamily).toHaveBeenCalledWith('h1')
    // A school sees no school column: they are all its own people.
    expect(screen.getByText('Parent · mom@x.test')).toBeInTheDocument()
  })
})
