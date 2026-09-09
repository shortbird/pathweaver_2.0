import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * "Add to my calendar" on the school calendar (/school-calendar): parents
 * subscribe once in Google/Apple Calendar and the school's events stay in
 * their own calendar. The links come from the family feed token endpoint —
 * webcal:// for Apple, the Google render URL for Google.
 */

vi.mock('../hooks/useSchoolContext', () => ({
  default: () => ({ orgs: [{ organization_id: 'org-1', organization_name: 'iCreate' }] }),
}))
vi.mock('../services/api', () => ({ default: { get: vi.fn() } }))
import api from '../services/api'
import FamilyCalendarPage from './FamilyCalendarPage'

const FEED_URL = 'https://api.optioeducation.com/api/sis/calendar/org-1.ics?token=tok123'

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => (
    url.includes('/events/feed')
      ? Promise.resolve({ data: { success: true, feed_url: FEED_URL } })
      : Promise.resolve({ data: { success: true, events: [] } })
  ))
})

const renderPage = () => render(<MemoryRouter><FamilyCalendarPage /></MemoryRouter>)

describe('subscribing to the school calendar', () => {
  it('offers Google and Apple subscriptions off the feed URL', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add to my calendar' }))

    const google = await screen.findByRole('link', { name: 'Google Calendar' })
    const webcal = 'webcal://api.optioeducation.com/api/sis/calendar/org-1.ics?token=tok123'
    expect(google.getAttribute('href'))
      .toBe(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`)
    expect(screen.getByRole('link', { name: /Apple Calendar/ }).getAttribute('href')).toBe(webcal)
    expect(screen.getByRole('button', { name: /Copy link/ })).toBeInTheDocument()
  })

  it('asks for the link only when the button is used', async () => {
    renderPage()
    await screen.findByRole('button', { name: 'Add to my calendar' })
    expect(api.get.mock.calls.some(([u]) => u.includes('/events/feed'))).toBe(false)
  })
})
