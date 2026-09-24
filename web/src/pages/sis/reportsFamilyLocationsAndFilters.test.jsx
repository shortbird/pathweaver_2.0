import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  EMPTY_ANSWER_FILTERS, NONE, agesCell, answerFilterOptions, daysCell, filterAnswerRows,
} from './reportsPage/answerFilterRules'

/**
 * Two iCreate tickets from Katrine Myers (campus coordinator), 2026-09-24.
 *
 * 1a54e05a: "Is there a way I could see some kind of aggregate list for where
 * the families live? I have some families asking whether others might be
 * interested in carpooling and although that option is available to post, it
 * would be convenient to know so I could help it along."
 *
 * 50616794, on the registration answers report: "this would be the best spot
 * to be able to filter the families info by selection. So more questions might
 * be, sort families by age of children. Sort families by location, or form of
 * payment, or students who only come one day, etc."
 */

const render = (ui, { route = '/reports' } = {}) =>
  rtlRender(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_managed', org_role: 'campus_coordinator', org_roles: ['campus_coordinator'] } }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => ({ organization: { id: 'org-1', name: 'Org' } }) }))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, downloads } = vi.hoisted(() => ({ api: {}, downloads: [] }))

// Four families. Ames: two kids (8, comes 1 day; 12, comes 2 days), Lehi,
// UFA + Self-Pay. Bell: one kid (11, 0 days), no city, no payment answer.
// Cole: one kid (7, 1 day), lehi (lower case), Self-Pay. Dunn: one kid (7,
// 3 days), Orem, OpenED.
const ROWS = [
  { student: 'Ada Ames; Ben Ames', family: 'Ames', parent: 'Pat Ames', parent_email: 'pat@example.com',
    answer: 'Hot; Cold', answer_values: ['Hot', 'Cold'], status: 'completed', city: 'Lehi', state: 'UT',
    payment_methods: ['Utah Fits All', 'Self-Pay'],
    kids: [{ name: 'Ada Ames', age: 8, days_per_week: 1, days: 'Tue', unscheduled: false },
      { name: 'Ben Ames', age: 12, days_per_week: 2, days: 'Tue Thu', unscheduled: false }] },
  { student: 'Cal Bell', family: 'Bell', parent: 'Sam Bell', parent_email: 'sam@example.com',
    answer: 'Hot', answer_values: ['Hot'], status: 'completed', city: '', state: '',
    payment_methods: [],
    kids: [{ name: 'Cal Bell', age: 11, days_per_week: 0, days: '', unscheduled: false }] },
  { student: 'Cy Cole', family: 'Cole', parent: 'Jo Cole', parent_email: 'jo@example.com',
    answer: 'Cold', answer_values: ['Cold'], status: 'completed', city: 'lehi', state: 'UT',
    payment_methods: ['Self-Pay'],
    kids: [{ name: 'Cy Cole', age: 7, days_per_week: 1, days: 'Mon', unscheduled: false }] },
  { student: 'Di Dunn', family: 'Dunn', parent: 'Lee Dunn', parent_email: 'lee@example.com',
    answer: 'Hot', answer_values: ['Hot'], status: 'completed', city: 'Orem', state: 'UT',
    payment_methods: ['OpenED'],
    kids: [{ name: 'Di Dunn', age: 7, days_per_week: 3, days: 'Mon Tue Thu', unscheduled: false }] },
]

const LOCATIONS = {
  total_families: 4, carpool_families: 1, no_city_families: 1,
  cities: [
    { city: 'Lehi', no_city: false, states: ['UT'], family_count: 2, carpool_count: 1, families: [
      { household_id: 'h1', name: 'Ames', city: 'Lehi', state: 'UT', postal_code: '84043',
        carpool_interest: true, guardians: ['Pat Ames'], students: ['Ada Ames', 'Ben Ames'] },
      { household_id: 'h3', name: 'Cole', city: 'lehi', state: 'UT', postal_code: '84043',
        carpool_interest: false, guardians: ['Jo Cole'], students: ['Cy Cole'] },
    ] },
    { city: 'Orem', no_city: false, states: ['UT'], family_count: 1, carpool_count: 0, families: [
      { household_id: 'h4', name: 'Dunn', city: 'Orem', state: 'UT', postal_code: '84057',
        carpool_interest: null, guardians: ['Lee Dunn'], students: ['Di Dunn'] },
    ] },
    { city: 'No city on file', no_city: true, states: [], family_count: 1, carpool_count: 0, families: [
      { household_id: 'h2', name: 'Bell', city: '', state: '', postal_code: '',
        carpool_interest: null, guardians: ['Sam Bell'], students: ['Cal Bell'] },
    ] },
  ],
}

api.get = vi.fn((url) => {
  if (url.includes('/reports/registration-questions')) {
    return Promise.resolve({ data: { questions: [{ key: 'lunch', label: 'Lunch', type: 'multi', per_student: false }] } })
  }
  if (url.includes('/reports/registration-answers')) {
    return Promise.resolve({ data: { report: { question: { key: 'lunch', label: 'Lunch', per_student: false }, rows: ROWS } } })
  }
  if (url.includes('/reports/family-locations')) return Promise.resolve({ data: { report: LOCATIONS } })
  if (url.includes('/api/sis/classes')) return Promise.resolve({ data: { classes: [] } })
  return Promise.resolve({ data: {} })
})
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../utils/csv', async (orig) => {
  const real = await orig()
  return { ...real, downloadCsv: (text, name) => downloads.push({ text, name }) }
})

