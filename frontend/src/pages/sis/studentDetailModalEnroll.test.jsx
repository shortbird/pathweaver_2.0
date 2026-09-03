import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * The Schedule tab's Enroll button sends a real request.
 *
 * Gryffin, 2026-08-24: "I search for the class and click Enroll — I get a popup
 * that says 'could not enroll'." The button passed its click event into
 * enroll(force), so the JSON body held a SyntheticEvent — circular via the DOM
 * node's fiber refs — and JSON.stringify threw before the request ever left the
 * browser. No server error, just the fallback toast.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}?organization_id=${orgId}`,
}))
vi.mock('../../contexts/ConfirmContext', () => ({
  useConfirm: () => vi.fn(async () => true),
}))
vi.mock('../../utils/appSurface', () => ({ switchSurfaceInApp: vi.fn() }))
// A native select stands in for the combobox — the test is about what Enroll
// sends, not how the class is picked.
vi.mock('../../components/ui/SearchSelect', () => ({
  default: ({ value, onChange, options, getId, getLabel }) => (
    <select aria-label="class" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {options.map((o) => <option key={getId(o)} value={getId(o)}>{getLabel(o)}</option>)}
    </select>
  ),
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import StudentDetailModal from './StudentDetailModal'

const student = { student_id: 's1', name: 'Test Student', is_student: true }

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.startsWith('/api/sis/students/s1/classes')) return Promise.resolve({ data: { classes: [] } })
    if (url.startsWith('/api/sis/classes')) return Promise.resolve({ data: { classes: [{ id: 'c1', name: 'Geometry' }] } })
    return Promise.resolve({ data: {} })
  })
  api.post.mockResolvedValue({ data: { success: true } })
})

describe('StudentDetailModal Schedule enroll', () => {
  it('posts a JSON-serializable body with force: false, not the click event', async () => {
    render(<StudentDetailModal student={student} orgId="org-1" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    await screen.findByText('Enroll in a class')

    fireEvent.change(screen.getByLabelText('class'), { target: { value: 'c1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enroll' }))

    await vi.waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/api/sis/classes/c1/enrollments')
    expect(body).toEqual({ student_user_id: 's1', force: false })
    expect(() => JSON.stringify(body)).not.toThrow()
  })
})
