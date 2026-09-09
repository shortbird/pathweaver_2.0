/**
 * Absence reporting — multi-child selection.
 *
 * A guardian with several children out on the same day files one report, not
 * one per child. What's tested is what would hurt a family if wrong: the POST
 * carrying every selected child, the class picker narrowing to classes the
 * selected children share, the merged upcoming list saying whose absence is
 * whose, and a partial failure (one duplicate sibling) not being reported as
 * total success.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
vi.mock('../services/api', () => ({ default: api }))

import AbsenceReportingPage from './AbsenceReportingPage'

const CONTEXT = {
  data: {
    orgs: [{
      organization_id: 'org-1',
      organization_name: 'Optio Academy',
      students: [
        { student_id: 'kid-1', name: 'Ada' },
        { student_id: 'kid-2', name: 'Linus' },
      ],
    }],
  },
}

// Ada and Linus share Choir; only Ada takes Pottery.
const BY_STUDENT = {
  'kid-1': {
    absences: [{ id: 'a1', student_user_id: 'kid-1', absence_date: '2026-08-30', class_id: null, reason: 'trip' }],
    classes: [{ class_id: 'cl1', name: 'Pottery' }, { class_id: 'cl2', name: 'Choir' }],
  },
  'kid-2': {
    absences: [{ id: 'a2', student_user_id: 'kid-2', absence_date: '2026-08-28', class_id: null, reason: null }],
    classes: [{ class_id: 'cl2', name: 'Choir' }],
  },
}

const mockPage = () => {
  api.get.mockImplementation((url) => {
    if (url.includes('/parent/context')) return Promise.resolve(CONTEXT)
    if (url.includes('/parent/absences')) {
      const sid = url.split('student_user_id=')[1]
      return Promise.resolve({ data: BY_STUDENT[sid] })
    }
    return Promise.resolve({ data: {} })
  })
}

const selectLinusToo = async () => {
  render(<AbsenceReportingPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'Linus' }))
}

beforeEach(() => vi.clearAllMocks())

describe('AbsenceReportingPage multi-child selection', () => {
  it('defaults to the first child and toggles siblings on and off', async () => {
    mockPage()
    render(<AbsenceReportingPage />)
    const ada = await screen.findByRole('button', { name: 'Ada' })
    const linus = screen.getByRole('button', { name: 'Linus' })
    expect(ada).toHaveAttribute('aria-pressed', 'true')
    expect(linus).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(linus)
    expect(linus).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(ada)
    expect(ada).toHaveAttribute('aria-pressed', 'false')
  })

  it('posts every selected child in one report', async () => {
    mockPage()
    api.post.mockResolvedValue({
      data: {
        absences: [
          { id: 'n1', student_user_id: 'kid-1' },
          { id: 'n2', student_user_id: 'kid-2' },
        ],
        errors: {},
      },
    })
    await selectLinusToo()
    await userEvent.click(screen.getByRole('button', { name: /report absence/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/parent/absences',
      expect.objectContaining({
        organization_id: 'org-1',
        student_user_ids: ['kid-1', 'kid-2'],
        class_id: null,
      })))
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('2 children'))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('narrows the class picker to classes every selected child shares', async () => {
    mockPage()
    await selectLinusToo()

    const picker = screen.getByLabelText(/what are they missing/i)
    await waitFor(() => {
      const options = within(picker).getAllByRole('option').map((o) => o.textContent)
      expect(options).toEqual(['The whole day', 'Choir'])
    })
  })

  it('merges both children into the upcoming list, soonest first and named', async () => {
    mockPage()
    await selectLinusToo()

    await waitFor(() => expect(screen.getByText('2026-08-28')).toBeInTheDocument())
    const rows = screen.getAllByRole('button', { name: 'Cancel' })
      .map((b) => b.closest('div').textContent)
    expect(rows[0]).toContain('2026-08-28')
    expect(rows[0]).toContain('Linus')
    expect(rows[1]).toContain('2026-08-30')
    expect(rows[1]).toContain('Ada')
  })

  it('sends the end date when a last day is picked', async () => {
    mockPage()
    api.post.mockResolvedValue({
      data: { absences: [{ id: 'n1', student_user_id: 'kid-1' }], errors: {} },
    })
    render(<AbsenceReportingPage />)
    await screen.findByRole('button', { name: 'Ada' })
    fireEvent.change(screen.getByLabelText(/first day/i), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText(/last day/i), { target: { value: '2026-09-05' } })
    await userEvent.click(screen.getByRole('button', { name: /report absence/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/parent/absences',
      expect.objectContaining({ absence_date: '2026-09-01', end_date: '2026-09-05' })))
  })

  it('shows a stored range as one row and cancels it with one call', async () => {
    const range = ['2026-08-25', '2026-08-26', '2026-08-27'].map((d, i) => (
      { id: `r${i}`, student_user_id: 'kid-1', absence_date: d, class_id: null, reason: 'trip' }))
    api.get.mockImplementation((url) => {
      if (url.includes('/parent/context')) return Promise.resolve(CONTEXT)
      if (url.includes('/parent/absences')) {
        const sid = url.split('student_user_id=')[1]
        return Promise.resolve({ data: sid === 'kid-1'
          ? { absences: range, classes: [] }
          : { absences: [], classes: [] } })
      }
      return Promise.resolve({ data: {} })
    })
    api.post.mockResolvedValue({ data: { success: true } })
    render(<AbsenceReportingPage />)

    // Three stored rows, one displayed line, one Cancel.
    await waitFor(() => expect(screen.getByText('2026-08-25 – 2026-08-27')).toBeInTheDocument())
    const cancels = screen.getAllByRole('button', { name: 'Cancel' })
    expect(cancels).toHaveLength(1)
    await userEvent.click(cancels[0])
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/parent/absences/cancel',
      { absence_ids: ['r0', 'r1', 'r2'] }))
  })

  it('a duplicate for one sibling is reported per child, not as total success', async () => {
    mockPage()
    api.post.mockResolvedValue({
      data: {
        absences: [{ id: 'n1', student_user_id: 'kid-1' }],
        errors: { 'kid-2': 'This absence has already been reported' },
      },
    })
    await selectLinusToo()
    await userEvent.click(screen.getByRole('button', { name: /report absence/i }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Ada')))
    expect(toast.error).toHaveBeenCalledWith('Linus: This absence has already been reported')
  })
})
