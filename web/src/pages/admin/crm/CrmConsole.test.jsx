import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import CrmConsole from './CrmConsole'

vi.mock('./FunnelOverview', () => ({ default: () => <p>funnel overview</p> }))
vi.mock('./FunnelEditor', () => ({ default: () => null }))
vi.mock('./StepEditor', () => ({ default: () => null }))
vi.mock('./LeadsList', () => ({ default: () => null }))
vi.mock('./LeadDetail', () => ({ default: () => null }))
vi.mock('./SuppressionList', () => ({ default: () => null }))
vi.mock('./PeopleList', () => ({ default: () => <p>people list</p> }))
vi.mock('./PersonDetail', () => ({ default: () => null }))

const Where = () => <p data-testid="path">{useLocation().pathname}</p>

const mount = (path) =>
  render(
    // Same future flags as App.jsx: v7_relativeSplatPath is what made a
    // relative redirect resolve against the whole unmatched URL.
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/admin/crm/*" element={<><CrmConsole /><Where /></>} />
      </Routes>
    </MemoryRouter>
  )

describe('CrmConsole', () => {
  it('sends an unknown path to the funnels page once, not to .../funnels/funnels/...', async () => {
    mount('/admin/crm/nowhere/at/all')
    expect(await screen.findByText('funnel overview')).toBeInTheDocument()
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/admin\/crm\/funnels$/)
  })

  it('has a People tab', async () => {
    mount('/admin/crm/people')
    expect(await screen.findByText('people list')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'People' })).toBeInTheDocument()
  })
})
