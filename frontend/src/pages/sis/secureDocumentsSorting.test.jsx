import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

/**
 * Ordering the document store.
 *
 * iCreate, 2026-09-05: "in task center-documents. I wish that there was some
 * sort of organization in there to make it easier to find. I need to go check
 * each person's i9 and w4 forms and transfer info from there into the new
 * payroll system. If submissions were organized by type or person, that would
 * help a lot."
 *
 * The store only ever came back newest-first, which is the right order for
 * what just arrived and the wrong one for working THROUGH sixty staff members'
 * paperwork one person at a time.
 */

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import SecureDocumentsPage from './SecureDocumentsPage'

// Deliberately not in any of the orders under test: newest is Baker's W-4,
// first alphabetically by person is Adams, by type is Background check.
const DOCS = [
  {
    id: 'd1', title: 'Zeta handbook', filename: 'zeta.pdf', category: 'Handbook',
    owner_user_id: 's1', owner_name: 'Carter, Nina', created_at: '2026-08-02T00:00:00Z',
  },
  {
    id: 'd2', title: 'Adams I-9', filename: 'i9.pdf', category: 'Tax',
    owner_user_id: 's2', owner_name: 'Adams, Ray', created_at: '2026-08-01T00:00:00Z',
  },
  {
    id: 'd3', title: 'Baker W-4', filename: 'w4.pdf', category: 'Background check',
    owner_user_id: 's3', owner_name: 'Baker, Sue', created_at: '2026-08-09T00:00:00Z',
  },
]

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  vi.clearAllMocks()
  api.get.mockImplementation((url) => (
    url.includes('/roster')
      ? Promise.resolve({ data: { roster: [] } })
      : Promise.resolve({ data: { documents: DOCS } })
  ))
})

const show = async () => {
  render(<SecureDocumentsPage />)
  await screen.findByText('Baker W-4')
}

/** The document names down the table's first column, in the order rendered. */
const namesInOrder = () => {
  const rows = screen.getAllByRole('row').slice(1) // drop the header row
  return rows.map((r) => within(r).getAllByRole('cell')[1].textContent)
}

const sortSelect = () => screen.getByLabelText('Sort documents')

describe('ordering the document store', () => {
  it('defaults to newest first, which is what just arrived', async () => {
    await show()
    expect(namesInOrder()[0]).toContain('Baker W-4')
  })

  it('sorts by the person a document is about', async () => {
    await show()
    fireEvent.change(sortSelect(), { target: { value: 'person' } })
    const order = namesInOrder()
    expect(order[0]).toContain('Adams I-9')
    expect(order[1]).toContain('Baker W-4')
    expect(order[2]).toContain('Zeta handbook')
  })

  it('sorts by type, which has no column of its own', async () => {
    await show()
    fireEvent.change(sortSelect(), { target: { value: 'type' } })
    const order = namesInOrder()
    expect(order[0]).toContain('Baker W-4') // Background check
    expect(order[1]).toContain('Zeta handbook') // Handbook
    expect(order[2]).toContain('Adams I-9') // Tax
  })

  it('sorts by document name', async () => {
    await show()
    fireEvent.change(sortSelect(), { target: { value: 'name' } })
    expect(namesInOrder()[0]).toContain('Adams I-9')
  })

  it('reverses the order when the same column is picked again', async () => {
    await show()
    fireEvent.click(screen.getByLabelText('Sort by person'))
    expect(namesInOrder()[0]).toContain('Adams I-9')
    fireEvent.click(screen.getByLabelText('Sort by person'))
    expect(namesInOrder()[0]).toContain('Zeta handbook')
  })

  it('opens a fresh column the way that column is read', async () => {
    // Names and people from A, dates newest-first — regardless of which way the
    // column before it was running. Otherwise reversing Person and then picking
    // Date would hand back the oldest document in the store.
    await show()
    fireEvent.click(screen.getByLabelText('Sort by person')) // A-Z
    fireEvent.click(screen.getByLabelText('Sort by person')) // reversed, Z-A
    fireEvent.click(screen.getByLabelText('Sort by name'))
    expect(namesInOrder()[0]).toContain('Adams I-9')
    fireEvent.click(screen.getByLabelText('Sort by date'))
    expect(namesInOrder()[0]).toContain('Baker W-4')
  })

  it('keeps the filter working alongside the sort', async () => {
    await show()
    fireEvent.change(sortSelect(), { target: { value: 'person' } })
    fireEvent.change(screen.getByPlaceholderText('Filter documents…'), {
      target: { value: 'baker' },
    })
    expect(namesInOrder()).toHaveLength(1)
    expect(namesInOrder()[0]).toContain('Baker W-4')
  })

  it('puts documents with nothing in the sorted column last', async () => {
    // A document with no category is not the first thing you want when you
    // asked for categories.
    api.get.mockImplementation((url) => (
      url.includes('/roster')
        ? Promise.resolve({ data: { roster: [] } })
        : Promise.resolve({
          data: {
            documents: [
              { id: 'x', title: 'Uncategorised', filename: 'x.pdf', category: null, created_at: '2026-08-20T00:00:00Z' },
              ...DOCS,
            ],
          },
        })
    ))
    await show()
    fireEvent.change(sortSelect(), { target: { value: 'type' } })
    expect(namesInOrder().at(-1)).toContain('Uncategorised')
  })
})
