/**
 * The family portal side of the typed signature.
 *
 * Families sign the same way staff do — the block is one shared component
 * (components/sis/ChecklistSignature) precisely so a parent's signature and a
 * teacher's signature are the same thing. This file holds the wiring: that the
 * family portal renders it, and that it posts to the parent endpoint rather than
 * the staff one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const STATEMENT = 'I am typing my own name below, and I intend it to count as my official signature.'

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}))
vi.mock('../services/api', () => ({ default: api }))

import FamilyPortalPage from './FamilyPortalPage'

const ITEM = {
  key: 'media', title: 'Photo and media release', required: true,
  needs_signature: true, needs_document: false, status: 'pending', signature: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  api.patch.mockResolvedValue({ data: { success: true } })
  api.get.mockImplementation((url) => {
    if (url.includes('/parent/context')) {
      return Promise.resolve({ data: { orgs: [{ organization_id: 'org-1', organization_name: 'iCreate' }] } })
    }
    if (url.includes('/parent/onboarding')) {
      return Promise.resolve({ data: { assignments: [{
        id: 'fa1', template_name: 'Back to school paperwork',
        done_count: 0, total_count: 1, signature_statement: STATEMENT, items: [ITEM],
      }] } })
    }
    return Promise.resolve({ data: {} })
  })
})

describe('a family signing their paperwork', () => {
  it('offers the typed signature on the item', async () => {
    render(<FamilyPortalPage />)
    expect(await screen.findByPlaceholderText('Your full name')).toBeInTheDocument()
    expect(screen.getByText(STATEMENT)).toBeInTheDocument()
  })

  it('signs through the parent endpoint', async () => {
    render(<FamilyPortalPage />)
    fireEvent.change(await screen.findByPlaceholderText('Your full name'), { target: { value: 'Dana Myers' } })
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp('official signature') }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/parent/onboarding/fa1/items/media',
      expect.objectContaining({ signature_name: 'Dana Myers', signature_agreed: true }),
    ))
  })
})

describe('signing a document from the office on family portal', () => {
  it('withholds the sign box until the office uploads the document', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/parent/context')) {
        return Promise.resolve({ data: { orgs: [{ organization_id: 'org-1', organization_name: 'iCreate' }] } })
      }
      if (url.includes('/parent/onboarding')) {
        return Promise.resolve({ data: { assignments: [{
          id: 'fa1', template_name: 'Back to school paperwork',
          done_count: 0, total_count: 1, signature_statement: STATEMENT, items: [{
            ...ITEM, sign_docs: []
          }],
        }] } })
      }
      return Promise.resolve({ data: {} })
    })

    render(<FamilyPortalPage />)
    await screen.findByText('Photo and media release')
    expect(screen.queryByPlaceholderText('Your full name')).not.toBeInTheDocument()
    expect(screen.getByText(/Your document is not here yet/)).toBeInTheDocument()
  })
})
