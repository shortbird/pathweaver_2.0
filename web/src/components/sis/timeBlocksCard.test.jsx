import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * Time blocks are rows with ids (M8b). The card reads them from the schedule
 * settings read the class editor uses, and saves through the settings PATCH,
 * sending each block's id back so a rename stays a rename of the same block.
 */

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../pages/sis/useSisOrg', () => ({
  withOrg: (p, orgId) => `${p}${p.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

import TimeBlocksCard from './TimeBlocksCard'

const ROWS = [
  { id: 'b1', start: '09:30', end: '10:30', label: '', sort: 0 },
  { id: 'b2', start: '10:30', end: '11:30', label: 'Studio', sort: 1 },
]

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { time_blocks: ROWS } })
  api.patch.mockResolvedValue({ data: { blocks: ROWS } })
})

describe('TimeBlocksCard', () => {
  it('reads the rows from schedule settings, not the org blob', async () => {
    render(<TimeBlocksCard orgId="org-1" />)
    expect(await screen.findByDisplayValue('Studio')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/sis/schedule-settings?organization_id=org-1')
  })

  it('saves through the settings PATCH with each block\'s id', async () => {
    render(<TimeBlocksCard orgId="org-1" />)
    fireEvent.change(await screen.findByDisplayValue('Studio'), { target: { value: 'Third period' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save time blocks' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/settings?organization_id=org-1',
      { sis_settings: { time_blocks: [
        { id: 'b1', start: '09:30', end: '10:30', label: '' },
        { id: 'b2', start: '10:30', end: '11:30', label: 'Third period' },
      ] } },
    ))
  })

  it('sends null when the last block is removed', async () => {
    api.get.mockResolvedValue({ data: { time_blocks: [ROWS[0]] } })
    render(<TimeBlocksCard orgId="org-1" />)
    fireEvent.click(await screen.findByText('Remove'))
    fireEvent.click(screen.getByRole('button', { name: 'Save time blocks' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      expect.any(String), { sis_settings: { time_blocks: null } },
    ))
  })
})
