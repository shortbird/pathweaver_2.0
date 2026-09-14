import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FamilySettingsModal from './FamilySettingsModal'

/**
 * One settings modal for the family (2026-09-15): You, a tab per child,
 * Observers, Parents. A child's tab holds their profile, login (dependents
 * only), AI features and privacy in place -- no second modal, no Children
 * list, no separate Privacy tab.
 */

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'parent-1', first_name: 'Dana', last_name: 'Smith', email: 'dana@example.com' }, refreshUser: vi.fn() }),
}))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../services/api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: {} })), post: vi.fn(), put: vi.fn() },
  observerAPI: { getFamilyObservers: vi.fn(() => Promise.resolve({ data: { observers: [] } })) },
  parentAPI: { getFamilyParents: vi.fn(() => Promise.resolve({ data: { parents: [] } })) },
}))
vi.mock('../../services/dependentAPI', () => ({
  addDependentLogin: vi.fn(), toggleDependentAIAccess: vi.fn(), updateDependentAIFeatures: vi.fn(), updateChildName: vi.fn(),
}))
vi.mock('./ChildPrivacyCard', () => ({ default: ({ studentName }) => <div data-testid="privacy-card">Privacy for {studentName}</div> }))
vi.mock('framer-motion', () => ({ motion: { span: (p) => <span {...p} /> } }))

const FAMILY = [
  { id: 'emma', name: 'Emma Smith', firstName: 'Emma', avatarUrl: null, isDependent: false, dateOfBirth: null,
    raw: { student_id: 'emma', student_first_name: 'Emma', student_last_name: 'Smith', email: 'emma@example.com' } },
  { id: 'timmy', name: 'Timmy Smith', firstName: 'Timmy', avatarUrl: null, isDependent: true, dateOfBirth: '2018-05-01',
    raw: { id: 'timmy', first_name: 'Timmy', last_name: 'Smith', email: 'timmy@optio-internal-placeholder.local' } },
]

function renderModal(props = {}) {
  // The child tab's picture control is a react-query mutation.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <FamilySettingsModal isOpen onClose={vi.fn()} family={FAMILY} onAddChild={vi.fn()} onRefresh={vi.fn()} {...props} />
    </QueryClientProvider>
  )
}

describe('FamilySettingsModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('has one tab per child beside You, Observers and Parents -- and no Children or Privacy tab', () => {
    renderModal()
    const names = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(names).toEqual(['You', 'Emma', 'Timmy', 'Observers', 'Parents'])
  })

  it("a child's tab holds their profile, AI features and privacy in place", async () => {
    renderModal()
    await userEvent.click(screen.getByRole('tab', { name: 'Emma' }))
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.getByLabelText('First name')).toHaveValue('Emma')
    expect(screen.getByRole('heading', { name: 'AI features' })).toBeInTheDocument()
    expect(screen.getByText('Privacy for Emma')).toBeInTheDocument()
    // A linked student already has a login; only a managed profile gets the form.
    expect(screen.queryByRole('heading', { name: 'Login' })).not.toBeInTheDocument()
  })

  it('offers the login form only on a managed under-13 profile', async () => {
    renderModal()
    await userEvent.click(screen.getByRole('tab', { name: 'Timmy' }))
    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Login' })).toBeInTheDocument()
  })

  it("opens straight on a child's tab when asked to", () => {
    renderModal({ initialTab: 'timmy' })
    expect(screen.getByRole('tab', { name: 'Timmy' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('First name')).toHaveValue('Timmy')
  })

  it('keeps the add-child door beside the tabs', async () => {
    const onAddChild = vi.fn()
    renderModal({ onAddChild })
    await userEvent.click(screen.getByRole('button', { name: 'Add a child' }))
    expect(onAddChild).toHaveBeenCalled()
  })
})
