import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The sidebar's signals: the unread badge, the two "you are not yourself"
 * banners, and the items that appear only once a query answers.
 *
 * Sidebar.test.jsx covers which nav items each role gets. This file covers the
 * parts that are driven by something other than the role.
 *
 * THE BADGE. The component has rendered `item.badge` since it was written and
 * nothing ever set one, so a message arrived, a notification row was written,
 * and the nav looked identical. Gryffin reported it on 2026-08-27: "messages
 * doesn't have any notifications, so you dont know if you have received
 * messages". It is now fed by useUnreadCount, and it renders in two places --
 * once for the collapsed rail and once for the expanded one -- which is
 * exactly the shape that half-regresses.
 *
 * THE BANNERS. Acting-as and masquerade are the two states where the person at
 * the keyboard is not the account on screen. The way out has to be present in
 * both sidebar widths, or someone is stuck inside a child's account (FU-05) or
 * an admin is left masquerading with no exit.
 *
 * THE CONDITIONAL ITEMS. Courses and Classes appear in place when their
 * queries resolve rather than being appended, so the menu does not reshuffle
 * under the pointer.
 */

let authState = { user: null, logout: vi.fn(), isAuthenticated: true }
let orgState = { organization: null, school: null }
let actingAsState = { actingAsDependent: null, clearActingAs: vi.fn() }
let unreadState = { data: undefined }
let masqueradeState = null

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}))

vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => orgState,
}))

vi.mock('../../contexts/ActingAsContext', () => ({
  useActingAs: () => actingAsState,
}))

vi.mock('../../hooks/api/useDirectMessages', () => ({
  useUnreadCount: () => unreadState,
}))

const apiGet = vi.fn()
vi.mock('../../services/api', () => ({
  default: { get: (...args) => apiGet(...args) },
}))

const exitMasquerade = vi.fn()
vi.mock('../../services/masqueradeService', () => ({
  getMasqueradeState: () => masqueradeState,
  exitMasquerade: (...args) => exitMasquerade(...args),
}))

vi.mock('../parent/ActingAsBanner', () => ({
  default: ({ dependent, onSwitchBack }) => (
    <div data-testid="acting-as-banner">
      <span>{dependent?.first_name}</span>
      <button data-testid="switch-back" onClick={onSwitchBack}>Switch back</button>
    </div>
  ),
}))

vi.mock('../admin/MasqueradeBanner', () => ({
  default: ({ targetUser, onExit }) => (
    <div data-testid="masquerade-banner">
      <span>{targetUser?.email}</span>
      <button data-testid="exit-masquerade" onClick={onExit}>Exit</button>
    </div>
  ),
}))

import Sidebar from './Sidebar'

function renderSidebar(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Sidebar
          isOpen
          isPinned
          onClose={vi.fn()}
          onTogglePin={vi.fn()}
          onHoverChange={vi.fn()}
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  authState = {
    user: { id: 'u1', role: 'student', email: 's@example.com' },
    logout: vi.fn(),
    isAuthenticated: true,
  }
  orgState = { organization: null, school: null }
  actingAsState = { actingAsDependent: null, clearActingAs: vi.fn() }
  unreadState = { data: undefined }
  masqueradeState = null
  apiGet.mockResolvedValue({ data: { courses: [], classes: [] } })
})

describe('Sidebar — the unread message badge', () => {
  const messagesLink = () => screen.getByRole('link', { name: /messages/i })

  it('shows no badge when there is nothing unread', () => {
    unreadState = { data: { unread_count: 0 } }
    renderSidebar()
    expect(messagesLink()).toHaveTextContent(/^Messages$/)
  })

  it('shows no badge before the count has loaded', () => {
    // undefined is not zero, but it is not a number to show either. The nav
    // must not flash a badge on first paint.
    unreadState = { data: undefined }
    renderSidebar()
    expect(messagesLink()).toHaveTextContent(/^Messages$/)
  })

  it('shows the count when messages are waiting', () => {
    unreadState = { data: { unread_count: 3 } }
    renderSidebar()
    expect(messagesLink()).toHaveTextContent('3')
  })

  it('caps the badge at 99+', () => {
    // Three digits do not fit the collapsed rail's 18px dot, and an unread
    // count of 412 is the same message as "a lot".
    unreadState = { data: { unread_count: 412 } }
    renderSidebar()
    expect(messagesLink()).toHaveTextContent('99+')
    expect(messagesLink()).not.toHaveTextContent('412')
  })

  it('shows 99 without the plus', () => {
    unreadState = { data: { unread_count: 99 } }
    renderSidebar()
    expect(messagesLink()).toHaveTextContent('99')
    expect(messagesLink()).not.toHaveTextContent('99+')
  })

  it('badges Messages and nothing else', () => {
    // The badge is a property of one item. A version that read a shared value
    // would decorate every link in the rail.
    unreadState = { data: { unread_count: 5 } }
    renderSidebar()
    const badged = screen.getAllByRole('link').filter(l => /\d/.test(l.textContent))
    expect(badged).toHaveLength(1)
    expect(badged[0]).toHaveAttribute('href', '/messages')
  })

  it('still shows the badge when the sidebar is collapsed', () => {
    // Collapsed is the default width until the pointer arrives, so this is the
    // state the badge exists for -- there is no label to read there.
    unreadState = { data: { unread_count: 7 } }
    renderSidebar({ isPinned: false, isHovered: false })
    expect(messagesLink()).toHaveTextContent('7')
  })
})

