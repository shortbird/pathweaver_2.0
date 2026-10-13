import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FamilyGroupDashboardPage from './FamilyGroupDashboardPage'
import api from '../services/api'

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const DATA = {
  success: true,
  group: { id: 'g1', name: 'OpenEd', school_name: 'Optio Academy' },
  family_count: 2,
  students: [
    { id: 's1', name: 'Kyle Smith', first_name: 'Kyle', last_name: 'Smith', email: 'kyle@example.com',
      managed_by_parent: false, parents: [{ name: 'Alexis Smith', email: 'alexis@example.com' }],
      status: 'enrolled', enrolled_at: '2026-10-02T00:00:00Z', dropped_at: null, last_active: null,
      credits: { banked: 6, used: 1.5, balance: 4.5, since: '2026-10-02T00:00:00Z',
        entries: [{ id: 'e1', credits: 6, kind: 'included', source: 'opened', note: 'OpenEd 2026-27', created_at: '2026-10-02T00:00:00Z' }] } },
    { id: 's2', name: 'Brock Bradley', first_name: 'Brock', last_name: 'Bradley', email: 'brock@example.com',
      managed_by_parent: false, parents: [{ name: 'Constance Bradley', email: 'c@example.com' }],
      status: 'dropped', enrolled_at: '2026-10-02T00:00:00Z', dropped_at: '2026-10-12T00:00:00Z', last_active: null },
  ],
}

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={['/family-groups/g1']}>
      <Routes>
        <Route path="/family-groups/:groupId" element={<FamilyGroupDashboardPage />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>,
)

describe('FamilyGroupDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: DATA })
    api.post.mockResolvedValue({ data: { success: true } })
  })

  it('shows every student by default, dropped ones included', async () => {
    renderPage()
    expect(await screen.findByText('Kyle Smith')).toBeInTheDocument()
    expect(screen.getByText('Brock Bradley')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All (2)' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('narrows to enrolled students', async () => {
    renderPage()
    await screen.findByText('Kyle Smith')
    fireEvent.click(screen.getByRole('button', { name: 'Enrolled (1)' }))
    expect(screen.queryByText('Brock Bradley')).not.toBeInTheDocument()
  })

  it('drops a student after confirming', async () => {
    renderPage()
    await screen.findByText('Kyle Smith')
    fireEvent.click(screen.getByRole('button', { name: 'Drop' }))
    expect(screen.getByText('Drop Kyle Smith?')).toBeInTheDocument()
    const confirmButtons = screen.getAllByRole('button', { name: 'Drop' })
    fireEvent.click(confirmButtons[confirmButtons.length - 1])
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/family-groups/g1/students/s1/drop', {}))
  })

  it('re-enrolls a dropped student', async () => {
    renderPage()
    await screen.findByText('Brock Bradley')
    fireEvent.click(screen.getByRole('button', { name: 'Re-enroll' }))
    const buttons = screen.getAllByRole('button', { name: 'Re-enroll' })
    fireEvent.click(buttons[buttons.length - 1])
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/family-groups/g1/students/s2/reenroll', {}))
  })

  it('says so when the account cannot open the group', async () => {
    api.get.mockRejectedValue({ response: { status: 404 } })
    renderPage()
    expect(await screen.findByText('This page is not available to your account.')).toBeInTheDocument()
  })

  it('shows the credit balance and banks an accelerated order', async () => {
    api.post.mockResolvedValue({ data: { success: true, credits: { banked: 7, used: 1.5, balance: 5.5, since: null, entries: [] } } })
    const after = { ...DATA, students: DATA.students.map(s => (s.id === 's1'
      ? { ...s, credits: { banked: 7, used: 1.5, balance: 5.5, since: null, entries: [] } } : s)) }
    api.get.mockResolvedValueOnce({ data: DATA }).mockResolvedValue({ data: after })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Credits for Kyle Smith' }))
    expect(screen.getByText('OpenEd 2026-27', { exact: false })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('OpenEd order number'), { target: { value: 'OE-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add credits' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/family-groups/g1/students/s1/credits',
      { kind: 'accelerated', credits: '1', order_reference: 'OE-1', note: '' },
    ))
    expect(await screen.findByText('5.5 left')).toBeInTheDocument()
  })

  it('offers OpenEd\'s two purchase types and no correction', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Credits for Kyle Smith' }))
    const options = screen.getAllByRole('option').map(o => o.textContent)
    expect(options).toEqual(['Accelerated ($50 per 0.5 credits)', 'Prior learning ($25 per 0.5 credits)'])
  })
})
