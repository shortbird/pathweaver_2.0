/**
 * Family Directory — the two directory models and carpooling.
 *
 * iCreate, 2026-08-05: "I would really like this to be opt OUT instead of opt
 * in" and "show the city they live in and then have something they could check
 * ... that says if they would be open to carpooling. And then we could filter
 * it so that people wanting carpools could see who wanted to carpool."
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// The page carries a BackToSchool link, so it needs a router around it.
// The page reads its school through react-query (hooks/api/useSchoolContext).
const render = (ui) => rtlRender(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>,
)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), put: vi.fn() },
}))
vi.mock('../services/api', () => ({ default: api }))

import FamilyDirectoryPage from './FamilyDirectoryPage'

const FAMILIES = [
  { household_id: 'h1', family_name: 'One Family', city: 'Provo', carpool_interest: true,
    guardians: [{ name: 'Gina One', email: 'g1@x.com' }], students: ['Sam'], phone: '555-1111' },
  { household_id: 'h2', family_name: 'Two Family', city: 'Orem', carpool_interest: false,
    guardians: [{ name: 'Tom Two', email: null }], students: ['Ada'], phone: null },
]

let optIn = { opted_in: true, default_in: false, carpool_interest: false,
              share_email: true, share_phone: true, share_address: false }

beforeEach(() => {
  vi.clearAllMocks()
  optIn = { opted_in: true, default_in: false, carpool_interest: false,
            share_email: true, share_phone: true, share_address: false }
  api.get.mockImplementation((url) => {
    // The directory is a school-wide read: it bootstraps from the membership
    // context, not the guardian one.
    if (url.includes('/school/context')) {
      return Promise.resolve({ data: {
        orgs: [{ organization_id: 'org-1', organization_name: 'iCreate' }],
        is_guardian: true,
      } })
    }
    if (url.includes('/directory/opt-in')) return Promise.resolve({ data: optIn })
    if (url.includes('/directory')) return Promise.resolve({ data: { families: FAMILIES } })
    return Promise.resolve({ data: {} })
  })
  api.put.mockResolvedValue({ data: { success: true } })
})

describe('family directory', () => {
  it('shows each family city so neighbours can find each other', async () => {
    render(<FamilyDirectoryPage />)
    expect(await screen.findByText('Provo')).toBeInTheDocument()
    expect(screen.getByText('Orem')).toBeInTheDocument()
  })

  it('filters down to families open to carpooling', async () => {
    render(<FamilyDirectoryPage />)
    const filter = await screen.findByRole('button', { name: /Open to carpooling \(1\)/ })
    expect(screen.getByText('Two Family')).toBeInTheDocument()

    fireEvent.click(filter)

    await waitFor(() => expect(screen.queryByText('Two Family')).not.toBeInTheDocument())
    expect(screen.getByText('One Family')).toBeInTheDocument()
  })

  // Was "saves carpool interest alongside the sharing choices". The sharing
  // choices moved to Family Settings (2d456409), so the carpool save sends
  // only the listing state and the flag -- sending the share keys from here
  // would overwrite what the family chose there with whatever this page holds.
  it('saves carpool interest without touching the sharing choices', async () => {
    render(<FamilyDirectoryPage />)
    const checkbox = await screen.findByRole('checkbox', { name: /open to carpooling/i })
    fireEvent.click(checkbox)

    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(api.put.mock.calls[0][1]).toEqual({ opted_in: true, carpool_interest: true })
  })

  // These two used to find the listing switch's own label ("Our family is
  // listed..." / "Include our family..."); the switch is in Family Settings
  // now (2d456409), so they check the page's summary line instead.
  it('says the family is already listed at an opt-out school', async () => {
    optIn = { ...optIn, default_in: true }
    render(<FamilyDirectoryPage />)
    expect(await screen.findByText(/Your family is listed\./)).toBeInTheDocument()
    expect(screen.getByText(/unless they ask to be left out/)).toBeInTheDocument()
  })

  it('explains opt-in at an opt-in school', async () => {
    optIn = { ...optIn, opted_in: false }
    render(<FamilyDirectoryPage />)
    expect(await screen.findByText(/Your family is not listed\./)).toBeInTheDocument()
    expect(screen.getByText(/Only families who opt in appear here/)).toBeInTheDocument()
  })
})

// iCreate, 2d456409 (2026-09-22): "I really wanted the directory to be opt OUT
// instead of opt in. And preferably put this in a more hidden place (Like
// settings.) Carpool message can remain on top."
describe('the listing controls live in Family Settings (2d456409)', () => {
  it('renders no listing switch and no sharing checkboxes', async () => {
    render(<FamilyDirectoryPage />)
    await screen.findByRole('checkbox', { name: /open to carpooling/i })
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    for (const name of ['Parent emails', 'Family phone', 'Street address']) {
      expect(screen.queryByRole('checkbox', { name })).not.toBeInTheDocument()
    }
  })

  it('links to the Directory tab of Family Settings', async () => {
    render(<FamilyDirectoryPage />)
    const link = await screen.findByRole('link', { name: 'Change how your family is listed' })
    expect(link).toHaveAttribute('href', '/family?settings=directory')
  })

  it('keeps the carpool checkbox and the carpool filter on the page', async () => {
    render(<FamilyDirectoryPage />)
    expect(await screen.findByRole('checkbox', { name: /open to carpooling/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open to carpooling \(1\)/ })).toBeInTheDocument()
  })
})
