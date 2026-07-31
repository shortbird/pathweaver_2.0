import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Calendar events in more than one category.
 *
 * iCreate, 2026-07-30: "With the color coding on the calendar, can we make it so
 * that we can choose more than one category? Some things will belong in more
 * than one category."
 *
 * `category` remains the primary — it colours the event and drives the
 * per-category ICS feeds — and mirrors categories[0].
 */

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))

const CATEGORIES = ['Field trips', 'No school', 'Camps']
const iso = (day) => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${day}T09:00:00`
}

const EVENTS = [
  { id: 'e1', title: 'Museum day', start_at: iso('10'), end_at: null, all_day: false,
    audience: 'school', category: 'Field trips', categories: ['Field trips', 'No school'] },
  { id: 'e2', title: 'Winter camp', start_at: iso('12'), end_at: null, all_day: false,
    audience: 'school', category: 'Camps', categories: ['Camps'] },
]

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import CalendarPage from './CalendarPage'

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/api/sis/events')) {
      return Promise.resolve({ data: { events: EVENTS, categories: CATEGORIES } })
    }
    return Promise.resolve({ data: {} })
  })
})

describe('calendar categories', () => {
  it('filters on any of an event\'s categories, not just the primary one', async () => {
    render(<CalendarPage />)
    await screen.findByText('Museum day')
    // "No school" is Museum day's SECOND category — filtering on it must keep it.
    fireEvent.click(screen.getByRole('button', { name: /No school/ }))
    expect(screen.getByText('Museum day')).toBeInTheDocument()
    expect(screen.queryByText('Winter camp')).not.toBeInTheDocument()
  })

  it('names every category of a multi-category event on hover', async () => {
    render(<CalendarPage />)
    const chip = (await screen.findByText('Museum day')).closest('button')
    expect(chip).toHaveAttribute('title', 'Field trips · No school')
  })

  it('saves the chosen categories as a list', async () => {
    render(<CalendarPage />)
    fireEvent.click(await screen.findByText('Winter camp'))
    // The editor seeds from the event; add a second category to it. (The page's
    // filter row carries the same labels, so scope the query to the dialog.)
    const modal = (await screen.findByRole('button', { name: 'Save' })).closest('div[class*="rounded"]').parentElement
    fireEvent.click(within(modal).getByRole('button', { name: /Field trips/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/events/e2',
      expect.objectContaining({ categories: ['Camps', 'Field trips'] }),
    ))
  })

  it('deselects a category that is clicked again', async () => {
    render(<CalendarPage />)
    fireEvent.click(await screen.findByText('Winter camp'))
    const modal = (await screen.findByRole('button', { name: 'Save' })).closest('div[class*="rounded"]').parentElement
    fireEvent.click(within(modal).getByRole('button', { name: /Camps/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/events/e2',
      expect.objectContaining({ categories: [] }),
    ))
  })
})
