/**
 * Ticket 9200a103, item 1: a course goes on the transcript only when it is
 * finished. Optio awards only an A, so an unfinished course has no grade to
 * print. The shared transcript used to print an in-progress planned credit with
 * "In Progress" in the Grade column, and a dropped one struck through.
 *
 * A planned credit is never finished (Tanner, 2026-09-29), so none is on a
 * shared transcript. The backend no longer sends any
 * (tests/unit/test_transcript_unfinished_courses.py); this page must stay right
 * on its own if one ever arrives, including a row saved as 'completed' before
 * the editor stopped offering that status.
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'

const DATA = {
  student: { first_name: 'Ada', last_name: 'Lovelace', organization_name: 'Test Academy' },
  accreditation: { source: 'none' },
  earned_credits: { math: { display_name: 'Mathematics', credits: 1 } },
  class_credits: [],
  transfer_credits: [],
  planned_credits: [
    { school_subject: 'fine_arts', course_name: 'Ceramics I', credits: 0.5, status: 'in_progress' },
    { school_subject: 'science', course_name: 'Chemistry', credits: 1, status: 'dropped' },
    { school_subject: 'health', course_name: 'First Aid', credits: 0.5, status: 'completed' },
  ],
  overrides: {},
  totals: { total_completed: 1, gpa: 4 },
}

vi.mock('../services/api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { data: DATA } })) },
}))

import PublicTranscriptPage from './PublicTranscriptPage'

const renderPage = () => render(
  <MemoryRouter initialEntries={['/transcript/u1']}>
    <Routes>
      <Route path="/transcript/:userId" element={<PublicTranscriptPage />} />
    </Routes>
  </MemoryRouter>,
)

describe('shared transcript (ticket 9200a103)', () => {
  it('ticket 9200a103: prints only finished courses, never a planned one', async () => {
    renderPage()
    // Desktop table and mobile cards both render in jsdom.
    expect((await screen.findAllByText('Mathematics')).length).toBeGreaterThan(0)
    expect(screen.queryByText('First Aid')).toBeNull()

    expect(screen.queryByText('Ceramics I')).toBeNull()
    expect(screen.queryByText('Chemistry')).toBeNull()
    expect(screen.queryByText('In Progress')).toBeNull()
    expect(screen.queryByText('Dropped')).toBeNull()
  })

  it('shows the GPA from completed credit', async () => {
    renderPage()
    expect(await screen.findByText('4.00')).toBeInTheDocument()
  })
})
