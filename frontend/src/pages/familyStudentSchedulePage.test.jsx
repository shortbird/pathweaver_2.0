import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const { api, contextPayload, schedulePayload } = vi.hoisted(() => {
  const contextPayload = {
    orgs: [{
      organization_id: 'org-1',
      organization_name: 'iCreate',
      students: [{ student_id: 's1', name: 'Nora Candland' }],
    }],
  }
  const schedulePayload = {
    classes: [
      {
        id: 'c1', name: 'Pottery', location: 'Studio B',
        primary_instructor: { name: 'Molly C' },
        meetings: [{ day_of_week: 2, start_time: '09:30', end_time: '10:30' }],
      },
      {
        id: 'c2', name: 'Guitar Jam', location: '',
        primary_instructor: null,
        meetings: [
          { day_of_week: 4, start_time: '10:30', end_time: '11:30' },
          { day_of_week: 2, start_time: '10:30', end_time: '11:30' },
        ],
      },
      // No meetings on file: the row must still print, saying so.
      { id: 'c3', name: 'Chess Club', meetings: [] },
    ],
    waitlist: [{ entry_id: 'w1', class_name: 'Ceramics II', position: 2, status: 'waiting' }],
    courses: [{ id: 'course-1', title: 'Intro to Astronomy' }],
    time_blocks: [{ label: '', start: '09:30', end: '10:30' }],
  }
  return {
    contextPayload,
    schedulePayload,
    api: { get: vi.fn() },
  }
})
vi.mock('../services/api', () => ({ default: api }))

import FamilyStudentSchedulePage from './FamilyStudentSchedulePage'

const renderPage = () =>
  rtlRender(
    <MemoryRouter initialEntries={['/family/students/s1/schedule']}>
      <Routes>
        <Route path="/family/students/:studentId/schedule" element={<FamilyStudentSchedulePage />} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/parent/context')) return Promise.resolve({ data: contextPayload })
    if (url.includes('/schedule')) return Promise.resolve({ data: schedulePayload })
    return Promise.resolve({ data: {} })
  })
})

describe('FamilyStudentSchedulePage', () => {
  it('loads the schedule for the org the student belongs to', async () => {
    renderPage()
    expect(await screen.findByText('Nora Candland')).toBeInTheDocument()
    expect(screen.getByText('Class schedule · iCreate')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(
      '/api/sis/parent/students/s1/schedule?organization_id=org-1')
  })

  it('lists every class with when, teacher and room', async () => {
    renderPage()
    // The grid renders class names too, so scope the assertions to the list row.
    const row = (await screen.findAllByText('Pottery')).at(-1).closest('tr')
    expect(row).toHaveTextContent('Tue 9:30am-10:30am')
    expect(row).toHaveTextContent('Molly C')
    expect(row).toHaveTextContent('Studio B')
  })

  it('reads a multi-day class Monday-first', async () => {
    renderPage()
    const row = (await screen.findAllByText('Guitar Jam')).at(-1).closest('tr')
    expect(row).toHaveTextContent('Tue 10:30am-11:30am; Thu 10:30am-11:30am')
  })

  it('keeps a class with no meetings on the sheet', async () => {
    /**
     * The Mon-Fri grid cannot show an unscheduled class. Dropping it from the
     * list too would print a schedule that quietly omits a class the family
     * signed up for.
     */
    renderPage()
    const row = (await screen.findByText('Chess Club')).closest('tr')
    expect(row).toHaveTextContent('Not scheduled')
  })

  it('shows the waitlist and at-home courses', async () => {
    renderPage()
    expect(await screen.findByText(/Ceramics II/)).toBeInTheDocument()
    expect(screen.getByText(/#2 in line/)).toBeInTheDocument()
    expect(screen.getByText('Intro to Astronomy')).toBeInTheDocument()
  })

  it('prints on demand', async () => {
    const print = vi.fn()
    window.print = print
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Print' }))
    expect(print).toHaveBeenCalled()
  })

  it('says so when the student is not in a school that uses schedules', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/parent/context')) return Promise.resolve({ data: { orgs: [] } })
      return Promise.resolve({ data: {} })
    })
    renderPage()
    expect(await screen.findByText(/not enrolled at a school/i)).toBeInTheDocument()
  })

  it('does not offer a week to print when there are no classes', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/parent/context')) return Promise.resolve({ data: contextPayload })
      return Promise.resolve({ data: { ...schedulePayload, classes: [] } })
    })
    renderPage()
    expect(await screen.findByText(/No classes yet at iCreate/)).toBeInTheDocument()
    expect(screen.queryByText('Pottery')).not.toBeInTheDocument()
  })
})
