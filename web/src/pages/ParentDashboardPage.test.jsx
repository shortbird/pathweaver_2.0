import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ParentDashboardPage from './ParentDashboardPage'
import { toast } from 'react-hot-toast'

const mockNavigate = vi.fn()
let authState = {}
let actingAsState = {}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('../contexts/ActingAsContext', () => ({
  useActingAs: () => actingAsState
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('../services/api', () => ({
  // default export used by ParentCheckInCard (rendered inside the dashboard) —
  // report not-applicable so the check-in card renders nothing here.
  default: {
    get: () => Promise.resolve({ data: { applicable: false, checkin: null } }),
    post: () => Promise.resolve({ data: {} }),
  },
  parentAPI: {
    getMyChildren: vi.fn()
  }
}))

vi.mock('../services/dependentAPI', () => ({
  getMyDependents: vi.fn()
}))

// Mock child components
vi.mock('../components/parent/AddChildModal', () => ({
  default: ({ isOpen, onSuccess }) => isOpen ? (
    <div data-testid="add-child-modal">
      Add Child
      <button
        data-testid="add-child-succeed"
        onClick={() => onSuccess({ message: 'Nell added', student: { id: 'new-1' } })}
      >
        Save
      </button>
    </div>
  ) : null
}))

vi.mock('../components/parent/VisibilityApprovalSection', () => ({
  default: () => <div data-testid="visibility-approval">Approval Section</div>
}))

vi.mock('../components/parent/DependentSettingsModal', () => ({
  default: ({ isOpen, child, isDependent, onActAs }) => isOpen ? (
    <div data-testid="dependent-settings" data-is-dependent={String(isDependent)}>
      <span data-testid="settings-child">{child?.id || child?.student_id || 'none'}</span>
      <button data-testid="act-as" onClick={() => onActAs(child)}>Act as</button>
    </div>
  ) : null
}))

vi.mock('../components/parent/FamilySettingsModal', () => ({
  default: ({ isOpen, initialTab }) => isOpen ? (
    <div data-testid="family-settings" data-initial-tab={initialTab} />
  ) : null
}))

vi.mock('../components/parent/ChildOverviewContent', () => ({
  default: ({ studentId, isDependent, dependentName, onEditClick }) => (
    <div
      data-testid="child-overview"
      data-is-dependent={String(isDependent)}
      data-dependent-name={dependentName || ''}
    >
      Overview for {studentId}
      <button data-testid="overview-edit" onClick={onEditClick}>Edit</button>
    </div>
  )
}))

vi.mock('../components/parent/ParentMomentCaptureButton', () => ({
  default: () => null
}))

vi.mock('@heroicons/react/24/outline', () => ({
  ExclamationTriangleIcon: (props) => <svg data-testid="warning-icon" {...props} />,
  UserIcon: (props) => <svg data-testid="user-icon" {...props} />,
  PlusIcon: (props) => <svg data-testid="plus-icon" {...props} />,
  Cog6ToothIcon: (props) => <svg data-testid="cog-icon" {...props} />,
  UserGroupIcon: (props) => <svg data-testid="group-icon" {...props} />,
  NewspaperIcon: (props) => <svg data-testid="newspaper-icon" {...props} />,
  RocketLaunchIcon: (props) => <svg data-testid="rocket-icon" {...props} />,
  ChevronDownIcon: (props) => <svg data-testid="chevron-down-icon" {...props} />,
  // Used by ChildPrivacyCard, which the dashboard renders for the selected child.
  GlobeAltIcon: (props) => <svg data-testid="globe-icon" {...props} />,
  LockClosedIcon: (props) => <svg data-testid="lock-icon" {...props} />,
  LinkIcon: (props) => <svg data-testid="link-icon" {...props} />
}))

import { parentAPI } from '../services/api'
import { getMyDependents } from '../services/dependentAPI'

function renderParentDashboard(entry = '/parent/dashboard') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/parent/dashboard" element={<ParentDashboardPage />} />
        <Route path="/dashboard" element={<div>Student Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ParentDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = {
      user: { id: 'parent-1', role: 'parent', has_dependents: true },
      refreshUser: vi.fn()
    }
    actingAsState = {
      actingAsDependent: null,
      setActingAs: vi.fn(),
      clearActingAs: vi.fn()
    }

    parentAPI.getMyChildren.mockResolvedValue({ data: { children: [] } })
    getMyDependents.mockResolvedValue({ dependents: [] })
  })

  // --- Access control ---
  describe('access control', () => {
    it('shows Parent Access Only for non-parent users', () => {
      authState = { user: { id: 'user-1', role: 'student' }, refreshUser: vi.fn() }
      renderParentDashboard()
      expect(screen.getByText('Parent Access Only')).toBeInTheDocument()
    })

    it('shows acting-as message when managing dependent', () => {
      actingAsState = {
        actingAsDependent: { id: 'dep-1', display_name: 'Junior' },
        setActingAs: vi.fn(),
        clearActingAs: vi.fn()
      }
      renderParentDashboard()
      expect(screen.getByText(/Acting as Junior/)).toBeInTheDocument()
    })

    it('shows Switch Back button when acting as dependent', () => {
      actingAsState = {
        actingAsDependent: { id: 'dep-1', display_name: 'Junior' },
        setActingAs: vi.fn(),
        clearActingAs: vi.fn()
      }
      renderParentDashboard()
      expect(screen.getByText('Switch Back to Parent View')).toBeInTheDocument()
    })
  })

  // --- Empty state ---
  describe('empty state', () => {
    it('shows welcome message when no children', async () => {
      parentAPI.getMyChildren.mockResolvedValue({ data: { children: [] } })
      getMyDependents.mockResolvedValue({ dependents: [] })

      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByText('Welcome to Your Family Dashboard')).toBeInTheDocument()
      })
    })

    // One "Add Your Child" door replaced the old under-13 / 13+ pair: a parent
    // shouldn't have to classify their own child before adding them, and the
    // 13+ half used to depend on the teen registering themselves.
    it('shows a single Add Your Child option', async () => {
      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByText(/Add Your Child/)).toBeInTheDocument()
      })
    })

    it('no longer splits the choice by age up front', async () => {
      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByText(/Add Your Child/)).toBeInTheDocument()
      })
      expect(screen.queryByText(/Create Child Profile \(Under 13\)/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Connect to Existing Student/)).not.toBeInTheDocument()
    })
  })

  // --- With children ---
  describe('with children', () => {
    beforeEach(() => {
      parentAPI.getMyChildren.mockResolvedValue({
        data: {
          children: [
            { student_id: 'child-1', student_first_name: 'Emma', student_last_name: 'Smith' },
            { student_id: 'child-2', student_first_name: 'Noah', student_last_name: 'Smith' }
          ]
        }
      })
      getMyDependents.mockResolvedValue({ dependents: [] })
    })

    it('renders Family Dashboard heading', async () => {
      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByText('Family Dashboard')).toBeInTheDocument()
      })
    })

    it('shows child tabs when multiple children', async () => {
      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getAllByText(/Emma Smith/).length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText(/Noah Smith/).length).toBeGreaterThanOrEqual(1)
      })
    })

    it('renders child overview content', async () => {
      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByTestId('child-overview')).toBeInTheDocument()
      })
    })

    it('does not render an Activity Feed button (removed)', async () => {
      renderParentDashboard()
      await waitFor(() => {
        expect(screen.queryByText('Activity Feed')).not.toBeInTheDocument()
      })
    })

    it('renders Family Settings button', async () => {
      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByText('Family Settings')).toBeInTheDocument()
      })
    })

    it('renders visibility approval section', async () => {
      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByTestId('visibility-approval')).toBeInTheDocument()
      })
    })
  })

  // --- With dependents ---
  describe('with dependents', () => {
    it('shows dependent tabs', async () => {
      parentAPI.getMyChildren.mockResolvedValue({ data: { children: [] } })
      getMyDependents.mockResolvedValue({
        dependents: [
          { id: 'dep-1', display_name: 'Little Timmy' }
        ]
      })

      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByTestId('child-overview')).toBeInTheDocument()
      })
    })
  })

  // --- Error state ---
  describe('error state', () => {
    it('shows empty state on fetch failure', async () => {
      parentAPI.getMyChildren.mockRejectedValue(new Error('Network error'))

      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByText('Welcome to Your Family Dashboard')).toBeInTheDocument()
      })
    })
  })

  // ── The two lists are one family ──────────────────────────────────────────
  //
  // get_parent_dependents (the my-dependents RPC) returns the UNION of true
  // under-13 dependents AND approved parent_student_links, so every linked
  // student comes back in BOTH responses. The page renders `children` and
  // `dependents` as two tab lists, so without the overlap removed a linked kid
  // gets two entries with the same name -- and the second one claims they are
  // a managed dependent, which changes what the overview shows.
  describe('a linked student who is in both responses', () => {
    beforeEach(() => {
      parentAPI.getMyChildren.mockResolvedValue({
        data: {
          children: [
            { student_id: 'teen-1', student_first_name: 'Iris', student_last_name: 'Vance' }
          ]
        }
      })
      getMyDependents.mockResolvedValue({
        dependents: [
          // the same teenager, arriving again through the union
          { id: 'teen-1', first_name: 'Iris', last_name: 'Vance' },
          { id: 'dep-9', first_name: 'Milo', last_name: 'Vance' }
        ]
      })
    })

    it('lists each child exactly once', async () => {
      renderParentDashboard()
      await waitFor(() => expect(screen.getByTestId('child-overview')).toBeInTheDocument())
      // Two people in this family, so one option each -- not three options.
      expect(screen.getAllByRole('option', { name: /Iris Vance/ })).toHaveLength(1)
      expect(screen.getAllByRole('option', { name: /Milo Vance/ })).toHaveLength(1)
    })

    it('keeps the teenager on the linked-student side, not the dependent side', async () => {
      // Linked students have their own accounts; managed dependents do not.
      // The overview renders differently for each.
      renderParentDashboard()
      const overview = await screen.findByTestId('child-overview')
      await waitFor(() => expect(overview).toHaveTextContent('Overview for teen-1'))
      expect(overview).toHaveAttribute('data-is-dependent', 'false')
    })

    it('still marks a genuine under-13 dependent as one', async () => {
      renderParentDashboard()
      await waitFor(() => expect(screen.getByTestId('child-overview')).toBeInTheDocument())

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dep-9' } })

      await waitFor(() => {
        const overview = screen.getByTestId('child-overview')
        expect(overview).toHaveAttribute('data-is-dependent', 'true')
        expect(overview).toHaveAttribute('data-dependent-name', 'Milo Vance')
      })
    })
  })

  // ── The student selector ──────────────────────────────────────────────────
  describe('the student selector', () => {
    it('is not shown to a family with one child', async () => {
      parentAPI.getMyChildren.mockResolvedValue({
        data: { children: [{ student_id: 'c-1', student_first_name: 'Solo', student_last_name: 'Kid' }] }
      })
      getMyDependents.mockResolvedValue({ dependents: [] })

      renderParentDashboard()
      await waitFor(() => expect(screen.getByTestId('child-overview')).toBeInTheDocument())
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    })

    it('is shown when a family has one of each kind', async () => {
      parentAPI.getMyChildren.mockResolvedValue({
        data: { children: [{ student_id: 'c-1', student_first_name: 'Iris', student_last_name: 'Vance' }] }
      })
      getMyDependents.mockResolvedValue({ dependents: [{ id: 'd-1', first_name: 'Milo', last_name: 'Vance' }] })

      renderParentDashboard()
      await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    })

    it('marks a linked student under 13, and leaves an older one unmarked', async () => {
      const yearsAgo = (n) => {
        const d = new Date()
        d.setFullYear(d.getFullYear() - n)
        return d.toISOString().slice(0, 10)
      }
      parentAPI.getMyChildren.mockResolvedValue({
        data: {
          children: [
            { student_id: 'c-1', student_first_name: 'Iris', student_last_name: 'Vance', date_of_birth: yearsAgo(15) },
            { student_id: 'c-2', student_first_name: 'Milo', student_last_name: 'Vance', date_of_birth: yearsAgo(9) }
          ]
        }
      })
      getMyDependents.mockResolvedValue({ dependents: [] })

      renderParentDashboard()
      await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())

      expect(screen.getByRole('option', { name: 'Milo Vance (Under 13)' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Iris Vance' })).toBeInTheDocument()
    })
  })

  // ── Family Settings opened from a link ────────────────────────────────────
  //
  // The account menu links here with ?settings=you, because a parent has no
  // /overview of their own to change their name on. The param must be consumed
  // once: leaving it in the URL reopens the modal on every refresh and on the
  // back button, which reads as a modal that will not close.
  describe('?settings= opens Family Settings once', () => {
    beforeEach(() => {
      parentAPI.getMyChildren.mockResolvedValue({
        data: { children: [{ student_id: 'c-1', student_first_name: 'Iris', student_last_name: 'Vance' }] }
      })
      getMyDependents.mockResolvedValue({ dependents: [] })
    })

    it('opens on the tab the link named', async () => {
      renderParentDashboard('/parent/dashboard?settings=you')
      const modal = await screen.findByTestId('family-settings')
      expect(modal).toHaveAttribute('data-initial-tab', 'you')
    })

    it('opens on the children tab from the header button', async () => {
      renderParentDashboard()
      fireEvent.click(await screen.findByText('Family Settings'))
      expect(await screen.findByTestId('family-settings'))
        .toHaveAttribute('data-initial-tab', 'children')
    })

    it('stays closed with no param and no click', async () => {
      renderParentDashboard()
      await waitFor(() => expect(screen.getByTestId('child-overview')).toBeInTheDocument())
      expect(screen.queryByTestId('family-settings')).not.toBeInTheDocument()
    })
  })

  // ── Who may open this page ────────────────────────────────────────────────
  describe('who may open this page', () => {
    it('sends a dependent to their own dashboard instead', () => {
      // A dependent logging in must never land on the family dashboard: it
      // manages the accounts of everyone in the family, including theirs.
      authState = {
        user: { id: 'dep-1', role: 'student', is_dependent: true },
        refreshUser: vi.fn()
      }
      renderParentDashboard()
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
      expect(screen.queryByText('Family Dashboard')).not.toBeInTheDocument()
      expect(screen.queryByText('Parent Access Only')).not.toBeInTheDocument()
    })

    it('lets an org admin who is also a parent in', async () => {
      // Org staff are frequently parents at their own school. Their platform
      // role is org_managed, so the parent test has to look at org_role too.
      authState = {
        user: { id: 'u-1', role: 'org_managed', org_role: 'parent', organization_id: 'org-1' },
        refreshUser: vi.fn()
      }
      parentAPI.getMyChildren.mockResolvedValue({
        data: { children: [{ student_id: 'c-1', student_first_name: 'Iris', student_last_name: 'Vance' }] }
      })
      renderParentDashboard()
      await waitFor(() => expect(screen.getByText('Family Dashboard')).toBeInTheDocument())
    })

    it('lets a superadmin in', async () => {
      authState = { user: { id: 'u-1', role: 'superadmin' }, refreshUser: vi.fn() }
      renderParentDashboard()
      await waitFor(() => {
        expect(screen.getByText('Welcome to Your Family Dashboard')).toBeInTheDocument()
      })
    })

    it('lets someone in on relationships alone, with no parent role', async () => {
      // A user linked to a student but carrying a different role still has a
      // family to manage.
      authState = {
        user: { id: 'u-1', role: 'observer', has_linked_students: true },
        refreshUser: vi.fn()
      }
      parentAPI.getMyChildren.mockResolvedValue({
        data: { children: [{ student_id: 'c-1', student_first_name: 'Iris', student_last_name: 'Vance' }] }
      })
      renderParentDashboard()
      await waitFor(() => expect(screen.getByText('Family Dashboard')).toBeInTheDocument())
    })
  })

  // ── Switching into a child's account ──────────────────────────────────────
  describe('acting as a child', () => {
    beforeEach(() => {
      parentAPI.getMyChildren.mockResolvedValue({ data: { children: [] } })
      getMyDependents.mockResolvedValue({
        dependents: [{ id: 'dep-1', first_name: 'Milo', last_name: 'Vance' }]
      })
    })

    it('switches, says whose account it is, and goes to their dashboard', async () => {
      renderParentDashboard()
      await waitFor(() => expect(screen.getByTestId('child-overview')).toBeInTheDocument())

      fireEvent.click(screen.getByTestId('overview-edit'))
      fireEvent.click(await screen.findByTestId('act-as'))

      await waitFor(() => {
        expect(actingAsState.setActingAs).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'dep-1' })
        )
      })
      expect(toast.success).toHaveBeenCalledWith("Now managing Milo Vance's account")
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
    })

    it('stays put and says so when the switch fails', async () => {
      // Navigating anyway would leave the parent on the child's dashboard as
      // themselves -- the worst of both, and silent.
      actingAsState.setActingAs = vi.fn().mockRejectedValue(new Error('nope'))
      renderParentDashboard()
      await waitFor(() => expect(screen.getByTestId('child-overview')).toBeInTheDocument())

      fireEvent.click(screen.getByTestId('overview-edit'))
      fireEvent.click(await screen.findByTestId('act-as'))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to switch profiles. Please try again.')
      })
      expect(mockNavigate).not.toHaveBeenCalledWith('/dashboard', { replace: true })
    })
  })

  // ── Adding a child ────────────────────────────────────────────────────────
  describe('after a child is added', () => {
    it('refreshes the user so the sidebar gains the Family link', async () => {
      // has_dependents lives on the AuthContext user and gates the sidebar
      // item. Without the refresh the parent has a child and no visible way
      // back to this page until they log in again.
      parentAPI.getMyChildren.mockResolvedValue({ data: { children: [] } })
      getMyDependents.mockResolvedValue({ dependents: [] })
      authState = {
        user: { id: 'p-1', role: 'parent' },
        refreshUser: vi.fn().mockResolvedValue(undefined)
      }

      renderParentDashboard()
      fireEvent.click(await screen.findByRole('button', { name: /Add Your Child/ }))
      await waitFor(() => expect(screen.getByTestId('add-child-modal')).toBeInTheDocument())

      parentAPI.getMyChildren.mockResolvedValue({
        data: { children: [{ student_id: 'new-1', student_first_name: 'Nell', student_last_name: 'Vance' }] }
      })
      fireEvent.click(screen.getByTestId('add-child-succeed'))

      await waitFor(() => expect(authState.refreshUser).toHaveBeenCalled())
      expect(toast.success).toHaveBeenCalledWith('Nell added')
    })

    it('lands the parent on the child they just added', async () => {
      parentAPI.getMyChildren.mockResolvedValue({ data: { children: [] } })
      getMyDependents.mockResolvedValue({ dependents: [] })
      authState = {
        user: { id: 'p-1', role: 'parent' },
        refreshUser: vi.fn().mockResolvedValue(undefined)
      }

      renderParentDashboard()
      fireEvent.click(await screen.findByRole('button', { name: /Add Your Child/ }))
      await waitFor(() => expect(screen.getByTestId('add-child-modal')).toBeInTheDocument())

      parentAPI.getMyChildren.mockResolvedValue({
        data: { children: [{ student_id: 'new-1', student_first_name: 'Nell', student_last_name: 'Vance' }] }
      })
      fireEvent.click(screen.getByTestId('add-child-succeed'))

      const overview = await screen.findByTestId('child-overview')
      expect(overview).toHaveTextContent('Overview for new-1')
    })
  })
})
