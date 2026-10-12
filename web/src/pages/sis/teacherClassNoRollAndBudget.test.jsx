import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TeacherClassPage from './TeacherClassPage'
import { rollText } from '../../components/sis/RollStatus'

/**
 * Two iCreate tickets on the teacher's class page.
 *
 * 29dff954 (org admin): "Can we have some classes not require attendance? Like
 * this would be useful for our At Home days and independent study." A class
 * with attendance_optional shows its roster without the roll.
 *
 * e7a50b4b (advisor on /my-classes/<id>): "I would like to see what I have
 * spent on each class supply budget already/how much I have left." The budget
 * card showed only on the Roster tab and had no way to record spend.
 */

const render = (ui, path = '/my-classes/c1') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/my-classes/:classId" element={ui} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', isAdmin: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../components/sis/StudentProgressTab', () => ({ default: () => <div /> }))
vi.mock('../../components/discussion/ClassCurriculum', () => ({ default: () => <div /> }))
vi.mock('../../components/sis/ClassCurriculumLibrary', () => ({ default: () => <div /> }))
vi.mock('../../components/sis/ClassQuestsManager', () => ({ default: () => <div /> }))
vi.mock('../../components/sis/ClassMessagesTab', () => ({ default: () => <div>messages tab</div> }))
vi.mock('./teacherPreview', () => ({ getPreviewTeacher: () => null, withPreview: (path) => path }))
vi.mock('../../services/masqueradeService', () => ({ isMasquerading: () => false }))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const BUDGET = {
  total: 100, spent: 30, committed: 30, remaining: 70, students: 4,
  supply_fee_per_student: 25, allowance_per_student: 0, frozen: false, as_of: '2026-10-12',
  transactions: [],
  expenses: [
    { id: 'x1', amount: 30, amount_cents: 3000, description: 'Clay', spent_on: '2026-10-01', can_edit: true },
    { id: 'x2', amount: 0, amount_cents: 0, description: 'Office line', spent_on: '2026-09-01', can_edit: false },
  ],
}

const world = ({ optional = false, budget = BUDGET } = {}) => api.get.mockImplementation((url) => {
  if (url.includes('/roster')) {
    return Promise.resolve({ data: {
      class: { id: 'c1', name: 'At Home Day', attendance_optional: optional },
      supply_budget: budget,
      students: [{ student_id: 's1', name: 'Ada' }],
    } })
  }
  if (url.includes('/attendance')) return Promise.resolve({ data: { roster: [] } })
  return Promise.resolve({ data: {} })
})

beforeEach(() => {
  vi.clearAllMocks()
  api.post.mockResolvedValue({ data: { success: true } })
})

describe('29dff954: a class that takes no roll', () => {
  it('shows the roster without the roll', async () => {
    world({ optional: true })
    render(<TeacherClassPage />)
    expect(await screen.findByText('Attendance is not taken for this class.')).toBeInTheDocument()
    expect(screen.getByText('Ada')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save attendance' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'absent' })).toBeNull()
    expect(screen.queryByText('Roster & Attendance')).toBeNull()
    expect(screen.getByText('Roster')).toBeInTheDocument()
  })

  it('a normal class keeps its roll', async () => {
    world({ optional: false })
    render(<TeacherClassPage />)
    expect(await screen.findByRole('button', { name: 'Save attendance' })).toBeInTheDocument()
    expect(screen.getByText('Roster & Attendance')).toBeInTheDocument()
    expect(screen.queryByText('Attendance is not taken for this class.')).toBeNull()
  })

  it('the dashboard roll line does not say "No roll yet" for such a class', () => {
    expect(rollText({ attendance_optional: true })).toBe('No roll for this class')
    expect(rollText(null)).toBe('No roll yet')
    expect(rollText({})).toBe('No roll yet')
  })
})

describe('e7a50b4b: the supply budget on every tab', () => {
  it('shows budget, spent and left on the Messages tab, not only the roster', async () => {
    world()
    render(<TeacherClassPage />, '/my-classes/c1?tab=messages')
    expect(await screen.findByText('messages tab')).toBeInTheDocument()
    const card = document.querySelector('[data-supply-budget]')
    expect(card).not.toBeNull()
    expect(card.querySelector('[data-spent]').textContent).toBe('$30.00')
    expect(card.querySelector('[data-left]').textContent).toBe('$70.00')
    expect(card.textContent).toContain('up to $100.00')
  })

  it('adds an expense with amount, what and date', async () => {
    world()
    render(<TeacherClassPage />, '/my-classes/c1?tab=curriculum')
    fireEvent.click(await screen.findByRole('button', { name: /Expenses \(2\)/ }))
    expect(screen.getByText('Clay')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '+ Add expense' }))
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12.50' } })
    fireEvent.change(screen.getByLabelText('What you bought'), { target: { value: 'Glaze' } })
    fireEvent.change(screen.getByLabelText('Date spent'), { target: { value: '2026-10-10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/teacher/classes/c1/supply-expenses?organization_id=org-1',
      { amount: '12.50', description: 'Glaze', spent_on: '2026-10-10' }))
  })

  it('offers Edit and Delete only on the lines the caller may change', async () => {
    world()
    render(<TeacherClassPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Expenses \(2\)/ }))
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1)
  })

  it('says over, in red, when the spend passes the budget', async () => {
    world({ budget: { ...BUDGET, spent: 130, committed: 130, remaining: -30 } })
    render(<TeacherClassPage />)
    await screen.findByText('Ada')
    const left = document.querySelector('[data-left]')
    expect(left.textContent).toBe('$30.00')
    expect(left.parentElement.textContent).toContain('over')
  })
})

/**
 * d3139c27 (iCreate advisor, phone): "Only the pictures, not the names appeared
 * for my class on the app. Please include showing the names." The roll row was
 * one fixed line, so the four status buttons took a phone's width and the name
 * (min-w-0, truncate) shrank to nothing. jsdom does no layout, so this pins the
 * two classes that prevent it: the row wraps, and the name keeps a minimum width.
 */
describe('d3139c27: the roll shows names on a phone', () => {
  it('the row wraps and the name keeps a minimum width', async () => {
    world()
    render(<TeacherClassPage />)
    const name = (await screen.findByText('Ada')).closest('[data-roll-name]')
    expect(name).not.toBeNull()
    expect(name.className).toContain('min-w-[8rem]')
    expect(name.className).not.toContain('min-w-0')
    expect(name.closest('[data-roll-row]').className).toContain('flex-wrap')
  })
})
