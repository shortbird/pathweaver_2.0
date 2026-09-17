import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import api from '../services/api'
import FamilyCalendarPage, { fmtWhen } from './FamilyCalendarPage'

/**
 * The day modal on the family calendar.
 *
 * 2026-09-16: a parent opened "Pirettes of Penzance" and got a wall of text
 * with the link buttons pushing their lines apart, a start time with no end,
 * and nothing that said where it was beyond a "·". The card now reads title,
 * when (with the end time and, for a run of nights, the span), where, then the
 * notes -- and a link in the notes sits in its sentence at the sentence's
 * size instead of as a flex block.
 */

vi.mock('../hooks/useSchoolContext', () => ({
  default: () => ({ orgs: [{ organization_id: 'org-1', organization_name: 'iCreate' }] }),
}))
vi.mock('../services/api', () => ({ default: { get: vi.fn() } }))

// Wall-clock stamps on a day the month grid renders: today, as the office
// would type it, "Z"-suffixed and never shifted by the viewer's zone.
const pad = (n) => String(n).padStart(2, '0')
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` })()
const at = (hhmm) => `${today}T${hhmm}:00Z`

const SHOW = {
  id: 'e1', title: 'Pirettes of Penzance', start_at: at('19:30'), end_at: at('21:30'),
  all_day: false, location: 'Angelus Theater in Spanish Fork', categories: [],
  description: 'Tickets are at this website: https://greathall.live/tickets Our director is in the show.',
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { success: true, events: [SHOW] } })
})

describe('the day modal', () => {
  it('shows when, where, and the notes with the link inline in its sentence', async () => {
    render(<MemoryRouter><FamilyCalendarPage /></MemoryRouter>)
    fireEvent.click(await screen.findByText('Pirettes of Penzance'))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('7:30pm – 9:30pm')
    expect(dialog).toHaveTextContent('Angelus Theater in Spanish Fork')

    const link = screen.getByRole('link', { name: /greathall\.live/ })
    expect(link.className).toContain('inline ')
    expect(link.className).not.toContain('inline-flex')
    // The sentence around the link is one paragraph, not text split by a block.
    expect(link.parentElement).toHaveTextContent(/Tickets are at this website: greathall\.live Our director is in the show\./)
  })
})

describe('fmtWhen', () => {
  const stamp = (date, time) => `${date}T${time}:00Z`
  it('is the time range on one day, with the end when the office set one', () => {
    expect(fmtWhen({ start_at: stamp('2026-09-17', '19:30'), end_at: stamp('2026-09-17', '21:30') })).toBe('7:30pm – 9:30pm')
    expect(fmtWhen({ start_at: stamp('2026-09-17', '19:30'), end_at: null })).toBe('7:30pm')
    expect(fmtWhen({ start_at: stamp('2026-09-17', '00:00'), all_day: true })).toBe('All day')
  })
  it('names the span of a multi-day event instead of "Continues"', () => {
    expect(fmtWhen({ start_at: stamp('2026-09-14', '19:30'), end_at: stamp('2026-09-26', '21:30') })).toBe('Sep 14 – Sep 26 · 7:30pm – 9:30pm')
    expect(fmtWhen({ start_at: stamp('2026-09-14', '00:00'), end_at: stamp('2026-09-18', '23:59'), all_day: true })).toBe('Sep 14 – Sep 18 · All day')
  })
})
