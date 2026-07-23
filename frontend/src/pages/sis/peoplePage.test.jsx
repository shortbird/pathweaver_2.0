import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Stub the three lenses so this test covers only the tab shell.
vi.mock('./RosterPage', () => ({ default: ({ embedded }) => <div>ROSTER embedded:{String(embedded)}</div> }))
vi.mock('./StaffPage', () => ({ default: ({ embedded }) => <div>STAFF embedded:{String(embedded)}</div> }))
vi.mock('./HouseholdsPage', () => ({ default: ({ embedded }) => <div>FAMILIES embedded:{String(embedded)}</div> }))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'o1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false }),
}))

import PeoplePage from './PeoplePage'

const renderAt = (path = '/people') =>
  render(<MemoryRouter initialEntries={[path]}><PeoplePage /></MemoryRouter>)

describe('PeoplePage tab shell', () => {
  it('shows the three lenses and defaults to Everyone, rendered embedded', () => {
    renderAt()
    expect(screen.getByText('People')).toBeInTheDocument()
    expect(screen.getByText('Everyone')).toBeInTheDocument()
    expect(screen.getByText('Staff')).toBeInTheDocument()
    expect(screen.getByText('Families')).toBeInTheDocument()
    expect(screen.getByText('ROSTER embedded:true')).toBeInTheDocument()
  })

  it('switches lens when a tab is clicked', () => {
    renderAt()
    fireEvent.click(screen.getByText('Families'))
    expect(screen.getByText('FAMILIES embedded:true')).toBeInTheDocument()
    expect(screen.queryByText(/ROSTER/)).not.toBeInTheDocument()
  })

  it('honors the ?tab= query param on load (deep link / redirect target)', () => {
    renderAt('/people?tab=staff')
    expect(screen.getByText('STAFF embedded:true')).toBeInTheDocument()
  })
})
