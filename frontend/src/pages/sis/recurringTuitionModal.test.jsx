import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const ROSTER = [
  { student_id: 's1', name: 'Robin Bowman', is_student: true,
    household_id: 'hh1', household_name: 'Bowman Family' },
  { student_id: 's2', name: 'Uma Bowman', is_student: true,
    household_id: 'hh1', household_name: 'Bowman Family' },
  { student_id: 's3', name: 'Solo Student', is_student: true,
    household_id: null, household_name: null },
  { student_id: 'p1', name: 'Parent Person', is_student: false,
    household_id: 'hh1', household_name: 'Bowman Family' },
]

let schedules = []

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

import RecurringTuitionModal from './RecurringTuitionModal'

const open = (props = {}) => render(
  <RecurringTuitionModal isOpen onClose={vi.fn()} orgId="org-1" {...props} />
)

const pickStudent = async (label) => {
  const input = screen.getByPlaceholderText('Search students…')
  fireEvent.change(input, { target: { value: label } })
  // SearchSelect commits on mouseDown, not click.
  fireEvent.mouseDown(await screen.findByText(new RegExp(label)))
}

const setAmount = (dollars) =>
  fireEvent.change(screen.getByPlaceholderText('500.00'), { target: { value: dollars } })

beforeEach(() => {
  // mockResolvedValue does NOT reset call history, so without this the
  // "calls[0]" assertions below read a previous test's request.
  api.get.mockClear()
  api.post.mockClear()
  schedules = []
  api.get.mockImplementation((url) => Promise.resolve(
    url.includes('/recurring')
      ? { data: { schedules, active_monthly_cents: schedules.reduce((s, r) => s + r.monthly_cents, 0) } }
      : { data: { roster: ROSTER } }
  ))
  api.post.mockResolvedValue({ data: { success: true, emailed: 2 } })
})

describe('RecurringTuitionModal', () => {
  it('never asks for a number of months', async () => {
    // The whole point of the model: open-ended, no term to divide.
    open()
    await screen.findByPlaceholderText('Search students…')
    expect(screen.queryByText(/number of months/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/x \d+ months/i)).not.toBeInTheDocument()
  })

  it('offers students but not parents', async () => {
    open()
    const input = await screen.findByPlaceholderText('Search students…')
    fireEvent.change(input, { target: { value: 'o' } })
    expect(await screen.findByText(/Robin Bowman/)).toBeInTheDocument()
    expect(screen.queryByText(/Parent Person/)).not.toBeInTheDocument()
  })

  it('will not add a student with no family', async () => {
    open()
    await screen.findByPlaceholderText('Search students…')
    await pickStudent('Solo Student')
    setAmount('500')
    expect(await screen.findByText(/isn.t in a family yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add monthly tuition/i })).toBeDisabled()
  })

  it('will not add a zero amount', async () => {
    open()
    await screen.findByPlaceholderText('Search students…')
    await pickStudent('Robin Bowman')
    setAmount('0')
    expect(screen.getByRole('button', { name: /add monthly tuition/i })).toBeDisabled()
  })

  it('posts the amount in cents with no month count', async () => {
    open()
    await screen.findByPlaceholderText('Search students…')
    await pickStudent('Robin Bowman')
    setAmount('500')
    fireEvent.click(screen.getByRole('button', { name: /add monthly tuition/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toContain('/api/sis/tuition/recurring')
    expect(body).toMatchObject({ student_id: 's1', monthly_cents: 50000, day_of_month: 1 })
    expect(body).not.toHaveProperty('months')
  })

  it('rejects a charge day February does not have', async () => {
    open()
    await screen.findByPlaceholderText('Search students…')
    const day = screen.getByDisplayValue('1')
    expect(day).toHaveAttribute('max', '28')
  })

  describe('with existing schedules', () => {
    beforeEach(() => {
      schedules = [
        { id: 'r1', student_user_id: 's1', student_name: 'Robin Bowman',
          household_id: 'hh1', household_name: 'Bowman Family', monthly_cents: 50000,
          status: 'active', next_charge_on: '2026-10-01',
          card: { brand: 'visa', last4: '4242' } },
        { id: 'r2', student_user_id: 's2', student_name: 'Uma Bowman',
          household_id: 'hh1', household_name: 'Bowman Family', monthly_cents: 30000,
          status: 'active', next_charge_on: null, card: null },
      ]
    })

    it('totals what the school bills each month', async () => {
      open()
      expect(await screen.findByText(/\$800\.00/)).toBeInTheDocument()
    })

    it('flags a family that has not saved a card yet', async () => {
      open()
      expect(await screen.findByText(/waiting on the family/)).toBeInTheDocument()
    })

    it('offers the setup link only where no card is on file', async () => {
      open()
      await screen.findByText(/Uma Bowman/)
      // Robin's household already has a card; Uma's row is the one that needs it.
      expect(screen.getAllByRole('button', { name: /email setup link/i })).toHaveLength(1)
    })

    it('keeps a student who already has a schedule out of the picker', async () => {
      open()
      const input = await screen.findByPlaceholderText('Search students…')
      fireEvent.change(input, { target: { value: 'Bowman' } })
      // Both Bowman children are already scheduled, so neither can be re-added.
      await waitFor(() => expect(screen.queryByRole('button', { name: /Robin Bowman —/ })).not.toBeInTheDocument())
    })

    it('pauses a schedule', async () => {
      open()
      const pause = await screen.findAllByRole('button', { name: /^pause$/i })
      fireEvent.click(pause[0])
      await waitFor(() => expect(api.post).toHaveBeenCalled())
      expect(api.post.mock.calls[0][0]).toContain('/recurring/r1/status')
      expect(api.post.mock.calls[0][1]).toEqual({ status: 'paused' })
    })

    it('ends a schedule', async () => {
      open()
      const end = await screen.findAllByRole('button', { name: /^end$/i })
      fireEvent.click(end[0])
      await waitFor(() => expect(api.post).toHaveBeenCalled())
      expect(api.post.mock.calls[0][1]).toEqual({ status: 'canceled' })
    })

    it('emails the setup link for the household, not the student', async () => {
      open()
      fireEvent.click(await screen.findByRole('button', { name: /email setup link/i }))
      await waitFor(() => expect(api.post).toHaveBeenCalled())
      expect(api.post.mock.calls[0][0]).toContain('/recurring/households/hh1/setup-link')
    })

    it('surfaces a server error rather than claiming success', async () => {
      api.post.mockRejectedValueOnce({ response: { data: { error: 'Schedule not found' } } })
      open()
      const end = await screen.findAllByRole('button', { name: /^end$/i })
      fireEvent.click(end[0])
      const { toast } = await import('react-hot-toast')
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Schedule not found'))
    })
  })
})
