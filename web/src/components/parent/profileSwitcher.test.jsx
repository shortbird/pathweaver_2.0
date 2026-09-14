/**
 * The family scope switcher (components/parent/ProfileSwitcher).
 *
 * Picking a child enters family scope and lands on the child's dashboard.
 * "Just me" exists only for hybrid accounts (staff who are also parents); a
 * pure parent has no own pages to switch back to and goes to /family.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

let authState = { effectiveRole: 'parent' }
let scopeState = {}
const navigate = vi.fn()

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/FamilyScopeContext', () => ({ useFamilyScope: () => scopeState }))
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))

import ProfileSwitcher from './ProfileSwitcher'

const KIDS = [
  { id: 'kid-1', name: 'Romney Hanna', firstName: 'Romney', avatarUrl: null },
  { id: 'kid-2', name: 'Hope Hanna', firstName: 'Hope', avatarUrl: null },
]

beforeEach(() => {
  vi.clearAllMocks()
  authState = { effectiveRole: 'parent' }
  scopeState = {
    hasFamily: true, isLoading: false, children: KIDS,
    selectedChild: null, isScoped: false, enterScope: vi.fn(), exitScope: vi.fn(),
  }
})

describe('ProfileSwitcher', () => {
  it('renders nothing for an account with no family', () => {
    scopeState = { ...scopeState, hasFamily: false, children: [] }
    const { container } = render(<ProfileSwitcher />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists the children and enters scope on pick', () => {
    render(<ProfileSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose a child' }))
    fireEvent.click(screen.getByRole('option', { name: 'Hope Hanna' }))
    expect(scopeState.enterScope).toHaveBeenCalledWith('kid-2')
    expect(navigate).toHaveBeenCalledWith('/dashboard')
  })

  it('offers no "Just me" to a pure parent', () => {
    render(<ProfileSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose a child' }))
    expect(screen.queryByRole('option', { name: 'Just me' })).not.toBeInTheDocument()
  })

  it('offers "Just me" to a hybrid account and leaves scope to their own home', () => {
    authState = { effectiveRole: 'org_admin' }
    scopeState = { ...scopeState, selectedChild: KIDS[0], isScoped: true }
    render(<ProfileSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: 'Working as Romney Hanna' }))
    fireEvent.click(screen.getByRole('option', { name: 'Just me' }))
    expect(scopeState.exitScope).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/dashboard')
  })

  it('is static for a parent of one child already in scope', () => {
    scopeState = { ...scopeState, children: [KIDS[0]], selectedChild: KIDS[0], isScoped: true }
    render(<ProfileSwitcher />)
    const button = screen.getByRole('button', { name: 'Working as Romney Hanna' })
    fireEvent.click(button)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
