import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RecordDoorsProvider, useRecordDoors } from './RecordDoors'

/**
 * RecordDoors: the console's one mount of a student's record (M13a).
 *
 * Any page, panel or roster calls openStudent with a row it holds or just an
 * id; the provider fetches the person for an id, mounts the one modal, and
 * after a save re-reads the person and calls the opener back. Outside the
 * provider the door is closed: openStudent does nothing, which is what a
 * page rendered bare in another test gets.
 */

const { api, sisOrg } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  sisOrg: { orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../pages/sis/useSisOrg', () => ({ useSisOrg: () => sisOrg, withOrg: (p) => p }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
// The modal itself is tested elsewhere; here it is a stub that can "save".
vi.mock('../../pages/sis/StudentDetailModal', () => ({
  default: ({ student, onSaved, onClose }) => (
    <div>
      <p>RECORD {student.name}</p>
      <button onClick={onSaved}>save</button>
      <button onClick={onClose}>close</button>
    </div>
  ),
}))

const Opener = ({ arg, onSaved }) => {
  const { openStudent } = useRecordDoors()
  return <button onClick={() => openStudent(arg, { onSaved })}>open</button>
}

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.startsWith('/api/sis/users/s1')) {
      return Promise.resolve({ data: { user: { student_id: 's1', name: 'Ada Ant', is_student: true } } })
    }
    return Promise.resolve({ data: {} })
  })
})

describe('RecordDoors', () => {
  it('opens the record from a row the opener already holds, without a fetch', async () => {
    render(
      <RecordDoorsProvider>
        <Opener arg={{ student_id: 's1', name: 'Ada Ant' }} />
      </RecordDoorsProvider>,
    )
    fireEvent.click(screen.getByText('open'))
    expect(await screen.findByText('RECORD Ada Ant')).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('close'))
    expect(screen.queryByText('RECORD Ada Ant')).not.toBeInTheDocument()
  })

  it('opens the record from an id by fetching the person in the modal shape', async () => {
    render(
      <RecordDoorsProvider>
        <Opener arg="s1" />
      </RecordDoorsProvider>,
    )
    fireEvent.click(screen.getByText('open'))
    expect(await screen.findByText('RECORD Ada Ant')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/sis/users/s1?organization_id=org-1')
  })

  it('after a save, re-reads the person and calls the opener back', async () => {
    const onSaved = vi.fn()
    render(
      <RecordDoorsProvider>
        <Opener arg={{ student_id: 's1', name: 'Ada Ant' }} onSaved={onSaved} />
      </RecordDoorsProvider>,
    )
    fireEvent.click(screen.getByText('open'))
    await screen.findByText('RECORD Ada Ant')
    api.get.mockResolvedValueOnce({ data: { user: { student_id: 's1', name: 'Ada Anteater' } } })
    fireEvent.click(screen.getByText('save'))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(await screen.findByText('RECORD Ada Anteater')).toBeInTheDocument()
  })

  it('is a closed door outside the provider', () => {
    render(<Opener arg={{ student_id: 's1', name: 'Ada Ant' }} />)
    fireEvent.click(screen.getByText('open'))
    expect(screen.queryByText('RECORD Ada Ant')).not.toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })
})
