import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })) },
}))
vi.mock('../../../services/api', () => ({ default: api }))

import ParentCheckInCard from '../ParentCheckInCard'

beforeEach(() => vi.clearAllMocks())

describe('ParentCheckInCard', () => {
  it('renders nothing when no child is SIS-applicable', async () => {
    api.get.mockResolvedValue({ data: { applicable: false, checkin: null } })
    const { container } = render(<ParentCheckInCard children={[{ id: 's1', name: 'Bo' }]} />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('shows applicable children and checks in', async () => {
    api.get.mockResolvedValue({ data: { applicable: true, checkin: { status: null } } })
    render(<ParentCheckInCard children={[{ id: 's1', name: 'Bo' }]} />)
    expect(await screen.findByText('Daily check-in')).toBeInTheDocument()
    expect(screen.getByText('Bo')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Check in'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/checkin/s1/check-in', {}),
    )
  })
})
