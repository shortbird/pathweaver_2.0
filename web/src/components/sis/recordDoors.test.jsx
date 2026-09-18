import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RecordDoorsProvider, useRecordDoors } from './RecordDoors'

/**
 * RecordDoors: the console's one mount of a student's record (M13a) and of a
 * family's (M13b).
 *
 * Any page, panel or roster calls openStudent with a row it holds or just an
 * id; the provider fetches the person for an id, mounts the one modal, and
 * after a save re-reads the person and calls the opener back. openFamily
 * takes a household id (or row), reads the household from the families query
 * -- so a save that invalidates it refreshes the open record -- and lands on
 * the asked-for tab. Outside the provider the doors are closed: both openers
 * do nothing, which is what a page rendered bare in another test gets.
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
// The modals themselves are tested elsewhere; here they are stubs that can "save".
vi.mock('../../pages/sis/StudentDetailModal', () => ({
  default: ({ student, onSaved, onClose }) => (
    <div>
      <p>RECORD {student.name}</p>
      <button onClick={onSaved}>save</button>
      <button onClick={onClose}>close</button>
    </div>
  ),
}))
vi.mock('../../pages/sis/FamilyDetailModal', () => ({
  default: ({ household, members, initialTab, onSaved, onClose }) => (
    <div>
      <p>FAMILY {household.name} on {initialTab || 'family'} with {members.length} to pick from</p>
      <button onClick={onSaved}>save family</button>
      <button onClick={onClose}>close family</button>
    </div>
  ),
}))

const Opener = ({ arg, onSaved }) => {
  const { openStudent } = useRecordDoors()
  return <button onClick={() => openStudent(arg, { onSaved })}>open</button>
}

const FamilyOpener = ({ arg, tab, onSaved }) => {
  const { openFamily } = useRecordDoors()
  return <button onClick={() => openFamily(arg, { tab, onSaved })}>open family</button>
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
    if (url.startsWith('/api/sis/households')) {
      return Promise.resolve({ data: { households: [{ id: 'h1', name: 'Ant', members: [] }] } })
    }
    if (url.startsWith('/api/sis/members')) return Promise.resolve({ data: { members: [] } })
    if (url.startsWith('/api/sis/unassigned-students')) return Promise.resolve({ data: { students: [] } })
    if (url.startsWith('/api/sis/roster')) {
      return Promise.resolve({ data: { roster: [{ student_id: 's1', name: 'Ada Ant', is_student: true }] } })
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

  it('opens a family by id on the asked-for tab, from the families query, and calls back on save', async () => {
    const onSaved = vi.fn()
    render(
      <RecordDoorsProvider>
        <FamilyOpener arg="h1" tab="billing" onSaved={onSaved} />
      </RecordDoorsProvider>,
    )
    expect(api.get).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('open family'))
    expect(await screen.findByText('FAMILY Ant on billing with 1 to pick from')).toBeInTheDocument()
    fireEvent.click(screen.getByText('save family'))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    fireEvent.click(screen.getByText('close family'))
    expect(screen.queryByText(/FAMILY Ant/)).not.toBeInTheDocument()
  })

  it('closes with a word when the family is not in this school', async () => {
    const { toast } = await import('react-hot-toast')
    render(
      <RecordDoorsProvider>
        <FamilyOpener arg="nope" />
      </RecordDoorsProvider>,
    )
    fireEvent.click(screen.getByText('open family'))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('That family is not in this school'))
    expect(screen.queryByText(/FAMILY/)).not.toBeInTheDocument()
  })

  it('is a closed door outside the provider', () => {
    render(<Opener arg={{ student_id: 's1', name: 'Ada Ant' }} />)
    fireEvent.click(screen.getByText('open'))
    expect(screen.queryByText('RECORD Ada Ant')).not.toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })
})
