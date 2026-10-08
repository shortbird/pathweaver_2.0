import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BountyCreatePage from './BountyCreatePage'
import { OrganizationContext } from '../contexts/OrganizationContext'

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

const state = vi.hoisted(() => ({
  user: { id: 'coach', role: 'org_managed', org_role: 'advisor', org_roles: ['advisor'], organization_id: 'org-1', first_name: 'Dave', last_name: 'N' },
  surface: 'sis',
  createMutate: vi.fn(),
}))

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }))
vi.mock('../utils/appSurface', () => ({ getAppSurface: () => state.surface }))
vi.mock('../hooks/useHidePillars', () => ({ default: () => false }))
vi.mock('../hooks/api/useFamilyChildren', () => ({ fetchFamilyChildren: () => Promise.resolve([]) }))
vi.mock('../components/bounty/BountyAiDraftPanel', () => ({ default: () => null }))
vi.mock('../hooks/api/useBounties', () => ({
  useCreateBounty: () => ({ mutate: state.createMutate, isPending: false }),
  useBountyDetail: () => ({ data: undefined, isLoading: false }),
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../services/api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { classes: [], students: [] } })), put: vi.fn() },
}))

const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

beforeEach(() => {
  state.surface = 'sis'
  state.createMutate.mockReset()
})

describe('BountyCreatePage', () => {
  it('reads as four numbered parts a newcomer can follow', () => {
    render(<BountyCreatePage />)
    for (const title of ['What is it?', 'Steps to finish', 'Reward', 'Who can take it on?', 'Options']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
    expect(screen.getByText(/XP counts toward school credit/)).toBeInTheDocument()
  })

  it('defaults a school bounty to the school, listed first', () => {
    render(<BountyCreatePage />)
    const radios = screen.getAllByRole('radio')
    expect(radios[0]).toHaveAttribute('value', 'organization')
    expect(radios[0]).toBeChecked()
  })

  it('on the student side a teacher keeps the old public default', () => {
    state.surface = 'learning'
    render(<BountyCreatePage />)
    expect(screen.getByRole('radio', { name: /Everyone on Optio/ })).toBeChecked()
  })

  it('posts a repeatable chore with a prize and a limit from the switches', () => {
    render(<BountyCreatePage />)
    fill('Name', 'Clean the supply room')
    fill('Instructions', 'Put everything back')
    fill('Step 1', 'Photo of the clean shelf')
    fireEvent.click(screen.getByText('Add a prize'))
    fill('Prize', 'Rent one library book')
    fireEvent.click(screen.getByRole('switch', { name: /Repeatable/ }))
    fireEvent.click(screen.getByRole('switch', { name: /Limit how many/ }))
    fill('Up to', '3')
    fireEvent.click(screen.getByText('Post bounty'))
    expect(state.createMutate).toHaveBeenCalledTimes(1)
    const payload = state.createMutate.mock.calls[0][0]
    expect(payload).toMatchObject({
      title: 'Clean the supply room',
      visibility: 'organization',
      repeatable: true,
      max_participants: 3,
      rewards: [{ type: 'custom', text: 'Rent one library book' }],
      deliverables: [{ text: 'Photo of the clean shelf' }],
    })
  })

  it('offers no points at a school that does not run them', () => {
    render(<BountyCreatePage />)
    expect(screen.queryByText('Add points')).not.toBeInTheDocument()
  })

  it('posts a book report with XP and school points', () => {
    const org = { id: 'org-1', effective_modules: ['points'] }
    render(<OrganizationContext.Provider value={{ organization: org }}><BountyCreatePage /></OrganizationContext.Provider>)
    fill('Name', 'Book report')
    fill('Instructions', 'Read a session book and present it')
    fill('Step 1', 'Present to the class')
    fireEvent.click(screen.getByText('Add points'))
    fill('Points amount', '50')
    fireEvent.click(screen.getByText('Post bounty'))
    expect(state.createMutate).toHaveBeenCalledTimes(1)
    expect(state.createMutate.mock.calls[0][0].rewards).toEqual([{ type: 'points', value: 50 }])
  })

  it('a limit switched off sends no limit, whatever number was typed', () => {
    render(<BountyCreatePage />)
    fill('Name', 'Water the plants')
    fill('Instructions', 'Every plant in the hall')
    fill('Step 1', 'Photo of the watered plants')
    const limit = screen.getByRole('switch', { name: /Limit how many/ })
    fireEvent.click(limit)
    fill('Up to', '5')
    fireEvent.click(limit)
    fireEvent.click(screen.getByText('Post bounty'))
    expect(state.createMutate.mock.calls[0][0].max_participants).toBe(0)
  })

  it('asks for proof by default, and a chore can switch it off', () => {
    render(<BountyCreatePage />)
    const proof = screen.getByRole('switch', { name: /Ask for proof on each step/ })
    expect(proof).toHaveAttribute('aria-checked', 'true')
    fill('Name', 'Tidy your desk')
    fill('Instructions', 'Every afternoon')
    fill('Step 1', 'Desk is clear')
    fireEvent.click(proof)
    expect(screen.getByText(/students just tick the step/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Post bounty'))
    expect(state.createMutate.mock.calls[0][0].requires_evidence).toBe(false)
  })

  it('says what is missing in plain words', () => {
    render(<BountyCreatePage />)
    fireEvent.click(screen.getByText('Post bounty'))
    expect(screen.getByText('Give the bounty a name')).toBeInTheDocument()
    expect(screen.getByText('Tell students what to do')).toBeInTheDocument()
    expect(screen.getByText('Add at least one step')).toBeInTheDocument()
    expect(state.createMutate).not.toHaveBeenCalled()
  })
})
