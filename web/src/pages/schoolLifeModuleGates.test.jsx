import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The school calendar and the library are each one module's (`calendar`,
 * `resources`), and both reads 404 for a school without it once the module
 * gate enforces. Optio Academy runs neither, and these pages asked anyway when
 * opened from an old link: a ModuleGate warning per visit. Each page offers
 * only the schools that run its module, from the school context's list.
 */

let schoolOrgs = []
vi.mock('../hooks/useSchoolContext', () => ({ default: () => ({ orgs: schoolOrgs }) }))
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('../services/api', () => ({ default: { get: vi.fn() } }))
import api from '../services/api'
import FamilyCalendarPage from './FamilyCalendarPage'
import FamilyResourcesPage from './FamilyResourcesPage'

const ACADEMY = { organization_id: 'org-a', organization_name: 'Optio Academy', modules: ['prior_learning'] }
const ICREATE = { organization_id: 'org-i', organization_name: 'iCreate', modules: ['calendar', 'resources'] }

const called = (part) => api.get.mock.calls.some(([url]) => url.includes(part))

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { success: true, events: [], resources: [] } })
})

const renderIt = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('the school calendar', () => {
  it('does not ask a school with calendar off, and says it keeps none', async () => {
    schoolOrgs = [ACADEMY]
    renderIt(<FamilyCalendarPage />)
    expect(await screen.findByText(/Optio Academy doesn.t keep a calendar here/)).toBeInTheDocument()
    expect(called('/parent/events')).toBe(false)
    expect(screen.queryByRole('button', { name: 'Add to my calendar' })).not.toBeInTheDocument()
  })

  it('opens on the school that keeps one, for a family at both', async () => {
    schoolOrgs = [ACADEMY, ICREATE]
    renderIt(<FamilyCalendarPage />)
    await waitFor(() => expect(called('/parent/events?organization_id=org-i')).toBe(true))
    expect(called('organization_id=org-a')).toBe(false)
    // No picker: only one of the two schools has a calendar to pick.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('asks when the context cannot answer (no module list)', async () => {
    schoolOrgs = [{ ...ACADEMY, modules: null }]
    renderIt(<FamilyCalendarPage />)
    await waitFor(() => expect(called('/parent/events?organization_id=org-a')).toBe(true))
  })
})

describe('the library', () => {
  it('does not ask a school with resources off, and says it keeps none', async () => {
    schoolOrgs = [ACADEMY]
    renderIt(<FamilyResourcesPage />)
    expect(await screen.findByText(/Optio Academy doesn.t keep a library here/)).toBeInTheDocument()
    expect(called('/parent/resources')).toBe(false)
  })

  it('still asks a school that runs it', async () => {
    schoolOrgs = [ICREATE]
    renderIt(<FamilyResourcesPage />)
    await waitFor(() => expect(called('/parent/resources?organization_id=org-i')).toBe(true))
  })

  it('keeps the no-school message for someone with no school', async () => {
    schoolOrgs = []
    renderIt(<FamilyResourcesPage />)
    expect(await screen.findByText(/isn.t linked to a school yet/)).toBeInTheDocument()
    expect(called('/parent/resources')).toBe(false)
  })
})
