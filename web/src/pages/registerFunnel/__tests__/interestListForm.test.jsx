/**
 * "Join the waitlist" on the registration link's first screen (Apogee NoCo,
 * 2026-10-16): a family who is not ready to register or pay leaves a parent's
 * contact details and each child's first name and birthday. No account, no fee.
 *
 * The door shows only when the school turned the list on; the form checks the
 * fields a person can get wrong before it sends; it sends the honeypot field
 * as typed (the server discards a filled one); and preview mode sends nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../../services/api', () => ({ default: api }))
vi.mock('../../../components/auth/GoogleButton', () => ({ default: () => null }))
vi.mock('../../../components/auth/AppleButton', () => ({ default: () => null }))

import AccountStep from '../AccountStep'

const ORG = { id: 'org-1', name: 'Apogee NoCo' }
const ON = { enabled: true, label: '2027-28 school year' }

const renderStep = (props = {}) => render(
  <AccountStep
    account={{ first_name: '', last_name: '', email: '', password: '', confirm: '' }}
    setAccount={vi.fn()} accountNotice="" setAccountNotice={vi.fn()}
    code="CODE123" mode="create" setMode={vi.fn()} org={ORG}
    previewMode={false} submitting={false} submitCreate={vi.fn()} submitSignin={vi.fn()}
    interestList={ON}
    {...props}
  />,
)

const type = (labelText, value) => fireEvent.change(screen.getByLabelText(labelText), { target: { value } })

const fillParent = () => {
  type('Your first name', 'Pat')
  type('Your last name', 'Parent')
  type('Email', 'pat@example.com')
}

describe('Join the waitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.post.mockResolvedValue({ data: { success: true } })
  })

  it('is not offered when the school has it off', () => {
    renderStep({ interestList: { enabled: false } })
    expect(screen.queryByRole('button', { name: 'Join the waitlist' })).not.toBeInTheDocument()
    expect(screen.getByText('Your account')).toBeInTheDocument()
  })

  it('is offered with the school label, above the account card', () => {
    renderStep()
    expect(screen.getByText(/Join the waitlist for 2027-28 school year\. No account or payment needed\./)).toBeInTheDocument()
    expect(screen.getByText('Your account')).toBeInTheDocument()
  })

  it('opens the form, and Go back returns to the account step', () => {
    renderStep()
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }))
    expect(screen.getByText('Join the waitlist for 2027-28 school year')).toBeInTheDocument()
    expect(screen.queryByText('Your account')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Go back/ }))
    expect(screen.getByText('Your account')).toBeInTheDocument()
  })

  it('asks for a birthday before it sends', async () => {
    renderStep()
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }))
    fillParent()
    type("Child's first name", 'Ava')
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Enter Ava's date of birth.")
    expect(api.post).not.toHaveBeenCalled()
  })

  it('sends the family and shows the confirmation', async () => {
    renderStep()
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }))
    fillParent()
    type("Child's first name", 'Ava')
    type('Date of birth', '2022-03-14')
    fireEvent.click(screen.getByText('+ Add another child'))
    // A second card left empty is dropped, not refused.
    type('Which grade or program are you interested in? (optional)', 'Kindergarten')
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/api/registration/interest-list')
    expect(body).toMatchObject({
      code: 'CODE123', parent_first_name: 'Pat', parent_last_name: 'Parent',
      email: 'pat@example.com', interest: 'Kindergarten', website: '',
      children: [{ first_name: 'Ava', dob: '2022-03-14' }],
    })
    expect(await screen.findByText('You are on the waitlist')).toBeInTheDocument()
    expect(screen.getByText(/We sent a confirmation to pat@example.com/)).toBeInTheDocument()
  })

  it("shows the server's reason when it refuses", async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'This school is not taking waitlist sign-ups right now.' } } })
    renderStep()
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }))
    fillParent()
    type("Child's first name", 'Ava')
    type('Date of birth', '2022-03-14')
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not taking waitlist sign-ups')
  })

  it('sends nothing in preview mode', async () => {
    renderStep({ previewMode: true })
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }))
    fillParent()
    type("Child's first name", 'Ava')
    type('Date of birth', '2022-03-14')
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }))
    expect(await screen.findByText(/Preview mode: nothing was saved/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })
})
