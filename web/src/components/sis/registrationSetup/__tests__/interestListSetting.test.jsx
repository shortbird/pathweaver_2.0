/**
 * The school's "Join the waitlist" switch on the Registration form tab's
 * Account step. It saves on its own and names only its own block
 * (registration.interest_list) -- the server merges registration one key deep,
 * so the rest of the funnel config is never sent back from this card.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { patchSisSettings } = vi.hoisted(() => ({ patchSisSettings: vi.fn(async () => ({})) }))
vi.mock('../../../../hooks/api/useSisSettings', () => ({ patchSisSettings }))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import AccountStepPreview from '../AccountStepPreview'

const org = (interest_list) => ({ id: 'org-1', name: 'Apogee NoCo', feature_flags: { registration: { enabled: true, interest_list } } })

const renderPreview = (o, onUpdate = vi.fn()) => render(
  <AccountStepPreview org={o} orgId="org-1" onUpdate={onUpdate}
    openZones={new Set(['interest_list'])} toggleZone={vi.fn()} />,
)

describe('waitlist sign-up setting', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the off state and turns it on with only its own block', async () => {
    const onUpdate = vi.fn()
    renderPreview(org(undefined), onUpdate)
    expect(screen.getByText(/Waitlist sign-up is off/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Let families join a waitlist before they register'))
    await waitFor(() => expect(patchSisSettings).toHaveBeenCalledWith('org-1', {
      registration: { interest_list: { enabled: true, label: '' } },
    }))
    expect(onUpdate).toHaveBeenCalled()
  })

  it('previews the door families see and saves a new label', async () => {
    renderPreview(org({ enabled: true, label: '2027-28 school year' }))
    expect(screen.getByText(/Join the waitlist for 2027-28 school year/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/What are they waiting for/), { target: { value: 'Fall 2027' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save label' }))
    await waitFor(() => expect(patchSisSettings).toHaveBeenCalledWith('org-1', {
      registration: { interest_list: { enabled: true, label: 'Fall 2027' } },
    }))
  })
})
