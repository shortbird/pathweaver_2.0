import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, renderHook, act, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DocumentsPanel from './libraryPage/DocumentsPanel'
import useResourceOrder from '../../hooks/useResourceOrder'

/**
 * The admin arranges the document library.
 *
 * iCreate 07b646fa: "It'd be nice if I could rearrange the resources to put
 * them in a certain order (like move them up or down.)" and 48531900: "I just
 * realized the docs are alphabetical! I would still like to sort if possible."
 *
 * Up/down arrows move a document inside its category and save the WHOLE list
 * through PUT /api/sis/resources/order, so a library that was never arranged
 * (every sort_order 0) is numbered in full by the first move and cannot tie.
 * Teachers read the library but do not arrange it.
 */

let authState = { user: { id: 'u1', role: 'org_managed', org_roles: ['org_admin'] } }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../components/evidence/preview/DocumentPreview', () => ({
  default: () => null,
  isPreviewableDocument: () => false,
}))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: { success: true } })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))


// As the server sends them: sort_order (all 0 here), then title.
const RESOURCES = [
  { id: 'a', title: 'Alpha form', url: 'https://x.test/a', category: 'Forms', sort_order: 0 },
  { id: 'b', title: 'Bravo form', url: 'https://x.test/b', category: 'Forms', sort_order: 0 },
  { id: 'c', title: 'Charlie form', url: 'https://x.test/c', category: 'Forms', sort_order: 0 },
  { id: 'h', title: 'Handbook', url: 'https://x.test/h', category: 'Handbook', sort_order: 0 },
]

const formTitles = () => screen.getAllByText(/ form$/).map((el) => el.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  authState = { user: { id: 'u1', role: 'org_managed', org_roles: ['org_admin'] } }
  api.get.mockImplementation((url) => (
    url.includes('/resources')
      ? Promise.resolve({ data: { resources: RESOURCES } })
      : Promise.resolve({ data: {} })
  ))
})

const renderPanel = () => render(<MemoryRouter><DocumentsPanel /></MemoryRouter>)

describe('arranging the document library (iCreate 07b646fa, 48531900)', () => {
  it('moves a document down and saves the whole list in its new order', async () => {
    renderPanel()
    await screen.findByText('Alpha form')
    fireEvent.click(screen.getByRole('button', { name: 'Move Alpha form down' }))

    expect(formTitles()).toEqual(['Bravo form', 'Alpha form', 'Charlie form'])
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    const [url, body] = api.put.mock.calls[0]
    expect(url).toBe('/api/sis/resources/order?organization_id=org-1')
    // Every row, numbered, so nothing still ties at 0.
    expect(body).toEqual({ ids: ['b', 'a', 'c', 'h'] })
  })

  it('moves a document up and keeps other categories in place', async () => {
    renderPanel()
    await screen.findByText('Charlie form')
    fireEvent.click(screen.getByRole('button', { name: 'Move Charlie form up' }))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(api.put.mock.calls[0][1]).toEqual({ ids: ['a', 'c', 'b', 'h'] })
  })

  it('disables up on the first row and down on the last row of a category', async () => {
    renderPanel()
    await screen.findByText('Alpha form')
    expect(screen.getByRole('button', { name: 'Move Alpha form up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Charlie form down' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Handbook up' })).toBeDisabled()
  })

  it('shows no arrows to a teacher', async () => {
    authState = { user: { id: 't1', role: 'org_managed', org_roles: ['advisor'] } }
    renderPanel()
    await screen.findByText('Alpha form')
    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })
})

describe('useResourceOrder keeps a move until the library really reloads', () => {
  // The release of 2026-10-05 failed in CI on 'moves a document down...':
  // the override was cleared by an effect on `resources`, and React flushed
  // the effect from the first load AFTER the admin's click, so the move
  // vanished and the list read alphabetical again. The override now belongs
  // to the array it was made from.
  it('keeps the move across re-renders with the same list, and drops it for a new one', async () => {
    const { result, rerender } = renderHook(
      ({ resources }) => useResourceOrder({ resources, orgId: 'org-1', reload: vi.fn() }),
      { initialProps: { resources: RESOURCES } },
    )
    await act(async () => { result.current.move(RESOURCES[0], 1) })
    expect(result.current.ordered.map((r) => r.id)).toEqual(['b', 'a', 'c', 'h'])

    rerender({ resources: RESOURCES })
    expect(result.current.ordered.map((r) => r.id)).toEqual(['b', 'a', 'c', 'h'])

    const reloaded = [RESOURCES[1], RESOURCES[0], RESOURCES[2], RESOURCES[3]]
    rerender({ resources: reloaded })
    expect(result.current.ordered).toBe(reloaded)
  })
})
