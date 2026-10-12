import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import FamilyContactsCard from './FamilyContactsCard'

/**
 * Who to contact, the SIS Settings card. Ticket c58b7c0b (iCreate, org admin):
 * "On parent dashboards, could we create a section where there is who to
 * contact info? So they can get in touch with the right person for what they
 * need without having to go through multiple people..."
 *
 * The card PATCHes the one key it owns, in the order shown; the server checks
 * every row again (backend/tests/test_sis_family_contacts.py).
 */

const { api } = vi.hoisted(() => ({ api: { patch: vi.fn(), get: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))
// The combobox is its own component with its own tests; a plain select here.
vi.mock('../../components/ui/SearchSelect', () => ({
  default: ({ value, onChange, options, getId, getLabel, emptyLabel }) => (
    <select aria-label="Staff member" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {options.map((o) => <option key={getId(o)} value={getId(o)}>{getLabel(o)}</option>)}
    </select>
  ),
}))

const org = (sis = {}) => ({ id: 'org-1', feature_flags: { sis_settings: sis } })
const sent = () => api.patch.mock.calls[0][1]

beforeEach(() => {
  vi.clearAllMocks()
  api.patch.mockResolvedValue({ data: {} })
  api.get.mockResolvedValue({ data: { staff: [{ id: 'becky', name: 'Becky Lane' }, { id: 'sharmaine', name: 'Sharmaine Ortiz' }] } })
})

describe('FamilyContactsCard', () => {
  it('adds a contact with a staff member and saves it', async () => {
    render(<FamilyContactsCard orgId="org-1" org={org()} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add contact' }))
    fireEvent.change(screen.getByLabelText('Topic 1'), { target: { value: ' Building questions ' } })
    await screen.findByRole('option', { name: 'Becky Lane' })
    fireEvent.change(screen.getByLabelText('Staff member'), { target: { value: 'becky' } })
    fireEvent.change(screen.getByLabelText('Phone 1'), { target: { value: '801-555-0100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(api.patch.mock.calls[0][0]).toBe('/api/sis/settings?organization_id=org-1')
    expect(sent()).toEqual({ sis_settings: { family_contacts: [
      { topic: 'Building questions', staff_user_id: 'becky', phone: '801-555-0100' },
    ] } })
  })

  it('reorders with up and down, and removes', async () => {
    render(<FamilyContactsCard orgId="org-1" org={org({ family_contacts: [
      { topic: 'Building', name: 'Becky' },
      { topic: 'Classes', staff_user_id: 'sharmaine' },
      { topic: 'Late pick-up', name: 'Front desk' },
    ] })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Move contact 2 up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove contact 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(sent().sis_settings.family_contacts.map((c) => c.topic)).toEqual(['Classes', 'Building'])
  })

  it('removing every contact clears the key', async () => {
    render(<FamilyContactsCard orgId="org-1" org={org({ family_contacts: [{ topic: 'Building', name: 'Becky' }] })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove contact 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(sent()).toEqual({ sis_settings: { family_contacts: null } })
  })

  it('shows the server refusal', async () => {
    api.patch.mockRejectedValue({ response: { data: { error: 'Contact 1 needs a staff member or a name' } } })
    render(<FamilyContactsCard orgId="org-1" org={org()} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add contact' }))
    fireEvent.change(screen.getByLabelText('Topic 1'), { target: { value: 'Building' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Contact 1 needs a staff member or a name')
  })
})