describe('Sidebar — acting as a child', () => {
  it('offers the way out when a parent is inside a child account', () => {
    actingAsState = {
      actingAsDependent: { id: 'kid-1', first_name: 'Rory' },
      clearActingAs: vi.fn(),
    }
    renderSidebar()
    expect(screen.getByTestId('acting-as-banner')).toHaveTextContent('Rory')
    expect(screen.getByTestId('switch-back')).toBeInTheDocument()
  })

  it('shows nothing when the parent is themselves', () => {
    renderSidebar()
    expect(screen.queryByTestId('acting-as-banner')).not.toBeInTheDocument()
  })

  it('keeps an exit reachable while collapsed', () => {
    // The full banner needs the expanded width. Collapsed, the exit becomes a
    // button that expands the rail -- but there must BE one: a session with no
    // visible exit is FU-05's failure, a parent left inside their child's
    // account with the exit button already pressed.
    actingAsState = {
      actingAsDependent: { id: 'kid-1', first_name: 'Rory' },
      clearActingAs: vi.fn(),
    }
    renderSidebar({ isPinned: false, isHovered: false })
    expect(screen.queryByTestId('acting-as-banner')).not.toBeInTheDocument()
    expect(screen.getByTitle(/Acting as child/)).toBeInTheDocument()
  })
})

describe('Sidebar — masquerade', () => {
  // handleExitMasquerade navigates with window.location.href, which jsdom
  // refuses to follow. Swap the whole object for the length of this block and
  // put it back afterwards -- Sidebar also reads location.hostname (via
  // appSurface's host check), so the replacement has to carry one.
  const realLocation = Object.getOwnPropertyDescriptor(window, 'location')
  let navigatedTo

  const captureNavigation = () => {
    navigatedTo = []
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: {
        hostname: 'localhost',
        origin: 'http://localhost:3000',
        pathname: '/',
        search: '',
        get href() { return 'http://localhost:3000/' },
        set href(v) { navigatedTo.push(v) },
      },
    })
  }

  afterEach(() => {
    if (realLocation) Object.defineProperty(window, 'location', realLocation)
  })

  it('shows the banner while an admin is masquerading', () => {
    masqueradeState = { target_user: { id: 'u9', email: 'kid@example.com' } }
    renderSidebar()
    expect(screen.getByTestId('masquerade-banner')).toHaveTextContent('kid@example.com')
  })

  it('shows nothing when nobody is masquerading', () => {
    renderSidebar()
    expect(screen.queryByTestId('masquerade-banner')).not.toBeInTheDocument()
  })

  it('sends a superadmin back to the user list they came from', async () => {
    masqueradeState = { target_user: { id: 'u9', email: 'kid@example.com' } }
    exitMasquerade.mockResolvedValue({ success: true, adminUser: { role: 'superadmin' } })
    captureNavigation()

    renderSidebar()
    fireEvent.click(screen.getByTestId('exit-masquerade'))

    await waitFor(() => expect(navigatedTo).toContain('/admin/users'))
  })

  it('sends an org admin home, because they have no /admin/users', async () => {
    // Org admins can masquerade as their own members but have no platform
    // admin console. Landing them on /admin/users is a 403 immediately after
    // an action that succeeded.
    masqueradeState = { target_user: { id: 'u9', email: 'kid@example.com' } }
    exitMasquerade.mockResolvedValue({ success: true, adminUser: { role: 'org_managed' } })
    captureNavigation()

    renderSidebar()
    fireEvent.click(screen.getByTestId('exit-masquerade'))

    await waitFor(() => expect(navigatedTo).toContain('/'))
    expect(navigatedTo).not.toContain('/admin/users')
  })

  it('keeps an exit reachable while collapsed', () => {
    masqueradeState = { target_user: { id: 'u9', email: 'kid@example.com' } }
    renderSidebar({ isPinned: false, isHovered: false })
    expect(screen.queryByTestId('masquerade-banner')).not.toBeInTheDocument()
    expect(screen.getByTitle(/Masquerading/)).toBeInTheDocument()
  })
})

