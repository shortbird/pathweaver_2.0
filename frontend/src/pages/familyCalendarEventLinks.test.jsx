import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * A link in an event's notes is a link.
 *
 * iCreate, 2026-09-04: "we need the ability to make live links on events on the
 * calendar so families can go directly to a form." The office was already
 * pasting sign-up URLs into the notes; the family calendar printed them as text,
 * so a parent had to select and copy a 90-character URL off a phone screen.
 * Announcements have rendered these as buttons since August — this is the same
 * component, not a second implementation.
 */

vi.mock('../hooks/useSchoolContext', () => ({
  default: () => ({ orgs: [{ organization_id: 'org-1', organization_name: 'iCreate' }] }),
}))
vi.mock('../services/api', () => ({ default: { get: vi.fn() } }))
import api from '../services/api'
import FamilyCalendarPage from './FamilyCalendarPage'

const FORM = 'https://forms.gle/aPZ1893CcecWwBBJA'

// A day the month grid definitely renders: today, in the browser's own zone.
const at = (hour) => {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

const EVENT = {
  id: 'e1', title: 'Fall Festival', start_at: at(10), end_at: at(12),
  all_day: false, location: 'The Great Hall', categories: ['Events'],
  description: `RSVP and pay the $5 supply fee here: ${FORM}`,
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => (
    url.includes('/events/feed')
      ? Promise.resolve({ data: { success: true, feed_url: 'https://x/y.ics' } })
      : Promise.resolve({ data: { success: true, events: [EVENT] } })
  ))
})

describe('links in a calendar event', () => {
  it('renders a pasted URL as something a parent can tap', async () => {
    render(<MemoryRouter><FamilyCalendarPage /></MemoryRouter>)

    fireEvent.click(await screen.findByText('Fall Festival'))

    const link = await screen.findByRole('link', { name: /forms\.gle/ })
    expect(link).toHaveAttribute('href', FORM)
    expect(link).toHaveAttribute('target', '_blank')
    // The words around it survive.
    expect(screen.getByText(/RSVP and pay the \$5 supply fee here/)).toBeInTheDocument()
    // And the raw URL is not left sitting in the text as well.
    expect(screen.queryByText(FORM)).not.toBeInTheDocument()
  })
})
