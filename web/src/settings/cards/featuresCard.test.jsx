import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import FeaturesCard from './FeaturesCard'
import { settingsCardsFor } from '../settingsRegistry'

/**
 * The school's own feature switches (docs/MICROSCHOOL_FIRST_PLAN.md part 3).
 *
 * What holds: an org admin sees the features grouped with one plain sentence
 * each; a feature that needs another says so and cannot be switched on until
 * that one is; a save re-reads the org so the sidebar follows; a caller the
 * API refuses (a campus coordinator) sees nothing.
 */

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))
const { confirm } = vi.hoisted(() => ({ confirm: vi.fn() }))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => confirm }))

const GROUPS = [
  { key: 'teaching', name: 'Teaching' },
  { key: 'families', name: 'Families and registration' },
  { key: 'money', name: 'Money' },
  { key: 'office', name: 'Office' },
]

const payload = (on) => ({
  groups: GROUPS,
  features: [
    { key: 'attendance', group: 'teaching', name: 'Attendance', description: 'Take roll each day.', enabled: true, requires: [] },
    { key: 'registration', group: 'families', name: 'Registration', description: 'Families enroll online.', enabled: on.registration, requires: [] },
    { key: 'billing', group: 'money', name: 'Tuition and invoices', description: 'Bill families.', enabled: false, requires: ['registration'] },
    { key: 'tasks', group: 'office', name: 'Tasks', description: 'Give people tasks.', enabled: false, requires: [] },
  ],
})

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { data: payload({ registration: false }) } })
  api.put.mockImplementation((_url, body) =>
    Promise.resolve({ data: { data: payload({ registration: Boolean(body.registration) }) } }))
})

const bothOn = () => ({
  groups: GROUPS,
  features: payload({ registration: true }).features.map((f) =>
    (f.key === 'billing' ? { ...f, enabled: true } : f)),
})

describe('turning off a feature another one needs', () => {
  // Found on localhost 2026-10-07: Registration would not turn off while
  // Tuition and invoices was on, and the refusal showed at the top of the
  // card, out of sight. Now the card asks, then turns both off together.
  beforeEach(() => {
    api.get.mockResolvedValue({ data: { data: bothOn() } })
    api.put.mockResolvedValue({ data: { data: payload({ registration: false }) } })
  })

  it('asks first and sends both switches in one save', async () => {
    confirm.mockResolvedValue(true)
    render(<FeaturesCard orgId="org-1" />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Registration' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(confirm.mock.calls[0][0].body).toMatch(/Tuition and invoices needs Registration/)
    expect(api.put.mock.calls[0][1]).toEqual({ registration: false, billing: false })
  })

  it('changes nothing when the admin keeps them on', async () => {
    confirm.mockResolvedValue(false)
    render(<FeaturesCard orgId="org-1" />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Registration' }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(api.put).not.toHaveBeenCalled()
  })

  it('does not ask when nothing depends on the feature', async () => {
    render(<FeaturesCard orgId="org-1" />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Attendance' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(confirm).not.toHaveBeenCalled()
    expect(api.put.mock.calls[0][1]).toEqual({ attendance: false })
  })
})

describe('FeaturesCard', () => {
  it('groups the features and shows each one plainly', async () => {
    render(<FeaturesCard orgId="org-1" />)
    expect(await screen.findByText('Features')).toBeInTheDocument()
    for (const g of ['Teaching', 'Families and registration', 'Money', 'Office']) {
      expect(screen.getByText(g)).toBeInTheDocument()
    }
    expect(screen.getByText('Take roll each day.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Attendance' })).toHaveAttribute('aria-checked', 'true')
    expect(api.get).toHaveBeenCalledWith('/api/school-features', { params: { organization_id: 'org-1' } })
  })

  it('disables a feature until what it needs is on, then lets it be switched', async () => {
    const onUpdate = vi.fn()
    const onLogoChange = vi.fn()
    render(<FeaturesCard orgId="org-1" onUpdate={onUpdate} onLogoChange={onLogoChange} />)
    const billing = await screen.findByRole('switch', { name: 'Tuition and invoices' })
    expect(billing).toBeDisabled()
    expect(screen.getByText('Needs Registration')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'Registration' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(api.put.mock.calls[0][0]).toBe('/api/school-features')
    expect(api.put.mock.calls[0][1]).toEqual({ registration: true })
    expect(api.put.mock.calls[0][2]).toEqual({ params: { organization_id: 'org-1' } })

    await waitFor(() => expect(screen.getByRole('switch', { name: 'Tuition and invoices' })).not.toBeDisabled())
    expect(screen.queryByText('Needs Registration')).toBeNull()
    // The org is re-read so the sidebar and the other cards follow.
    expect(onUpdate).toHaveBeenCalled()
    expect(onLogoChange).toHaveBeenCalled()
  })

  it('shows the server’s reason on the row that was switched', async () => {
    api.put.mockRejectedValue({ response: { status: 409, data: { error: 'Tuition and invoices needs Registration. Turn Tuition and invoices off first.' } } })
    render(<FeaturesCard orgId="org-1" />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Tasks' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Turn Tuition and invoices off first')
  })

  it('renders nothing when the caller is not an org admin', async () => {
    api.get.mockRejectedValue({ response: { status: 403 } })
    const { container } = render(<FeaturesCard orgId="org-1" />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})

describe('settingsCardsFor: the Features card', () => {
  const keys = (surface, org) => settingsCardsFor({ surface, org, seesFinance: true }).map((c) => c.key)

  it('is on the SIS Settings page only, whatever is switched on', () => {
    expect(keys('console', { feature_flags: {}, effective_modules: [] })).toContain('features')
    expect(keys('learning', { feature_flags: {} })).not.toContain('features')
  })
})


describe('every option, and Ask Optio (2026-10-08)', () => {
  const withOptio = () => ({
    groups: GROUPS,
    features: [
      ...payload({ registration: false }).features,
      { key: 'bloomy', group: 'teaching', name: 'Bloomy', description: 'Bloomy work comes in.', enabled: false, requires: [], switchable: false },
      { key: 'ai', group: 'teaching', name: 'AI helpers', description: 'AI helps.', enabled: true, requires: [], switchable: false },
    ],
  })

  beforeEach(() => {
    api.get.mockResolvedValue({ data: { data: withOptio() } })
    api.post.mockResolvedValue({ data: { data: { requested: true, ticket_id: 't1' } } })
  })

  it('lists what only Optio turns on, with no switch', async () => {
    render(<FeaturesCard orgId="org-1" />)
    expect(await screen.findByText('Bloomy')).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Bloomy' })).not.toBeInTheDocument()
    expect(screen.getByText('On')).toBeInTheDocument()
  })

  it('Ask Optio files the request and says it was asked', async () => {
    render(<FeaturesCard orgId="org-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Optio to turn on Bloomy' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/school-features/request', { key: 'bloomy' }, { params: { organization_id: 'org-1' } }))
    expect(await screen.findByText('Asked')).toBeInTheDocument()
  })
})
