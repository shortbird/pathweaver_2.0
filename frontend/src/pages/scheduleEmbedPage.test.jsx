import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../services/api', () => ({ default: api }))

import ScheduleEmbedPage from './ScheduleEmbedPage'

const renderPage = () => render(
  <MemoryRouter initialEntries={['/schedule-embed/abc123']}>
    <Routes>
      <Route path="/schedule-embed/:previewCode" element={<ScheduleEmbedPage />} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => { vi.clearAllMocks() })

describe('ScheduleEmbedPage', () => {
  it('renders the live weekly grid grouped by day, display-only', async () => {
    api.get.mockResolvedValue({ data: {
      organization_name: 'iCreate',
      classes: [
        { id: 'c1', name: 'Pottery', spots_left: 3, is_full: false, min_age: 5, max_age: 9,
          meetings: [{ day_of_week: 2, start_time: '09:00', end_time: '10:00' },
                     { day_of_week: 4, start_time: '09:00', end_time: '10:00' }] },
        { id: 'c2', name: 'Robotics', spots_left: 0, is_full: true,
          meetings: [{ day_of_week: 2, start_time: '13:00', end_time: '14:00' }] },
      ],
    } })
    renderPage()
    expect(await screen.findByText(/iCreate — Weekly Class Schedule/)).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/icreate/schedule-preview/abc123')
    // Tue & Thu columns render; Pottery appears in both.
    expect(screen.getByText('Tuesday')).toBeInTheDocument()
    expect(screen.getByText('Thursday')).toBeInTheDocument()
    expect(screen.getAllByText('Pottery')).toHaveLength(2)
    expect(screen.getAllByText(/ages 5–9/)).toHaveLength(2)
    expect(screen.getByText(/Full/)).toBeInTheDocument()
    // Display-only: nothing links out.
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows a friendly error for a bad embed code', async () => {
    api.get.mockRejectedValue(new Error('404'))
    renderPage()
    expect(await screen.findByText(/This schedule is not available/)).toBeInTheDocument()
  })
})
