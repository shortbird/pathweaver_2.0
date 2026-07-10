import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WeeklyScheduleGrid from './WeeklyScheduleGrid'

const CLASSES = [
  { class_id: 'c1', name: 'Choir', meetings: [
    { day_of_week: 2, start_time: '09:30', end_time: '10:30', location: 'Theater Stage' },
    { day_of_week: 4, start_time: '09:30', end_time: '10:30', location: null },
  ] },
  { class_id: 'c2', name: 'Lego Lab', meetings: [
    { day_of_week: 2, start_time: '10:30', end_time: '11:30', location: 'Teen 3' },
  ] },
  { class_id: 'c3', name: 'No Meetings Yet', meetings: [] },
]

describe('WeeklyScheduleGrid', () => {
  it('renders days as columns and time slots as rows with classes placed', () => {
    render(<WeeklyScheduleGrid classes={CLASSES} />)
    expect(screen.getByText('Tue')).toBeInTheDocument()
    expect(screen.getByText('Thu')).toBeInTheDocument()
    expect(screen.queryByText('Mon')).not.toBeInTheDocument() // no Monday meetings
    // Choir appears twice (Tue + Thu block 1); Lego Lab once.
    expect(screen.getAllByText('Choir')).toHaveLength(2)
    expect(screen.getByText('Lego Lab')).toBeInTheDocument()
    expect(screen.getByText('Theater Stage')).toBeInTheDocument()
    expect(screen.getByText('9:30am–10:30am')).toBeInTheDocument()
  })

  it('shows an empty state when no class has meetings', () => {
    render(<WeeklyScheduleGrid classes={[{ class_id: 'x', name: 'X', meetings: [] }]} />)
    expect(screen.getByText(/No scheduled meeting times/)).toBeInTheDocument()
  })
})
