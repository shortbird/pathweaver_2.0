/**
 * The office's side of "sign your contract".
 *
 * iCreate, 2026-08-12: a teacher signed the contract item before any contract
 * had been uploaded. The office now attaches each person's document on the
 * Staff progress list — signing stays locked until it (or a link on the item)
 * exists — and can void a signature that was recorded against nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'molly', role: 'org_managed', org_roles: ['org_admin'] } }),
}))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', async () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: () => {}, orgs: [], isSuperadmin: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('./teacherPreview', () => ({
  getPreviewTeacher: () => null,
  withPreview: (url) => url,
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import OnboardingPage from './OnboardingPage'

const item = (over = {}) => ({
  key: 'contract', title: 'Review & Sign Your Contract', required: true,
  needs_signature: true, needs_document: false, needs_approval: false,
  status: 'pending', link: null, admin_document_url: null, signature: null,
  ...over,
})

const assignment = (items, over = {}) => ({
  id: 'a1', user_id: 'erik', user_name: 'Erik Pearson', audience: 'staff',
  template_name: 'Employee onboarding', status: 'in_progress',
  done_count: 0, total_count: items.length, items, ...over,
})

const mockAdmin = (assignments) => {
  api.get.mockImplementation((url) => {
    if (url.includes('/staff-admin/onboarding/templates')) return Promise.resolve({ data: { templates: [] } })
    if (url.includes('/staff-admin/onboarding/assignments')) return Promise.resolve({ data: { assignments } })
    if (url.includes('/teacher/onboarding')) return Promise.resolve({ data: { assignments: [] } })
    return Promise.resolve({ data: {} })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  api.post.mockResolvedValue({ data: { success: true } })
  api.patch.mockResolvedValue({ data: { success: true } })
})
afterEach(() => vi.restoreAllMocks())

describe('attaching the document to be signed', () => {
  it('offers Attach document on signature items, and only there', async () => {
    mockAdmin([assignment([item(), item({ key: 'w4', title: 'Upload your W4', needs_signature: false })])])
    render(<OnboardingPage />)
    expect(await screen.findByText('Attach document')).toBeInTheDocument()
    expect(screen.getAllByText('Attach document')).toHaveLength(1)
  })

  it('sends the chosen file to the item and refreshes', async () => {
    mockAdmin([assignment([item()])])
    render(<OnboardingPage />)
    await screen.findByText('Attach document')
    const input = screen.getByText('Attach document').querySelector('input[type="file"]')
    fireEvent.change(input, { target: { files: [new File(['pdf'], 'contract.pdf', { type: 'application/pdf' })] } })

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/staff-admin/onboarding/assignments/a1/items/contract/document?organization_id=org-1',
      expect.any(FormData),
    ))
  })

  it('shows Replace and View once a document is attached', async () => {
    mockAdmin([assignment([item({ admin_document_url: 'org-1/erik/abc.pdf' })])])
    render(<OnboardingPage />)
    expect(await screen.findByText('Replace document')).toBeInTheDocument()
    expect(screen.getByText('View document')).toBeInTheDocument()
  })
})

describe('voiding a signature recorded against nothing', () => {
  const signed = () => item({
    status: 'complete',
    signature: { name: 'Karl Erik Pearson', signed_at: '2026-08-11T04:12:20Z' },
  })

  it('shows who signed and offers to void', async () => {
    mockAdmin([assignment([signed()])])
    render(<OnboardingPage />)
    expect(await screen.findByText(/signed by Karl Erik Pearson/)).toBeInTheDocument()
    expect(screen.getByText('Void signature')).toBeInTheDocument()
  })

  it('asks first, then clears the signature', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockAdmin([assignment([signed()])])
    render(<OnboardingPage />)
    fireEvent.click(await screen.findByText('Void signature'))

    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/teacher/onboarding/a1/items/contract',
      expect.objectContaining({ void_signature: true }),
    ))
  })

  it('does nothing when the office backs out', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    mockAdmin([assignment([signed()])])
    render(<OnboardingPage />)
    fireEvent.click(await screen.findByText('Void signature'))
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('an unsigned signature item offers no void', async () => {
    mockAdmin([assignment([item()])])
    render(<OnboardingPage />)
    await screen.findByText('Attach document')
    expect(screen.queryByText('Void signature')).not.toBeInTheDocument()
  })
})