describe('Sidebar — items that wait for a query', () => {
  it('hides Courses from a student with no enrollments', async () => {
    // Enrollment starts from links and orgs, not catalogue browsing, so an
    // empty Courses page is a dead end rather than an invitation.
    apiGet.mockResolvedValue({ data: { courses: [], classes: [] } })
    renderSidebar()
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/courses'))
    expect(screen.queryByRole('link', { name: /^courses$/i })).not.toBeInTheDocument()
  })

  it('shows Courses once a student is enrolled in one', async () => {
    apiGet.mockImplementation((url) =>
      url === '/api/courses'
        ? Promise.resolve({ data: { courses: [{ id: 'c1', is_enrolled: true }] } })
        : Promise.resolve({ data: { classes: [] } }),
    )
    renderSidebar()
    expect(await screen.findByRole('link', { name: /^courses$/i }))
      .toHaveAttribute('href', '/courses')
  })

  it('shows Courses to a superadmin without asking', async () => {
    authState.user = { id: 'u1', role: 'superadmin', email: 't@example.com' }
    apiGet.mockResolvedValue({ data: { courses: [], classes: [] } })
    renderSidebar()
    expect(await screen.findByRole('link', { name: /^courses$/i })).toBeInTheDocument()
  })

  it('shows Classes once a student is in one', async () => {
    apiGet.mockImplementation((url) =>
      url === '/api/student/classes'
        ? Promise.resolve({ data: { classes: [{ id: 'cl1' }] } })
        : Promise.resolve({ data: { courses: [] } }),
    )
    renderSidebar()
    expect(await screen.findByRole('link', { name: /^classes$/i }))
      .toHaveAttribute('href', '/org-classes')
  })

  it('keeps Courses above Classes when both arrive', async () => {
    // Both are in the Learning section with fixed slots. Appending on arrival
    // would reorder the menu under the pointer as the two queries resolve.
    apiGet.mockImplementation((url) =>
      url === '/api/courses'
        ? Promise.resolve({ data: { courses: [{ id: 'c1', is_enrolled: true }] } })
        : Promise.resolve({ data: { classes: [{ id: 'cl1' }] } }),
    )
    renderSidebar()
    const courses = await screen.findByRole('link', { name: /^courses$/i })
    const classes = await screen.findByRole('link', { name: /^classes$/i })
    expect(courses.compareDocumentPosition(classes))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })
})

describe('Sidebar — the teaching section', () => {
  const teacher = (extra = {}) => ({
    id: 'a1',
    role: 'org_managed',
    org_role: 'advisor',
    organization_id: 'org-1',
    email: 'a@example.com',
    ...extra,
  })

  it('gives an LMS-only teacher their own daily surfaces', () => {
    // Without these the teacher depends on TeacherHome tiles to reach the
    // tools they use every day.
    authState.user = teacher()
    orgState = { organization: { id: 'org-1', slug: 'lms', feature_flags: {} }, school: null }
    renderSidebar()
    expect(screen.getByRole('link', { name: /^my classes$/i })).toHaveAttribute('href', '/org-classes')
    expect(screen.getByRole('link', { name: /^verifications$/i })).toHaveAttribute('href', '/advisor/verification')
    expect(screen.getByRole('link', { name: /^quest invitations$/i })).toBeInTheDocument()
  })

  it('moves class work to the console for a SIS teacher, and keeps verifications', () => {
    // On a SIS org, classes and invitations live in the console; the
    // verification queue is an LMS feature SIS teachers still use, so it stays.
    authState.user = teacher()
    orgState = {
      organization: { id: 'org-1', slug: 'sis', feature_flags: { sis_enabled: true } },
      school: null,
    }
    renderSidebar()
    expect(screen.queryByRole('link', { name: /^my classes$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^quest invitations$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^verifications$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /school admin/i })).toBeInTheDocument()
  })

  it('gives a student none of it', () => {
    renderSidebar()
    expect(screen.queryByRole('link', { name: /^verifications$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^quest invitations$/i })).not.toBeInTheDocument()
  })
})

describe('Sidebar — the observer feed', () => {
  const observerFeed = () => screen.queryByRole('link', { name: /^student feed$/i })

  it.each([
    ['a parent', { id: 'p1', role: 'parent', email: 'p@example.com' }],
    ['an advisor', { id: 'a1', role: 'advisor', email: 'a@example.com' }],
    ['an observer', { id: 'o1', role: 'observer', email: 'o@example.com' }],
    ['a superadmin', { id: 't1', role: 'superadmin', email: 't@example.com' }],
  ])('gives %s the way to watch a student\'s work', (_label, user) => {
    authState.user = user
    renderSidebar()
    expect(observerFeed()).toHaveAttribute('href', '/observer/feed')
  })

  it('does not give a plain student a window onto other students', () => {
    renderSidebar()
    expect(observerFeed()).not.toBeInTheDocument()
  })

  it('reads an org role out of the org_roles array as well as org_role', () => {
    // Roles arrive in two shapes on org accounts. A check that reads only one
    // of them silently drops the item for half the org.
    authState.user = {
      id: 'p1', role: 'org_managed', org_roles: ['parent'],
      organization_id: 'org-1', email: 'p@example.com',
    }
    renderSidebar()
    expect(observerFeed()).toHaveAttribute('href', '/observer/feed')
  })
})
