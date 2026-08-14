import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let mockUser = { id: 'admin1', role: 'superadmin', org_roles: [] }
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', async () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: () => {}, orgs: [], isSuperadmin: true }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import OnboardingPage from './OnboardingPage'

const sampleTemplate = {
  id: 'tmpl-1',
  name: 'Staff Onboarding',
  role_type: 'employee',
  audience: 'staff',
  items: [
    { key: 'item_1', title: 'First Item', description: 'Desc 1', required: true },
    { key: 'item_2', title: 'Second Item', description: 'Desc 2', required: true },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUser = { id: 'admin1', role: 'superadmin', org_roles: [] }
  api.get.mockImplementation((url) => {
    if (url.includes('/staff-admin/onboarding/templates')) {
      return Promise.resolve({ data: { templates: [sampleTemplate] } })
    }
    if (url.includes('/staff-admin/onboarding/assignments') || url.includes('/teacher/onboarding')) {
      return Promise.resolve({ data: { assignments: [] } })
    }
    return Promise.resolve({ data: {} })
  })
  api.post.mockResolvedValue({ data: { success: true } })
  api.put.mockResolvedValue({ data: { success: true } })
})

describe('Onboarding templates management', () => {
  it('renders template list with Duplicate button', async () => {
    render(<OnboardingPage />)
    expect(await screen.findByText('Staff Onboarding')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeInTheDocument()
  })

  it('allows duplicating a template', async () => {
    render(<OnboardingPage />)
    const duplicateBtn = await screen.findByRole('button', { name: 'Duplicate' })
    fireEvent.click(duplicateBtn)

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/sis/staff-admin/onboarding/templates',
        expect.objectContaining({
          organization_id: 'org-1',
          name: 'Staff Onboarding (Copy)',
          audience: 'staff',
          role_type: 'employee',
          items: expect.arrayContaining([
            expect.objectContaining({ title: 'First Item' }),
            expect.objectContaining({ title: 'Second Item' }),
          ]),
        })
      )
    })
  })

  it('allows moving sections up and down in template editor', async () => {
    render(<OnboardingPage />)
    const editBtn = await screen.findByRole('button', { name: 'Edit' })
    fireEvent.click(editBtn)

    // Verify template items are rendered
    const item1Input = screen.getByDisplayValue('First Item')
    const item2Input = screen.getByDisplayValue('Second Item')
    expect(item1Input).toBeInTheDocument()
    expect(item2Input).toBeInTheDocument()

    // Find up/down buttons
    const upButtons = screen.getAllByRole('button', { name: /Up/i })
    const downButtons = screen.getAllByRole('button', { name: /Down/i })

    // First item: Up should be disabled, Down enabled
    expect(upButtons[0]).toBeDisabled()
    expect(downButtons[0]).not.toBeDisabled()

    // Second item: Up should be enabled, Down disabled
    expect(upButtons[1]).not.toBeDisabled()
    expect(downButtons[1]).toBeDisabled()

    // Move first item down
    fireEvent.click(downButtons[0])

    // Now inputs should be swapped in order
    const inputsAfterMove = screen.getAllByPlaceholderText(/Item \d+ title/)
    expect(inputsAfterMove[0]).toHaveValue('Second Item')
    expect(inputsAfterMove[1]).toHaveValue('First Item')

    // Click Save template
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        '/api/sis/staff-admin/onboarding/templates/tmpl-1',
        expect.objectContaining({
          items: [
            expect.objectContaining({ title: 'Second Item' }),
            expect.objectContaining({ title: 'First Item' }),
          ],
        })
      )
    })
  })
})
