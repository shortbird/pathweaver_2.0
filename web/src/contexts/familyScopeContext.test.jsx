/**
 * Family scope: which child a parent is working FOR (contexts/FamilyScopeContext).
 *
 * The rules that matter, because each one was a bug in the act-as flow this
 * replaced:
 *  - scope is entered only by the user, never auto-selected, so a hybrid
 *    account (an admin who is also a parent) keeps its own pages;
 *  - the selection survives a reload, per parent, and only while the child
 *    is still in the family;
 *  - changing scope invalidates every "whose rows" query, so nothing from the
 *    previous child survives the switch (act-as hid this behind a reload).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let authState = {}
let childrenState = { data: [], isLoading: false }

vi.mock('./AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../hooks/api/useFamilyChildren', () => ({
  useFamilyChildren: () => childrenState,
}))

import { FamilyScopeProvider, useFamilyScope, userHasFamily } from './FamilyScopeContext'

let latest
function Probe() {
  latest = useFamilyScope()
  return <div data-testid="scoped">{latest.selectedChildId || 'none'}</div>
}

function renderScope(client = new QueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <FamilyScopeProvider><Probe /></FamilyScopeProvider>
    </QueryClientProvider>
  )
}

const KIDS = [
  { id: 'kid-1', name: 'Romney Hanna', firstName: 'Romney', isDependent: false },
  { id: 'kid-2', name: 'Hope Hanna', firstName: 'Hope', isDependent: true },
]

beforeEach(() => {
  localStorage.clear()
  authState = { user: { id: 'parent-1', role: 'parent' } }
  childrenState = { data: KIDS, isLoading: false }
})

describe('entering and leaving scope', () => {
  it('starts unscoped even with children, and enters only on request', () => {
    renderScope()
    expect(screen.getByTestId('scoped')).toHaveTextContent('none')
    expect(latest.isScoped).toBe(false)
    act(() => latest.enterScope('kid-1'))
    expect(screen.getByTestId('scoped')).toHaveTextContent('kid-1')
    expect(latest.selectedChild.firstName).toBe('Romney')
    act(() => latest.exitScope())
    expect(latest.isScoped).toBe(false)
  })

  it('remembers the child per parent across a reload', () => {
    const first = renderScope()
    act(() => latest.enterScope('kid-2'))
    first.unmount()
    renderScope()
    expect(screen.getByTestId('scoped')).toHaveTextContent('kid-2')
  })

  it('forgets a remembered child who is no longer in the family', () => {
    localStorage.setItem('optio.familyScope.parent-1', 'kid-gone')
    renderScope()
    expect(latest.isScoped).toBe(false)
    expect(localStorage.getItem('optio.familyScope.parent-1')).toBeNull()
  })

  it('never carries one parent\'s selection to another account', () => {
    localStorage.setItem('optio.familyScope.parent-1', 'kid-1')
    authState = { user: { id: 'parent-2', role: 'parent' } }
    renderScope()
    expect(latest.isScoped).toBe(false)
  })

  it('invalidates the scoped queries on every switch', () => {
    const client = new QueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    renderScope(client)
    act(() => latest.enterScope('kid-1'))
    const roots = spy.mock.calls.map(([k]) => (Array.isArray(k) ? k[0] : k?.queryKey?.[0]))
    expect(roots).toEqual(expect.arrayContaining(['user', 'quests', 'evidence', 'portfolio']))
  })
})

describe('who has a family', () => {
  it('is anyone with a parent role or parent relationships', () => {
    expect(userHasFamily({ role: 'parent' })).toBe(true)
    expect(userHasFamily({ role: 'org_managed', org_role: 'parent' })).toBe(true)
    expect(userHasFamily({ role: 'org_managed', org_roles: ['advisor', 'parent'] })).toBe(true)
    expect(userHasFamily({ role: 'org_managed', org_role: 'org_admin', has_linked_students: true })).toBe(true)
    expect(userHasFamily({ role: 'student' })).toBe(false)
    expect(userHasFamily(null)).toBe(false)
  })

  it('answers unscoped and familyless outside the provider', () => {
    function Bare() { latest = useFamilyScope(); return null }
    render(<Bare />)
    expect(latest.isScoped).toBe(false)
    expect(latest.hasFamily).toBe(false)
    expect(latest.children).toEqual([])
  })
})
