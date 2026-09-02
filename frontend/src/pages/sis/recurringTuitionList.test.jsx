import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

import RecurringTuitionList, { groupByFamily } from './RecurringTuitionList'

const CONTACT = { name: 'Paige Hanna', email: 'paige@example.com' }

// Two children in one household — the shape that produced two "Email setup
// link" buttons for a single card setup (Optio Academy, 2026-09-02).
const HANNA = [
  { id: 'r1', student_user_id: 's1', student_name: 'Banks Hanna',
    household_id: 'hh1', household_name: 'Hanna', monthly_cents: 100000,
    status: 'active', next_charge_on: null, card: null,
    billing_contact: CONTACT, setup_link_sent_at: null },
  { id: 'r2', student_user_id: 's2', student_name: 'Conrad Hanna',
    household_id: 'hh1', household_name: 'Hanna', monthly_cents: 100000,
    status: 'active', next_charge_on: null, card: null,
    billing_contact: CONTACT, setup_link_sent_at: null },
]

const show = (schedules) => render(
  <RecurringTuitionList orgId="org-1" schedules={schedules} onChanged={vi.fn()} />
)

beforeEach(() => {
  api.get.mockClear()
  api.post.mockClear()
  api.post.mockResolvedValue({ data: { success: true, emailed: 1, sent_to: ['Paige Hanna'] } })
})

describe('RecurringTuitionList', () => {
  it('asks a family for their card once, however many children they have', async () => {
    show(HANNA)
    await screen.findByText('Banks Hanna')
    expect(screen.getAllByRole('button', { name: /setup link/i })).toHaveLength(1)
  })

  it('adds the children up into what the family pays each month', async () => {
    show(HANNA)
    expect(await screen.findByText(/\$2000\.00\/month/)).toBeInTheDocument()
  })

  it('names the one parent the link goes to', async () => {
    show(HANNA)
    expect(await screen.findByText(/goes to Paige Hanna/)).toBeInTheDocument()
  })

  it('emails the household, and says who received it', async () => {
    show(HANNA)
    fireEvent.click(await screen.findByRole('button', { name: /setup link/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][0]).toContain('/recurring/households/hh1/setup-link')
    const { toast } = await import('react-hot-toast')
    await waitFor(() => expect(toast.success)
      .toHaveBeenCalledWith(expect.stringContaining('Paige Hanna')))
  })

  it('still pauses one child without touching their sibling', async () => {
    show(HANNA)
    const pause = await screen.findAllByRole('button', { name: /^pause$/i })
    expect(pause).toHaveLength(2)
    fireEvent.click(pause[0])
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][0]).toContain('/recurring/r1/status')
    expect(api.post.mock.calls[0][1]).toEqual({ status: 'paused' })
  })

  it('says the link has not been sent yet, rather than blaming the family', async () => {
    show(HANNA)
    expect(await screen.findByText(/setup link not sent yet/)).toBeInTheDocument()
    expect(screen.queryByText(/waiting on the family/)).not.toBeInTheDocument()
  })

  it('waits on the family only once they have actually been asked', async () => {
    show(HANNA.map((s) => ({ ...s, setup_link_sent_at: '2026-09-01T10:00:00Z' })))
    expect(await screen.findByText(/link sent.*waiting on the family/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /resend setup link/i })).toBeInTheDocument()
  })

  it('will not send a link that has nowhere to go', async () => {
    show(HANNA.map((s) => ({ ...s, billing_contact: null })))
    expect(await screen.findByText(/no parent to email/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /email setup link/i })).toBeDisabled()
  })

  it('drops the ask once the card is on file', async () => {
    show(HANNA.map((s) => ({ ...s, card: { brand: 'visa', last4: '4242' } })))
    expect(await screen.findByText(/card visa ····4242/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /setup link/i })).not.toBeInTheDocument()
  })

  it('surfaces a server error rather than claiming success', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { error: 'Add a parent to the family' } } })
    show(HANNA)
    fireEvent.click(await screen.findByRole('button', { name: /setup link/i }))
    const { toast } = await import('react-hot-toast')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Add a parent to the family'))
  })
})

describe('groupByFamily', () => {
  it('folds a household’s children into one payer', () => {
    const [fam] = groupByFamily(HANNA)
    expect(fam.students).toHaveLength(2)
    expect(fam.monthlyCents).toBe(200000)
    expect(fam.contact).toEqual(CONTACT)
  })

  it('leaves a paused child out of the monthly total', () => {
    const [fam] = groupByFamily([HANNA[0], { ...HANNA[1], status: 'paused' }])
    expect(fam.monthlyCents).toBe(100000)
    expect(fam.students).toHaveLength(2)
  })

  it('keeps separate families separate', () => {
    const other = { ...HANNA[0], id: 'r3', household_id: 'hh2', household_name: 'Waite' }
    expect(groupByFamily([...HANNA, other])).toHaveLength(2)
  })
})
