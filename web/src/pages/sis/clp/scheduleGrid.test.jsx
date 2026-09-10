import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import ScheduleGrid from './ScheduleGrid'

/**
 * The CLP week grid, and the hole a multi-block class used to leave in it.
 *
 * Rows key on start time, which is what put same-time classes on the same
 * horizontal row in the first place (iCreate a71dc952, bc11f09b). A class that
 * SPANS several blocks still starts in one row, so it vanished from the rows it
 * was running through: an all-day Monday class put nothing in the 1:00 row
 * while Tuesday's 1:00 class sat there alone, and reading across that row said
 * the student was free on Monday at 1:00 when she was in class
 * (iCreate 32b2beb3).
 */

const at = (day, start, end) => ({ day_of_week: day, start_time: start, end_time: end })

const ALL_DAY = {
  class_id: 'c-allday', name: 'Microschool Monday', supply_fee: 0,
  meetings: [at(1, '09:30', '15:00')],
}
const AFTERNOON = {
  class_id: 'c-pm', name: 'Theater Jr', supply_fee: 0,
  meetings: [at(2, '13:00', '14:00')],
}
const MORNING = {
  class_id: 'c-am', name: 'Pottery', supply_fee: 0,
  meetings: [at(2, '09:30', '10:30')],
}

const renderGrid = (schedule, days = [1, 2]) => render(
  <MemoryRouter>
    <ScheduleGrid
      schedule={schedule} scheduleDays={days}
      busyId={null} confirm={() => Promise.resolve(false)} drop={() => {}}
      setTimeFocus={() => {}} timeFocus={null}
    />
  </MemoryRouter>,
)

const rowCells = (start) => document.querySelectorAll(`[data-slot="${start}"]`)

describe('the CLP week grid', () => {
  it('puts two classes that start at the same time on the same row', () => {
    renderGrid([ALL_DAY, MORNING])
    const cells = rowCells('09:30')
    expect(cells).toHaveLength(2)
    expect(within(cells[0]).getByText('Microschool Monday')).toBeInTheDocument()
    expect(within(cells[1]).getByText('Pottery')).toBeInTheDocument()
  })

  it('marks the rows a spanning class is still running through', () => {
    renderGrid([ALL_DAY, AFTERNOON])
    // The 1:00 row: Tuesday holds Theater Jr, and Monday is NOT blank -- the
    // all-day class is still running.
    const cells = rowCells('13:00')
    expect(cells).toHaveLength(2)
    expect(within(cells[0]).getByText(/continues/)).toBeInTheDocument()
    expect(within(cells[0]).getByText('Microschool Monday')).toBeInTheDocument()
    expect(within(cells[1]).getByText('Theater Jr')).toBeInTheDocument()
  })

  it('does not mark the row the spanning class starts in', () => {
    renderGrid([ALL_DAY, AFTERNOON])
    const cells = rowCells('09:30')
    expect(within(cells[0]).queryByText(/continues/)).not.toBeInTheDocument()
  })

  it('does not mark the row it ends on', () => {
    // 9:30-3:00 is over at 3:00; a 3:00 row must not claim it is still running.
    renderGrid([ALL_DAY, { ...AFTERNOON, meetings: [at(2, '15:00', '16:00')] }])
    const cells = rowCells('15:00')
    expect(within(cells[0]).queryByText(/continues/)).not.toBeInTheDocument()
  })

  it('links each class to its roster', () => {
    renderGrid([MORNING], [2])
    const link = screen.getByRole('link', { name: /roster/i })
    expect(link).toHaveAttribute('href', '/classes?class=c-am')
  })
})
