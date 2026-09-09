import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Previewing the teacher portal must still show WHAT a teacher can file.
 *
 * Preview is read-only, and it used to express that by wrapping the whole form
 * in <fieldset disabled> — which swallowed the form-type picker too. A disabled
 * <select> cannot be opened in any browser, so the sixteen form types collapsed
 * to whichever one sorted first, and an admin checking the teacher experience
 * came away believing one form existed (iCreate, 2026-08-20: "In the preview
 * mode I can't really see what forms are available").
 *
 * The picker is a read. Submit is the write. Only the write is disabled.
 */

const authState = { user: { id: 'admin-1', role: 'org_managed', org_roles: ['org_admin'] } }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('./teacherPreview', () => ({
  getPreviewTeacher: () => ({ id: 't-1', name: 'A Teacher' }),
  withPreview: (path, preview) => (preview?.id ? `${path}&teacher_id=${preview.id}` : path),
  setPreviewTeacher: vi.fn(),
  clearPreviewTeacher: vi.fn(),
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })), patch: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import StaffFormsPage from './StaffFormsPage'

const FORM_TYPES = {
  incident: 'Incident report',
  supply_request: 'Supply request',
  maintenance: 'Maintenance request',
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/api/sis/teacher/forms')) {
      return Promise.resolve({ data: { submissions: [], form_types: FORM_TYPES } })
    }
    return Promise.resolve({ data: {} })
  })
})

const renderPage = () => render(<MemoryRouter><StaffFormsPage /></MemoryRouter>)

describe('previewing the teacher portal', () => {
  it('leaves the form-type picker usable so every form is visible', async () => {
    renderPage()
    const picker = await screen.findByRole('combobox', { name: /Form type/i })
    expect(picker).not.toBeDisabled()
    // Not just openable — every type the teacher can file is really listed.
    expect(Object.values(FORM_TYPES).every(
      (label) => within(picker).queryByText(label) !== null)).toBe(true)
  })

  it('still refuses the write', async () => {
    renderPage()
    await screen.findByRole('combobox', { name: /Form type/i })
    expect(screen.getByRole('button', { name: /Submit/i })).toBeDisabled()
    expect(screen.getByPlaceholderText(/Short title/i)).toBeDisabled()
    expect(screen.getByPlaceholderText(/What happened/i)).toBeDisabled()
  })

  it('says so, rather than leaving the greyed-out form unexplained', async () => {
    renderPage()
    expect(await screen.findByText(/list of forms is still browsable/i)).toBeInTheDocument()
  })
})
