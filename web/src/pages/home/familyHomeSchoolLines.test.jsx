import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FamilyHome from './FamilyHome'

/**
 * What the school tells a family on the family home (/family), where parents
 * land.
 *
 * Volunteer hours -- iCreate 2fab910a/9db5bde3: "I know you just added a
 * tracker to track hours and also comments for it... I'm not seeing it from
 * the parent side. Is there a way to make it so that the parents can also see
 * the notes and the hours?" The line was only on the school pages.
 *
 * Who to contact -- ticket c58b7c0b (iCreate, org admin): "On parent
 * dashboards, could we create a section where there is who to contact info?
 * ... e.g. a question about something in the building message Becky; late
 * pick-up; general concern about classes message Sharmaine."
 */

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'parent-1', role: 'parent', first_name: 'Dana' }, refreshUser: vi.fn() }),
}))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => ({ school: null }) }))
vi.mock('../../contexts/FamilyScopeContext', () => ({
  useFamilyScope: () => ({ children: [], isLoading: false, enterScope: vi.fn() }),
}))
vi.mock('../../hooks/api/useFamilyChildren', () => ({
  useInvalidateFamilyChildren: () => vi.fn(),
  useChildSummary: () => ({ data: null }),
  useUploadChildAvatar: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../../components/parent/AddChildModal', () => ({ default: () => null }))
vi.mock('../../components/parent/FamilySettingsModal', () => ({ default: () => null }))
vi.mock('../../components/parent/FamilyQuestsSection', () => ({ default: () => null }))
vi.mock('../../components/parent/FamilyCover', () => ({ default: () => null }))
vi.mock('../../components/parent/ParentMomentCaptureButton', () => ({ default: () => null }))
vi.mock('../../components/parent/VisibilityApprovalSection', () => ({ default: () => null }))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const CONTACTS = [
  { topic: 'Building questions', name: 'Becky Lane', phone: '(801) 555-0100', email: null,
    staff_user_id: 'becky', message_user_id: 'becky' },
  { topic: 'Late pick-up', name: 'Front desk', phone: null, email: 'desk@icreate.test',
    staff_user_id: null, message_user_id: null },
]

let org
let hours

function routes(url) {
  if (url.startsWith('/api/sis/parent/context')) return { data: { orgs: [org] } }
  if (url.startsWith('/api/sis/parent/volunteer-hours')) return { data: hours }
  return { data: {} }
}

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/family']}>
        <FamilyHome />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  org = { organization_id: 'org-1', organization_name: 'iCreate', students: [], family_contacts: [] }
  hours = { success: true, volunteer_hours: 12.5, updated_at: '2026-10-01T12:00:00Z', note: 'Fall fair: 4h on 9/20', shown: true }
  api.get.mockImplementation((url) => Promise.resolve(routes(url)))
})

describe('FamilyHome volunteer hours (iCreate 2fab910a/9db5bde3)', () => {
  it('shows a guardian their hours, the as-of date and the note', async () => {
    renderHome()
    const line = await screen.findByTestId('family-volunteer-hours')
    expect(line).toHaveTextContent('Volunteer hours')
    expect(line).toHaveTextContent('12.5')
    expect(line).toHaveTextContent('as of')
    expect(screen.getByTestId('family-volunteer-hours-note')).toHaveTextContent('Fall fair: 4h on 9/20')
    expect(api.get).toHaveBeenCalledWith('/api/sis/parent/volunteer-hours?organization_id=org-1')
  })

  it('shows nothing when the school does not use the field', async () => {
    hours = { success: true, volunteer_hours: 0, updated_at: null, note: null, shown: false }
    renderHome()
    await waitFor(() => expect(api.get.mock.calls.some(([u]) => u.includes('/volunteer-hours'))).toBe(true))
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByTestId('family-volunteer-hours')).toBeNull()
  })
})

describe('FamilyHome who to contact (c58b7c0b)', () => {
  it('lists each topic with its person, call and email links, and Message only for staff', async () => {
    org.family_contacts = CONTACTS
    renderHome()
    const rows = await screen.findAllByTestId('who-to-contact-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Building questions')
    expect(rows[0]).toHaveTextContent('Becky Lane')
    expect(screen.getByRole('link', { name: 'Call Becky Lane' })).toHaveAttribute('href', 'tel:8015550100')
    expect(screen.getByRole('link', { name: 'Email Front desk' })).toHaveAttribute('href', 'mailto:desk@icreate.test')
    const message = screen.getAllByRole('link', { name: /^Message/ })
    expect(message).toHaveLength(1)
    expect(message[0]).toHaveAttribute('href', '/messages?user=becky')
  })

  it('has no card when the school has no list', async () => {
    renderHome()
    await screen.findByText('Welcome back, Dana')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/parent/context'))
    expect(screen.queryByRole('region', { name: 'Who to contact' })).toBeNull()
  })
})
