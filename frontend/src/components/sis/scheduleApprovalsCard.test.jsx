import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

vi.mock('../../pages/sis/useSisOrg', () => ({
  withOrg: (url, orgId) => `${url}?organization_id=${orgId}`,
}))

import ScheduleApprovalsCard from './ScheduleApprovalsCard'

const SUBMITTED = {
  id: 'sub1', status: 'submitted', student_name: 'Alice Ant',
  guardian_name: 'Pat Parent', submitted_at: '2026-07-21T10:00:00Z',
}

beforeEach(() => { vi.clearAllMocks() })

describe('ScheduleApprovalsCard', () => {
  it('renders nothing when there are no submissions', async () => {
    api.get.mockResolvedValue({ data: { submissions: [] } })
    const { container } = render(<ScheduleApprovalsCard orgId="org-1" />)
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/api/sis/schedule-submissions?organization_id=org-1'))
    expect(container).toBeEmptyDOMElement()
  })

  it('approves a submitted schedule', async () => {
    api.get.mockResolvedValue({ data: { submissions: [SUBMITTED] } })
    api.post.mockResolvedValue({ data: { success: true } })
    render(<ScheduleApprovalsCard orgId="org-1" />)
    expect(await screen.findByText('Schedule approvals')).toBeInTheDocument()
    expect(screen.getByText('Alice Ant')).toBeInTheDocument()
    expect(screen.getByText(/Submitted by Pat Parent/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/schedule-submissions/sub1/review',
      { action: 'approve', note: undefined, organization_id: 'org-1' },
    ))
  })

  it('sends a schedule back with a note for the family', async () => {
    api.get.mockResolvedValue({ data: { submissions: [SUBMITTED] } })
    api.post.mockResolvedValue({ data: { success: true } })
    window.prompt = vi.fn(() => 'Pick a Thursday class')
    render(<ScheduleApprovalsCard orgId="org-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Send back' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/schedule-submissions/sub1/review',
      { action: 'send_back', note: 'Pick a Thursday class', organization_id: 'org-1' },
    ))
  })

  it('cancelling the send-back prompt makes no request', async () => {
    api.get.mockResolvedValue({ data: { submissions: [SUBMITTED] } })
    window.prompt = vi.fn(() => null)
    render(<ScheduleApprovalsCard orgId="org-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Send back' }))
    expect(api.post).not.toHaveBeenCalled()
  })

  it('expands a submission to show its class schedule before approving', async () => {
    api.get.mockImplementation((url) =>
      url.includes('/sub1/schedule')
        ? Promise.resolve({ data: { classes: [
            { id: 'c1', name: 'Algebra 1',
              meetings: [{ day_of_week: 1, start_time: '09:00:00', end_time: '10:00:00' }],
              location: 'Room A', primary_instructor: 'Ms. Ada' },
          ], waitlist: [] } })
        : Promise.resolve({ data: { submissions: [SUBMITTED] } }))
    render(<ScheduleApprovalsCard orgId="org-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'View schedule' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      '/api/sis/schedule-submissions/sub1/schedule?organization_id=org-1'))
    expect(await screen.findByText('Algebra 1')).toBeInTheDocument()
    expect(screen.getByText(/Mon 9:00 AM–10:00 AM/)).toBeInTheDocument()
    expect(screen.getByText(/Ms\. Ada/)).toBeInTheDocument()
    // toggles closed again
    fireEvent.click(screen.getByRole('button', { name: 'Hide schedule' }))
    await waitFor(() => expect(screen.queryByText('Algebra 1')).not.toBeInTheDocument())
  })

  it('lists reviewed submissions with their notes', async () => {
    api.get.mockResolvedValue({ data: { submissions: [
      { ...SUBMITTED, id: 'sub2', status: 'sent_back', review_note: 'Fix Tuesday',
        reviewed_at: '2026-07-22T09:00:00Z' },
    ] } })
    render(<ScheduleApprovalsCard orgId="org-1" />)
    expect(await screen.findByText(/Reviewed schedule submissions \(1\)/)).toBeInTheDocument()
    expect(screen.getByText('sent back')).toBeInTheDocument()
    expect(screen.getByText(/Fix Tuesday/)).toBeInTheDocument()
  })
})
