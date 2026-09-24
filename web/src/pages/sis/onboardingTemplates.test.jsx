import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// The template library reads through hooks/api (QF-03), so these need a
// QueryClient. Fresh client per render keeps one test's cache out of the next
// one's; retry:false makes a failed query fail rather than hang on backoff.
const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{<MemoryRouter>{ui}</MemoryRouter>}</QueryClientProvider>)
}

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

import { TaskTemplatesManager } from '../../components/sis/tasks/TaskTemplatesManager'

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

// The Templates tab of the Tasks page renders the library embedded and open.
const openTemplates = async () => {
  render(<TaskTemplatesManager orgId="org-1" embedded open />)
  await screen.findByText('Staff Onboarding')
}

describe('Task templates management', () => {
  it('renders template list with Duplicate button', async () => {
    await openTemplates()
    expect(await screen.findByText('Staff Onboarding')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeInTheDocument()
  })

  it('duplicates a template server-side', async () => {
    await openTemplates()
    const duplicateBtn = await screen.findByRole('button', { name: 'Duplicate' })
    fireEvent.click(duplicateBtn)

    // Server-side so the copy keeps blocks_access and drops the original's
    // per-person document bindings — neither reaches the editor.
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/sis/staff-admin/onboarding/templates/tmpl-1/duplicate',
        {}
      )
    })
  })

  it('allows moving sections up and down in template editor', async () => {
    await openTemplates()
    const editBtn = await screen.findByRole('button', { name: 'Edit' })
    fireEvent.click(editBtn)

    // Verify template steps are rendered
    const item1Input = screen.getByDisplayValue('First Item')
    const item2Input = screen.getByDisplayValue('Second Item')
    expect(item1Input).toBeInTheDocument()
    expect(item2Input).toBeInTheDocument()

    // Find up/down buttons
    // By title, not by text: /Up/i also matches other controls on the page.
    const upButtons = screen.getAllByTitle('Move section up')
    const downButtons = screen.getAllByTitle('Move section down')

    // First step: Up should be disabled, Down enabled
    expect(upButtons[0]).toBeDisabled()
    expect(downButtons[0]).not.toBeDisabled()

    // Second step: Up should be enabled, Down disabled
    expect(upButtons[1]).not.toBeDisabled()
    expect(downButtons[1]).toBeDisabled()

    // Move first step down
    fireEvent.click(downButtons[0])

    // Now inputs should be swapped in order
    const inputsAfterMove = screen.getAllByPlaceholderText(/^Step \d+$/)
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
  it('duplicates a single step without copying its key', async () => {
    await openTemplates()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    // Disambiguated by title: the template row has a 'Duplicate' button too.
    fireEvent.click(screen.getAllByTitle('Duplicate this step')[0])

    const inputs = screen.getAllByPlaceholderText(/^Step \d+$/)
    expect(inputs[0]).toHaveValue('First Item')
    expect(inputs[1]).toHaveValue('First Item (copy)')

    fireEvent.click(screen.getByRole('button', { name: 'Save template' }))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        '/api/sis/staff-admin/onboarding/templates/tmpl-1',
        expect.objectContaining({
          items: [
            expect.objectContaining({ title: 'First Item', key: 'item_1' }),
            // No key: the server mints a fresh one, so progress recorded
            // against the copy can never land on the original.
            expect.not.objectContaining({ key: expect.anything() }),
            expect.objectContaining({ title: 'Second Item', key: 'item_2' }),
          ],
        })
      )
    })
  })

  it('duplicates template from inside the editor modal', async () => {
    await openTemplates()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    const duplicateModalBtn = screen.getByRole('button', { name: 'Duplicate template' })
    expect(duplicateModalBtn).toBeInTheDocument()
    fireEvent.click(duplicateModalBtn)

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/sis/staff-admin/onboarding/templates/tmpl-1/duplicate',
        {}
      )
    })
  })
})
