import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, exceptionState } = vi.hoisted(() => {
  const exceptionState = { rows: [] }
  return {
    api: {
      get: vi.fn(() => Promise.resolve({ data: { requests: exceptionState.rows } })),
      post: vi.fn(() => Promise.resolve({ data: {} })),
    },
    exceptionState,
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import AgeExceptionRequestsCard from './AgeExceptionRequestsCard'

beforeEach(() => {
  exceptionState.rows = []
  vi.clearAllMocks()
})

describe('AgeExceptionRequestsCard', () => {
  it('renders nothing when the org has no requests', async () => {
    const { container } = render(<AgeExceptionRequestsCard orgId="org-1" />)
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/api/sis/age-exception-requests?organization_id=org-1'),
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('lists pending age exception requests and approves one', async () => {
    exceptionState.rows = [{
      id: 'x1', status: 'pending', student_name: 'Alice', guardian_name: 'Dana Parent',
      class_name: 'Robotics', student_age: 8, class_min_age: 9, class_max_age: 12,
      message: 'She has done two robotics camps', created_at: '2026-07-14T10:00:00Z',
    }]
    render(<AgeExceptionRequestsCard orgId="org-1" />)
    expect(await screen.findByText('Age exception requests')).toBeInTheDocument()
    expect(screen.getByText(/Requested by Dana Parent/)).toBeInTheDocument()
    expect(screen.getByText(/She has done two robotics camps/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve & enroll' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/age-exception-requests/x1/resolve',
        expect.objectContaining({ action: 'approve', organization_id: 'org-1' })),
    )
  })

  it('declines a request and tucks resolved ones behind a summary', async () => {
    exceptionState.rows = [
      { id: 'x1', status: 'pending', student_name: 'Alice', guardian_name: 'Dana Parent',
        class_name: 'Robotics', created_at: '2026-07-14T10:00:00Z' },
      { id: 'x0', status: 'approved', student_name: 'Ben', guardian_name: 'Dana Parent',
        class_name: 'Pottery', created_at: '2026-07-01T10:00:00Z', resolved_at: '2026-07-02T09:00:00Z' },
    ]
    render(<AgeExceptionRequestsCard orgId="org-1" />)
    expect(await screen.findByText(/Resolved age exception requests \(1\)/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/age-exception-requests/x1/resolve',
        expect.objectContaining({ action: 'decline', organization_id: 'org-1' })),
    )
  })
})
