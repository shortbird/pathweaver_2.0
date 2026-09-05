import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Reading a resource without keeping a copy of it.
 *
 * iCreate, 2026-08-29 (0e58828d): "Can we have the files just open a window
 * with the option to download instead of automatically asking for a download?
 * I just need to reference the document, I don't want to always download it or
 * search through my computer for the previously downloaded file."
 *
 * The title was a bare link at the file, so the browser saved it and staff went
 * hunting through Downloads for a paper they only wanted to glance at.
 */

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'org_managed', org_roles: ['org_admin'] } }),
}))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('../../components/sis/BackToDashboard', () => ({ default: () => null }))
// react-pdf pulls a worker and a canvas; the modal's job here is the chrome
// around the preview, not the renderer itself.
vi.mock('../../components/evidence/preview/DocumentPreview', () => ({
  default: ({ url }) => <div data-testid="preview">{url}</div>,
  isPreviewableDocument: (u, t) => /\.(pdf|png|jpe?g)/i.test(`${t || ''} ${u || ''}`),
}))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import ResourcesPage from './ResourcesPage'

const RESOURCES = [
  { id: 'r1', title: 'Family Guidebook', url: 'https://x.test/guide.pdf', category: 'Handbook', audience: 'families' },
  { id: 'r2', title: 'Weekly Teacher Survey', url: 'https://forms.example.com/survey', category: 'Links', audience: 'staff' },
]

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => (
    url.includes('/resources')
      ? Promise.resolve({ data: { resources: RESOURCES } })
      : Promise.resolve({ data: {} })
  ))
})

const show = async () => {
  render(<MemoryRouter><ResourcesPage /></MemoryRouter>)
  await screen.findByText('Family Guidebook')
}

describe('opening a resource', () => {
  it('reads a PDF in a window instead of downloading it', async () => {
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Family Guidebook' }))
    expect(screen.getByTestId('preview')).toHaveTextContent('https://x.test/guide.pdf')
  })

  it('still offers the download, one click away', async () => {
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Family Guidebook' }))
    expect(screen.getByRole('link', { name: 'Open / download' }))
      .toHaveAttribute('href', 'https://x.test/guide.pdf')
  })

  it('leaves a plain web link alone', async () => {
    // A survey link is not a document; opening it in a preview pane would be
    // worse than the browser doing what it already does well.
    await show()
    expect(screen.getByRole('link', { name: 'Weekly Teacher Survey' }))
      .toHaveAttribute('href', 'https://forms.example.com/survey')
  })

  it('closes back to the list', async () => {
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Family Guidebook' }))
    fireEvent.click(screen.getByLabelText('Close'))
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument()
  })
})
