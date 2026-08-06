/**
 * Family Directory — the two directory models and carpooling.
 *
 * iCreate, 2026-08-05: "I would really like this to be opt OUT instead of opt
 * in" and "show the city they live in and then have something they could check
 * ... that says if they would be open to carpooling. And then we could filter
 * it so that people wanting carpools could see who wanted to carpool."
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

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
    if (url.includes('/parent/context')) {
      return Promise.resolve({ data: { orgs: [{ organization_id: 'org-1', organization_name: 'iCreate' }] } })
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

  it('saves carpool interest alongside the sharing choices', async () => {
    render(<FamilyDirectoryPage />)
    const checkbox = await screen.findByRole('checkbox', { name: /open to carpooling/i })
    fireEvent.click(checkbox)

    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(api.put.mock.calls[0][1]).toMatchObject({ opted_in: true, carpool_interest: true })
  })

  it('says the family is already listed at an opt-out school', async () => {
    optIn = { ...optIn, default_in: true }
    render(<FamilyDirectoryPage />)
    expect(await screen.findByText(/Our family is listed in the directory/)).toBeInTheDocument()
    expect(screen.getByText(/unless they ask to be left out/)).toBeInTheDocument()
  })

  it('invites a family to join at an opt-in school', async () => {
    render(<FamilyDirectoryPage />)
    expect(await screen.findByText(/Include our family in the directory/)).toBeInTheDocument()
    expect(screen.getByText(/Only families who opt in appear here/)).toBeInTheDocument()
  })
})
