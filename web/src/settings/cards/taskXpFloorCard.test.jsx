import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import TaskXpFloorCard from './TaskXpFloorCard'

/**
 * "Smallest XP for a task" (ticket a6f7b429, Jon England, Horizon: "When we
 * save a task, the XP minimum goes back to 25 and overrides the custom XP we
 * set for that task"). Owner decision: an org may lower the floor. The card
 * PATCHes the one key it owns; the server checks the range again
 * (backend/tests/test_org_task_xp_floor.py).
 */

const { api } = vi.hoisted(() => ({ api: { patch: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const org = (sis = {}) => ({ id: 'org-1', feature_flags: { sis_settings: sis } })
const sent = () => api.patch.mock.calls[0][1]

beforeEach(() => {
  vi.clearAllMocks()
  api.patch.mockResolvedValue({ data: {} })
})

describe('TaskXpFloorCard', () => {
  it('shows 25 and the help text for a school that never set it', () => {
    render(<TaskXpFloorCard orgId="org-1" org={org()} />)
    expect(screen.getByLabelText('Smallest XP for a task')).toHaveValue(25)
    expect(screen.getByText(/Tasks can.t be worth less than this. Optio.s default is 25./)).toBeInTheDocument()
  })

  it('saves a lower floor under sis_settings only', async () => {
    render(<TaskXpFloorCard orgId="org-1" org={org()} />)
    fireEvent.change(screen.getByLabelText('Smallest XP for a task'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(api.patch.mock.calls[0][0]).toBe('/api/sis/settings?organization_id=org-1')
    expect(sent()).toEqual({ sis_settings: { min_task_xp: 10 } })
  })

  it('setting it back to 25 clears the key', async () => {
    render(<TaskXpFloorCard orgId="org-1" org={org({ min_task_xp: 10 })} />)
    fireEvent.change(screen.getByLabelText('Smallest XP for a task'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(sent()).toEqual({ sis_settings: { min_task_xp: null } })
  })

  it.each(['0', '26', '2.5'])('refuses %s without saving', (bad) => {
    render(<TaskXpFloorCard orgId="org-1" org={org()} />)
    fireEvent.change(screen.getByLabelText('Smallest XP for a task'), { target: { value: bad } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('from 1 to 25')
    expect(api.patch).not.toHaveBeenCalled()
  })
})
