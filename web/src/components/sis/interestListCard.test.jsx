/**
 * The interest list on Registration > Enrollment queues: families who joined
 * the waitlist from the registration link before registering or paying
 * (Apogee NoCo, 2026-10-16).
 *
 * What the card owes the office:
 *   - every family shows by default, in the order they joined, with each
 *     child's birthday and age, and a place in line that counts only the
 *     families still waiting or invited;
 *   - "Invite to register" posts the invite and re-reads the list (the server
 *     decides the status); a failed email is said out loud;
 *   - Remove asks first; a removed family can be put back;
 *   - Copy emails skips removed families; Download CSV writes the shown rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))
vi.mock('../../pages/sis/useSisOrg', () => ({
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
const { confirm } = vi.hoisted(() => ({ confirm: vi.fn(async () => true) }))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => confirm }))
const { csv } = vi.hoisted(() => ({ csv: { downloadCsv: vi.fn() } }))
vi.mock('../../utils/csv', async (importOriginal) => ({
  ...(await importOriginal()), downloadCsv: csv.downloadCsv,
}))

import InterestListCard from './InterestListCard'

const ENTRIES = [
  { id: 'e1', status: 'registered', parent_first_name: 'Rae', parent_last_name: 'Done',
    email: 'rae@example.com', created_at: '2026-10-01T10:00:00Z',
    children: [{ first_name: 'Zed', dob: '2021-01-01', age: 5 }] },
  { id: 'e2', status: 'waiting', parent_first_name: 'Pat', parent_last_name: 'Parent',
    email: 'pat@example.com', phone: '555-0100', created_at: '2026-10-02T10:00:00Z',
    interest: 'Kindergarten', list_label: '2027-28 school year', notes: 'Twins next year',
    children: [{ first_name: 'Ava', dob: '2022-03-14', age: 4 }, { first_name: 'Leo', dob: '2022-03-14', age: 4 }] },
  { id: 'e3', status: 'removed', parent_first_name: 'Sam', parent_last_name: 'Gone',
    email: 'sam@example.com', created_at: '2026-10-03T10:00:00Z',
    children: [{ first_name: 'Kai', dob: '2022-05-05', age: 4 }] },
]

const renderCard = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <InterestListCard orgId="org-1" enabled />
  </QueryClientProvider>,
)

describe('InterestListCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { success: true, entries: ENTRIES } })
    api.post.mockResolvedValue({ data: { success: true, emailed: true } })
  })

  it('shows every family by default, with children, ages and place in line', async () => {
    renderCard()
    expect(await screen.findByText('#1 Pat Parent')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/sis/interest-list?organization_id=org-1')
    // Registered and removed families are listed too, but hold no place.
    expect(screen.getByText('Rae Done')).toBeInTheDocument()
    expect(screen.getByText('Sam Gone')).toBeInTheDocument()
    expect(screen.getByText(/Ava \(born 2022-03-14, 4 now\), Leo/)).toBeInTheDocument()
    expect(screen.getByText('Kindergarten · 2027-28 school year')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All (3)' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('filters by status', async () => {
    renderCard()
    await screen.findByText('#1 Pat Parent')
    fireEvent.click(screen.getByRole('button', { name: 'Removed (1)' }))
    expect(screen.queryByText('#1 Pat Parent')).not.toBeInTheDocument()
    expect(screen.getByText('Sam Gone')).toBeInTheDocument()
  })

  it('invites a family and re-reads the list', async () => {
    renderCard()
    await screen.findByText('#1 Pat Parent')
    fireEvent.click(screen.getByRole('button', { name: 'Invite to register' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/interest-list/e2/invite', { organization_id: 'org-1' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Pat Parent was emailed the registration link'))
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
  })

  it('says so when the invite email could not be sent', async () => {
    api.post.mockResolvedValue({ data: { success: true, emailed: false } })
    renderCard()
    await screen.findByText('#1 Pat Parent')
    fireEvent.click(screen.getByRole('button', { name: 'Invite to register' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('could not be sent')))
  })

  it('removes after asking, and puts a removed family back', async () => {
    renderCard()
    await screen.findByText('#1 Pat Parent')
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/interest-list/e2/status', { organization_id: 'org-1', status: 'removed' }))
    expect(confirm).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Put back' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/interest-list/e3/status', { organization_id: 'org-1', status: 'waiting' }))
  })

  it('does not remove when the office cancels', async () => {
    confirm.mockResolvedValueOnce(false)
    renderCard()
    await screen.findByText('#1 Pat Parent')
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(api.post).not.toHaveBeenCalled()
  })

  it('copies the emails of families not removed', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    renderCard()
    await screen.findByText('#1 Pat Parent')
    fireEvent.click(screen.getByRole('button', { name: 'Copy emails' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('rae@example.com, pat@example.com'))
  })

  it('downloads the shown rows as CSV', async () => {
    renderCard()
    await screen.findByText('#1 Pat Parent')
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    const [text, filename] = csv.downloadCsv.mock.calls[0]
    expect(filename).toMatch(/^interest-list-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(text.split('\r\n')[0]).toBe('Place,Joined,Status,Parent,Email,Phone,Children,Interested in,Waitlist,Notes')
    expect(text).toContain('1,')
    expect(text).toContain('Pat Parent,pat@example.com,555-0100')
  })

  it('says when nobody has joined', async () => {
    api.get.mockResolvedValue({ data: { success: true, entries: [] } })
    renderCard()
    expect(await screen.findByText('No families on the list yet.')).toBeInTheDocument()
  })
})