import ReportsPage from './ReportsPage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_managed', org_role: 'campus_coordinator', org_roles: ['campus_coordinator'] } }
  downloads.length = 0
  api.get.mockClear()
})

const openReport = async (title) => {
  const nav = await screen.findByRole('navigation', { name: 'Reports' })
  fireEvent.click(within(nav).getByRole('button', { name: title }))
}

const bodyFamilies = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[1].textContent)

// ── 50616794: the rules, pure ────────────────────────────────────────────────

describe('registration answer filters (50616794)', () => {
  const run = (f) => filterAnswerRows(ROWS, { ...EMPTY_ANSWER_FILTERS, ...f }).map((r) => r.family)

  it('no filters keeps every row', () => {
    expect(run({})).toEqual(['Ames', 'Bell', 'Cole', 'Dunn'])
  })

  it('filters by the selected answer, including one value of a multi-select', () => {
    expect(run({ answer: 'Cold' })).toEqual(['Ames', 'Cole'])
    expect(run({ answer: 'Hot' })).toEqual(['Ames', 'Bell', 'Dunn'])
  })

  it('filters by city, however it was typed, and by no city on file', () => {
    expect(run({ city: 'Lehi' })).toEqual(['Ames', 'Cole'])
    expect(run({ city: NONE })).toEqual(['Bell'])
  })

  it("filters by the family's own form of payment, and by families who did not say", () => {
    expect(run({ payment: 'Self-Pay' })).toEqual(['Ames', 'Cole'])
    expect(run({ payment: 'Utah Fits All' })).toEqual(['Ames'])
    expect(run({ payment: NONE })).toEqual(['Bell'])
  })

  it('"students who only come one day"', () => {
    expect(run({ days: '1' })).toEqual(['Ames', 'Cole'])
    expect(run({ days: '0' })).toEqual(['Bell'])
  })

  it('filters by child age range, either end open', () => {
    expect(run({ ageMin: '7', ageMax: '8' })).toEqual(['Ames', 'Cole', 'Dunn'])
    expect(run({ ageMin: '12' })).toEqual(['Ames'])
    expect(run({ ageMax: '7' })).toEqual(['Cole', 'Dunn'])
  })

  it('age and days must fit the same child', () => {
    // Ames has an 8-year-old who comes 1 day and a 12-year-old who comes 2.
    expect(run({ ageMin: '12', days: '1' })).toEqual([])
    expect(run({ ageMin: '12', days: '2' })).toEqual(['Ames'])
  })

  it('filters combine', () => {
    expect(run({ city: 'Lehi', payment: 'Self-Pay', days: '1', ageMax: '7' })).toEqual(['Cole'])
    expect(run({ answer: 'Hot', city: 'Orem' })).toEqual(['Dunn'])
  })

  it('offers only the values the rows hold', () => {
    const o = answerFilterOptions(ROWS)
    expect(o.answers).toEqual(['Cold', 'Hot'])
    expect(o.cities).toEqual(['Lehi', 'Orem'])
    expect(o.noCity).toBe(true)
    expect(o.payments).toEqual(['OpenED', 'Self-Pay', 'Utah Fits All'])
    expect(o.days).toEqual([0, 1, 2, 3])
  })

  it('writes ages youngest first and names each child on a several-child row', () => {
    expect(agesCell(ROWS[0].kids)).toBe('8, 12')
    expect(daysCell(ROWS[0].kids)).toBe('Ada: 1, Ben: 2')
    expect(daysCell(ROWS[3].kids)).toBe('3')
    expect(daysCell([{ name: 'X', days_per_week: 1, unscheduled: true }])).toBe('1 + unscheduled class')
  })
})

// ── 50616794: on the page ────────────────────────────────────────────────────

const runAnswers = async () => {
  render(<ReportsPage />)
  await openReport('Registration answers')
  await screen.findByRole('option', { name: 'Lunch' })
  fireEvent.change(screen.getByLabelText('Registration question'), { target: { value: 'lunch' } })
  fireEvent.click(screen.getByRole('button', { name: 'Run report' }))
  await screen.findByText('pat@example.com')
}

