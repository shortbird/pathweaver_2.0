import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// vi.mock calls below are hoisted above this import.
import FamilySettingsModal from './FamilySettingsModal'

/**
 * The family's directory listing, in Family Settings.
 *
 * iCreate, 2d456409 (2026-09-22): "I really wanted the directory to be opt OUT
 * instead of opt in. And preferably put this in a more hidden place (Like
 * settings.) Carpool message can remain on top." The listing switch and the
 * sharing checkboxes moved off /family-directory into a Directory tab here.
 * The carpool checkbox stayed on the directory page, and since 2026-09-24 it
 * is here too, beside the switch (Tanner: "add carpool checkbox in family
 * settings next to the directory switch").
 *
 * What has to hold: the tab exists only for a guardian whose school runs the
 * directory, it shows what the family SAVED (not the defaults), and a change
 * saves with the rest of the saved values, carpool included.
 */

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'parent-1', first_name: 'Dana', last_name: 'Smith' }, refreshUser: vi.fn() }),
}))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn() }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../services/api', () => ({
  default: api,
  observerAPI: { getFamilyObservers: vi.fn(() => Promise.resolve({ data: { observers: [] } })) },
  parentAPI: { getFamilyParents: vi.fn(() => Promise.resolve({ data: { parents: [] } })) },
}))
vi.mock('framer-motion', () => ({ motion: { span: (p) => <span {...p} /> } }))


const GUARDIAN_ORG = {
  organization_id: 'org-1', organization_name: 'iCreate', is_guardian: true,
  modules: ['community', 'calendar'],
}

let schoolOrgs = [GUARDIAN_ORG]
// Deliberately NOT the defaults (email on, phone on, address off): the tab
// must show what the family saved.
let saved = { opted_in: true, default_in: true, carpool_interest: true,
              share_email: false, share_phone: true, share_address: true }

beforeEach(() => {
  vi.clearAllMocks()
  schoolOrgs = [GUARDIAN_ORG]
  saved = { opted_in: true, default_in: true, carpool_interest: true,
            share_email: false, share_phone: true, share_address: true }
  api.get.mockImplementation((url) => {
    if (url.startsWith('/api/sis/school/context')) {
      return Promise.resolve({ data: { orgs: schoolOrgs, is_guardian: schoolOrgs.some((o) => o.is_guardian) } })
    }
    if (url.startsWith('/api/sis/parent/directory/opt-in')) return Promise.resolve({ data: saved })
    return Promise.resolve({ data: {} })
  })
  api.put.mockResolvedValue({ data: { success: true } })
})

const renderModal = (props = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <FamilySettingsModal isOpen onClose={vi.fn()} family={[]} onRefresh={vi.fn()} {...props} />
    </QueryClientProvider>,
  )
}

describe('the Directory tab of Family Settings (2d456409)', () => {
  it('is offered to a guardian whose school runs the directory', async () => {
    renderModal()
    expect(await screen.findByRole('tab', { name: 'Directory' })).toBeInTheDocument()
  })

  it('is not offered when the school has the directory off', async () => {
    schoolOrgs = [{ ...GUARDIAN_ORG, modules: ['calendar'] }]
    renderModal()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/school/context'))
    expect(screen.queryByRole('tab', { name: 'Directory' })).not.toBeInTheDocument()
  })

  it('is not offered to a member of the school who guards nobody', async () => {
    schoolOrgs = [{ ...GUARDIAN_ORG, is_guardian: false }]
    renderModal()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/school/context'))
    expect(screen.queryByRole('tab', { name: 'Directory' })).not.toBeInTheDocument()
  })

  it('opens on the tab the directory page links to, showing the saved values', async () => {
    renderModal({ initialTab: 'directory' })
    const toggle = await screen.findByRole('switch', { name: 'Include our family in the directory' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Our family is listed in the directory')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Parent emails' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Family phone' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Street address' })).toBeChecked()
    // Carpool sits beside the switch now (2026-09-24), showing the saved flag.
    expect(screen.getByRole('checkbox', { name: /open to carpooling/i })).toBeChecked()
  })

  it('says students are not the audience any more (82485501)', async () => {
    renderModal({ initialTab: 'directory' })
    expect(await screen.findByText(/Visible to families and staff at iCreate/)).toBeInTheDocument()
    expect(screen.queryByText(/students/i)).not.toBeInTheDocument()
  })

  it('saves a sharing change with the rest of the saved values, carpool unchanged', async () => {
    renderModal({ initialTab: 'directory' })
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Parent emails' }))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const [url, body] = api.put.mock.calls[0]
    expect(url).toBe('/api/sis/parent/directory/opt-in?organization_id=org-1')
    // carpool_interest now travels with every save (the tab shows it), and
    // carries the saved value, so a sharing change cannot flip it.
    expect(body).toEqual({ opted_in: true, share_email: true, share_phone: true, share_address: true,
                           carpool_interest: true })
    expect(screen.getByRole('checkbox', { name: 'Parent emails' })).toBeChecked()
  })

  it('saves leaving the directory', async () => {
    renderModal({ initialTab: 'directory' })
    await userEvent.click(await screen.findByRole('switch', { name: 'Include our family in the directory' }))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(api.put.mock.calls[0][1]).toMatchObject({ opted_in: false })
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    // Nothing to choose about a listing that is not shown.
    expect(screen.queryByRole('checkbox', { name: 'Parent emails' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /open to carpooling/i })).not.toBeInTheDocument()
  })

  it('saves the carpool checkbox beside the switch', async () => {
    saved = { ...saved, carpool_interest: false }
    renderModal({ initialTab: 'directory' })
    const box = await screen.findByRole('checkbox', { name: /open to carpooling/i })
    expect(box).not.toBeChecked()
    await userEvent.click(box)
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(api.put.mock.calls[0][1]).toEqual({ opted_in: true, share_email: false, share_phone: true,
                                              share_address: true, carpool_interest: true })
    expect(screen.getByRole('checkbox', { name: /open to carpooling/i })).toBeChecked()
  })

  it('reads a family that never answered carpool as not open to it', async () => {
    const { carpool_interest: _omit, ...rest } = saved
    saved = rest
    renderModal({ initialTab: 'directory' })
    expect(await screen.findByRole('checkbox', { name: /open to carpooling/i })).not.toBeChecked()
  })

  it('puts the switch back if the save fails', async () => {
    api.put.mockRejectedValueOnce({ response: { data: { error: 'nope' } } })
    renderModal({ initialTab: 'directory' })
    await userEvent.click(await screen.findByRole('switch', { name: 'Include our family in the directory' }))
    await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true'))
  })
})
