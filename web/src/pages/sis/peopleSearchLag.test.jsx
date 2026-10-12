import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RecordDoorsProvider } from '../../components/sis/RecordDoors'
import PeoplePage from './PeoplePage'

/**
 * Typing in the People search keeps up with the keyboard.
 *
 * Ticket a8049dcb (bug), an iCreate coordinator in the SIS console:
 *
 *   "When I type in a search, for example a student or class, it takes
 *    several seconds for each character to pop up. If you type at a normal
 *    speed it doesn't catch all of the characters."
 *
 * The box was driven by the URL (?q=), and the app's Router runs every
 * navigation as a React transition (v7_startTransition), so each keystroke
 * waited on a low-priority URL update plus several passes over ~370 people.
 * Now the box is local state, the URL is written on a 250ms debounce, and the
 * table filters on a deferred copy. The URL still carries the search for a
 * link, a reload and Back.
 */

const { api, sisOrg, preview } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })), patch: vi.fn(), delete: vi.fn() },
  sisOrg: { orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, canViewAs: true, activeOrg: null },
  preview: { setPreviewTeacher: vi.fn(), getPreviewTeacher: () => null, clearPreviewTeacher: vi.fn(), withPreview: (p) => p },
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../contexts/AuthContext', async () => {
  const React = await import('react')
  return { useAuth: () => ({ user: { id: 'u1', role: 'org_admin' } }), AuthContext: React.createContext(null) }
})
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => ({ organization: { id: 'org-1' } }) }))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => () => Promise.resolve(true) }))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({ useSisOrg: () => sisOrg, withOrg: (p) => p }))
vi.mock('./teacherPreview', () => preview)
vi.mock('../../services/masqueradeService', () => ({ startMasquerade: vi.fn() }))
vi.mock('../../utils/appSurface', () => ({ switchSurfaceInApp: vi.fn() }))
vi.mock('../../services/api', () => ({ default: api }))


const person = (id, over = {}) => ({
  student_id: id, name: id, first_name: id, last_name: 'X', is_student: false, roles: ['parent'], role: 'parent',
  enrollment_status: null, household_id: null, household_name: null, age: null,
  joined_at: '2026-06-01T00:00:00Z', last_active: null, email: `${id.toLowerCase().replace(/ /g, '')}@x.com`, ...over,
})
const ROSTER = [
  person('Ada Ant'), person('Bo Bee'), person('Cal Cat'), person('Abigail Adams'),
]

let location
const LocationProbe = () => { location = useLocation(); return null }
let navigate
const NavProbe = () => { navigate = useNavigate(); return null }

// The app's Router flags, so a URL write is a transition here as it is live.
const render = (route = '/people') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RecordDoorsProvider><PeoplePage /></RecordDoorsProvider>
        <LocationProbe /><NavProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const box = () => screen.getByLabelText('Search people')
const type = (text) => {
  // One change per character, each built on what the box shows now -- what a
  // browser does. A stale controlled value would drop characters here.
  for (const ch of text) fireEvent.change(box(), { target: { value: box().value + ch } })
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/api/sis/roster')) return Promise.resolve({ data: { roster: ROSTER } })
    return Promise.resolve({ data: {} })
  })
})

describe('People search (ticket a8049dcb)', () => {
  it('keeps every character typed quickly', async () => {
    render()
    await screen.findByText('Ada Ant')
    type('abigail')
    expect(box()).toHaveValue('abigail')
    await waitFor(() => expect(screen.queryByText('Ada Ant')).not.toBeInTheDocument())
    expect(screen.getByText('Abigail Adams')).toBeInTheDocument()
  })

  it('updates the box at once and writes the URL only after typing stops', async () => {
    render()
    await screen.findByText('Ada Ant')
    type('bo')
    // The box has the text now; the URL has not been touched yet.
    expect(box()).toHaveValue('bo')
    expect(new URLSearchParams(location.search).get('q')).toBeNull()
    await waitFor(() => expect(new URLSearchParams(location.search).get('q')).toBe('bo'))
    expect(box()).toHaveValue('bo')
    expect(screen.queryByText('Ada Ant')).not.toBeInTheDocument()
    expect(screen.getByText('Bo Bee')).toBeInTheDocument()
  })

  it('restores the search from the link', async () => {
    render('/people?q=cal')
    expect(await screen.findByText('Cal Cat')).toBeInTheDocument()
    expect(box()).toHaveValue('cal')
    expect(screen.queryByText('Ada Ant')).not.toBeInTheDocument()
  })

  it('follows the URL when it changes from outside (Back, a link)', async () => {
    render('/people?q=cal')
    await screen.findByText('Cal Cat')
    await act(async () => { navigate('/people?q=bo') })
    await waitFor(() => expect(box()).toHaveValue('bo'))
    expect(screen.getByText('Bo Bee')).toBeInTheDocument()
    expect(screen.queryByText('Cal Cat')).not.toBeInTheDocument()
  })

  it('a cleared box clears the URL', async () => {
    render('/people?q=cal')
    await screen.findByText('Cal Cat')
    fireEvent.change(box(), { target: { value: '' } })
    expect(box()).toHaveValue('')
    await waitFor(() => expect(new URLSearchParams(location.search).get('q')).toBeNull())
    expect(screen.getByText('Ada Ant')).toBeInTheDocument()
  })
})
