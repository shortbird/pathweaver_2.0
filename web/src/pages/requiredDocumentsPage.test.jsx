/**
 * The paperwork hold page is the family portal's checklist in a chrome-less
 * shell: the same ChecklistAssignments, the same PATCH, the same signature.
 * Until 2026-09-15 it carried its own copy of the list, and a family signing
 * here and a family signing on the portal went through two renderings of
 * one record.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, clearGate, navigate } = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
  clearGate: vi.fn(),
  navigate: vi.fn(),
}))
vi.mock('../services/api', () => ({ default: api }))
vi.mock('../hooks/useRequiredDocumentsGate', () => ({ clearRequiredDocumentsGate: clearGate }))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'p1', email: 'dana@example.com' }, logout: vi.fn(), isAuthenticated: true, loading: false }),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}))

import RequiredDocumentsPage from './RequiredDocumentsPage'

const STATEMENT = 'I am typing my own name below, and I intend it to count as my official signature.'
const ITEM = {
  key: 'media', title: 'Photo and media release', required: true,
  needs_signature: true, needs_document: false, status: 'pending', signature: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  api.patch.mockResolvedValue({ data: { success: true } })
  api.get.mockImplementation((url) => {
    if (url.includes('/required-documents')) {
      return Promise.resolve({ data: { blocked: true, organization_id: 'org-1', assignments: [{
        id: 'fa1', template_name: 'Back to school paperwork',
        done_count: 0, total_count: 1, signature_statement: STATEMENT, items: [ITEM],
      }] } })
    }
    return Promise.resolve({ data: {} })
  })
})

describe('the paperwork hold', () => {
  it('renders the outstanding checklist with the portal signature block', async () => {
    render(<RequiredDocumentsPage />)
    expect(await screen.findByText('Your school needs a signature')).toBeInTheDocument()
    expect(screen.getByText('Back to school paperwork')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Type your full name to sign')).toBeInTheDocument()
    expect(screen.getByText(STATEMENT)).toBeInTheDocument()
  })

  it('signs through the same parent endpoint the portal uses, then re-asks the gate', async () => {
    render(<RequiredDocumentsPage />)
    fireEvent.change(await screen.findByPlaceholderText('Type your full name to sign'), { target: { value: 'Dana Myers' } })
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp('official signature') }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/parent/onboarding/fa1/items/media',
      expect.objectContaining({ organization_id: 'org-1', signature_name: 'Dana Myers', signature_agreed: true }),
    ))
    await waitFor(() => expect(clearGate).toHaveBeenCalled())
    // Re-asked the server rather than deciding locally it was the last one.
    expect(api.get.mock.calls.filter(([u]) => u.includes('/required-documents')).length).toBeGreaterThan(1)
  })

  it('sends a family with nothing outstanding on their way', async () => {
    api.get.mockResolvedValue({ data: { blocked: false, assignments: [] } })
    render(<RequiredDocumentsPage />)
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true }))
    expect(clearGate).toHaveBeenCalled()
  })
})