describe('Registration answers report, filtered on the page (50616794)', () => {
  it('shows the filters and the new columns once the report runs', async () => {
    await runAnswers()
    for (const label of ['Filter by answer', 'Filter by city', 'Filter by form of payment',
      'Filter by days per week', 'Youngest age', 'Oldest age', 'Sort families by']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    for (const col of ['City', 'Ages', 'Days per week', 'Form of payment']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${col}`) })).toBeInTheDocument()
    }
    expect(screen.getByText('Showing 4 of 4')).toBeInTheDocument()
  })

  it('narrows the table without asking the server again, and clears', async () => {
    await runAnswers()
    const calls = api.get.mock.calls.length
    fireEvent.change(screen.getByLabelText('Filter by city'), { target: { value: 'Lehi' } })
    fireEvent.change(screen.getByLabelText('Filter by days per week'), { target: { value: '1' } })
    expect(bodyFamilies().sort()).toEqual(['Ames', 'Cole'])
    expect(screen.getByText('Showing 2 of 4')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Oldest age'), { target: { value: '7' } })
    expect(bodyFamilies()).toEqual(['Cole'])
    expect(api.get.mock.calls.length).toBe(calls)
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(bodyFamilies()).toHaveLength(4)
  })

  it('sorts by family, by youngest child, and by city with no city last', async () => {
    await runAnswers()
    fireEvent.change(screen.getByLabelText('Sort families by'), { target: { value: 'family' } })
    expect(bodyFamilies()).toEqual(['Ames', 'Bell', 'Cole', 'Dunn'])
    fireEvent.change(screen.getByLabelText('Sort families by'), { target: { value: 'age' } })
    // Youngest child: Cole 7, Dunn 7, Ames 8, Bell 11.
    expect(bodyFamilies()).toEqual(['Cole', 'Dunn', 'Ames', 'Bell'])
    fireEvent.change(screen.getByLabelText('Sort families by'), { target: { value: 'city' } })
    const fams = bodyFamilies()
    expect(fams.slice(0, 2).sort()).toEqual(['Ames', 'Cole'])   // lehi / Lehi
    expect(fams.slice(2)).toEqual(['Dunn', 'Bell'])              // Orem, then no city
  })

  it('downloads the filtered rows, not the whole report', async () => {
    await runAnswers()
    fireEvent.change(screen.getByLabelText('Filter by form of payment'), { target: { value: 'OpenED' } })
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    expect(downloads).toHaveLength(1)
    expect(downloads[0].text).toContain('Dunn')
    expect(downloads[0].text).not.toContain('Ames')
    expect(downloads[0].text.split('\r\n')[0]).toContain('Form of payment')
  })
})

// ── 1a54e05a: where families live ────────────────────────────────────────────

describe('Where families live (1a54e05a)', () => {
  it('is offered to a campus coordinator and runs when picked', async () => {
    render(<ReportsPage />)
    await openReport('Where families live')
    expect(await screen.findByText(/4 families in 2 cities/)).toBeInTheDocument()
    expect(screen.getByText(/1 want to carpool · 1 with no city on file/)).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/reports/family-locations'))
  })

  it('counts families per city and lists them when a city is opened', async () => {
    render(<ReportsPage />, { route: '/reports?report=family-locations' })
    const lehi = (await screen.findByText('Lehi')).closest('details')
    expect(within(lehi).getByText('2 families')).toBeInTheDocument()
    expect(within(lehi).getByText(/1 want to carpool/)).toBeInTheDocument()
    fireEvent.click(within(lehi).getByText('Lehi'))
    expect(within(lehi).getByText('Ames')).toBeInTheDocument()
    expect(within(lehi).getByText('Wants to carpool')).toBeInTheDocument()
    expect(within(lehi).getByText('No carpool')).toBeInTheDocument()
  })

  it('shows families with no city under "No city on file", and an unanswered carpool as such', async () => {
    render(<ReportsPage />, { route: '/reports?report=family-locations' })
    const none = (await screen.findByText('No city on file')).closest('details')
    expect(within(none).getByText('Bell')).toBeInTheDocument()
    expect(within(none).getByText('Carpool not answered')).toBeInTheDocument()
  })

  it('narrows to the families who want to carpool', async () => {
    render(<ReportsPage />, { route: '/reports?report=family-locations' })
    await screen.findByText('Orem')
    fireEvent.click(screen.getByLabelText('Only families who want to carpool'))
    expect(screen.queryByText('Orem')).not.toBeInTheDocument()
    expect(screen.queryByText('Cole')).not.toBeInTheDocument()
    expect(screen.getByText('Ames')).toBeInTheDocument()
  })
})
