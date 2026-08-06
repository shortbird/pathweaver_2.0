import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OrganizationContext } from '../contexts/OrganizationContext'

/**
 * The pages behind the school hub's cards.
 *
 * Two things changed for them on 2026-08-06. They are no longer reachable from
 * the sidebar, so they need a way back; and the three school-wide ones resolve
 * their school by MEMBERSHIP now, not guardianship. That second one is a real
 * bug fix: a student at iCreate opening the school calendar or the resource
 * library was told "Your account isn't linked to a school yet", because the
 * only context they had was one that answers "whose guardian are you".
 */

let schoolContext = {
  success: true, is_guardian: true,
  orgs: [{ organization_id: 'org-1', organization_name: 'iCreate', is_guardian: true }],
}

const get = vi.fn((url) => {
  if (url.startsWith('/api/sis/school/context')) return Promise.resolve({ data: schoolContext })
  if (url.startsWith('/api/sis/parent/resources')) {
    return Promise.resolve({ data: { resources: [
      { id: 'r1', title: 'Family Guidebook', url: 'https://x/guide.pdf', category: 'Policies' },
    ] } })
  }
  if (url.startsWith('/api/sis/parent/directory/opt-in')) {
    return Promise.resolve({ data: { opted_in: true, share_email: true, share_phone: true } })
  }
  if (url.startsWith('/api/sis/parent/directory')) {
    return Promise.resolve({ data: { families: [] } })
  }
  return Promise.resolve({ data: {} })
})
vi.mock('../services/api', () => ({ default: { get: (...a) => get(...a), put: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import BackToSchool from '../components/navigation/BackToSchool'
import FamilyResourcesPage from './FamilyResourcesPage'
import FamilyDirectoryPage from './FamilyDirectoryPage'

const AS_STUDENT = {
  success: true, is_guardian: false,
  orgs: [{ organization_id: 'org-1', organization_name: 'iCreate', is_guardian: false }],
}

const renderIn = (ui, school = { id: 'org-1', name: 'iCreate' }) => render(
  <OrganizationContext.Provider value={{ school, organization: null, loading: false }}>
    <MemoryRouter>{ui}</MemoryRouter>
  </OrganizationContext.Provider>,
)

beforeEach(() => {
  vi.clearAllMocks()
  schoolContext = {
    success: true, is_guardian: true,
    orgs: [{ organization_id: 'org-1', organization_name: 'iCreate', is_guardian: true }],
  }
})

describe('the way back to the school page', () => {
  it('is named after the school and goes there', () => {
    renderIn(<BackToSchool />)
    expect(screen.getByRole('link', { name: /icreate/i })).toHaveAttribute('href', '/school')
  })

  it('degrades to a plain label rather than throwing outside the provider', () => {
    // It renders on eight pages; one of them mounted without the org provider
    // should lose a school name, not the whole page.
    render(<MemoryRouter><BackToSchool /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /my school/i })).toHaveAttribute('href', '/school')
  })
})

describe('a student opening the school-wide pages', () => {
  beforeEach(() => { schoolContext = AS_STUDENT })

  it('reads the resource library instead of being told they have no school', async () => {
    renderIn(<FamilyResourcesPage />)
    expect(await screen.findByText('Family Guidebook')).toBeInTheDocument()
    expect(screen.queryByText(/isn't linked to a school/i)).not.toBeInTheDocument()
  })

  it('is not offered a family opt-in they have no family for', async () => {
    // The directory listing is per HOUSEHOLD. A student is in the school
    // without being a guardian of anyone in it, so the toggle is not theirs.
    renderIn(<FamilyDirectoryPage />)
    await screen.findByRole('heading', { name: /family directory/i })
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})

describe('the directory opt-in, for the guardian who owns it', () => {
  it('says who will be able to see the listing', async () => {
    // Families opted in when this read "so families can reach each other".
    // Students and staff can see it now, so the toggle says so where the
    // choice is actually made.
    renderIn(<FamilyDirectoryPage />)
    expect(await screen.findByRole('switch')).toBeInTheDocument()
    expect(screen.getByText(/families, students and staff/i)).toBeInTheDocument()
  })
})
