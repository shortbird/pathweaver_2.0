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

  // iCreate 2026-08-25: a 9:30 class that runs to 3:00 used to open its own row,
  // pushing the 9:30–10:30 classes off the 9:30 line entirely.
  it('puts classes that start at the same time on one row even when they end at different times', () => {
    const MIXED = [
      { class_id: 'a', name: 'All Day Studio', meetings: [
        { day_of_week: 1, start_time: '09:30', end_time: '15:00', location: null },
      ] },
      { class_id: 'b', name: 'Choir', meetings: [
        { day_of_week: 2, start_time: '09:30', end_time: '10:30', location: null },
      ] },
    ]
    render(<WeeklyScheduleGrid classes={MIXED} />)
    // One row header, showing the shared start only — not two range headers.
    expect(screen.getByText('9:30am')).toBeInTheDocument()
    expect(screen.queryByText('9:30am–10:30am')).not.toBeInTheDocument()
    // Each block says when it actually finishes.
    expect(screen.getByText('until 3pm')).toBeInTheDocument()
    expect(screen.getByText('until 10:30am')).toBeInTheDocument()
    // Both live in the same row.
    const row = screen.getByText('9:30am').closest('tr')
    expect(row).toHaveTextContent('All Day Studio')
    expect(row).toHaveTextContent('Choir')
  })
})
