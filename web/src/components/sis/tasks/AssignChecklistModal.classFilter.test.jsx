/**
 * "Pick a class" on the family recipient list of Assign a checklist
 * (ticket a19d5660). An iCreate admin wanted to send a form to one class's
 * parents without ticking them one by one: picking a class shows and selects
 * that class's guardians, and "All families" puts the full list back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AssignChecklistModal from './AssignChecklistModal'

// vi.mock calls below are hoisted above these imports by vitest.

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../../services/api', () => ({ default: api }))


// A fresh cache per test, so one test's class answer never serves the next.
const render = (ui) => rtlRender(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {ui}
  </QueryClientProvider>)

const FAMILIES = [
  { id: 'p1', name: 'Ada Parent' },
  { id: 'p2', name: 'Ben Parent' },
  { id: 'p3', name: 'Cy Parent' },
]
const ROBOTICS_FAMILIES = [FAMILIES[0], FAMILIES[2]]

function answer(url) {
  if (url.startsWith('/api/sis/staff-admin/onboarding/templates')) {
    return { data: { templates: [
      { id: 't-fam', name: 'Field trip form', audience: 'family' },
      { id: 't-staff', name: 'Staff onboarding', audience: 'staff' },
    ] } }
  }
  if (url.startsWith('/api/sis/classes')) {
    return { data: { classes: [{ id: 'c-robo', name: 'Robotics' }, { id: 'c-art', name: 'Art' }] } }
  }
  if (url.includes('onboarding/recipients') && url.includes('class_id=c-robo')) {
    return { data: { recipients: ROBOTICS_FAMILIES } }
  }
  if (url.includes('onboarding/recipients?audience=family')) {
    return { data: { recipients: FAMILIES } }
  }
  if (url.includes('onboarding/recipients?audience=staff')) {
    return { data: { recipients: [{ id: 's1', name: 'Tess Teacher' }] } }
  }
  return { data: {} }
}

const checkbox = (name) => screen.getByText(name).closest('label').querySelector('input')

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => Promise.resolve(answer(url)))
})

async function openFamilyTemplate() {
  render(<AssignChecklistModal orgId="org-1" onClose={() => {}} />)
  await screen.findByRole('option', { name: /Field trip form/ })
  fireEvent.change(screen.getByLabelText('Checklist'), { target: { value: 't-fam' } })
  await screen.findByText('Ben Parent')
}

describe('AssignChecklistModal class filter (ticket a19d5660)', () => {
  it('offers a class picker on the family recipient list', async () => {
    await openFamilyTemplate()
    const picker = await screen.findByLabelText('Pick a class')
    expect(picker).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Robotics' })).toBeInTheDocument()
  })

  it('does not offer it on a staff checklist', async () => {
    render(<AssignChecklistModal orgId="org-1" onClose={() => {}} />)
    await screen.findByRole('option', { name: /Staff onboarding/ })
    fireEvent.change(screen.getByLabelText('Checklist'), { target: { value: 't-staff' } })
    await screen.findByText('Tess Teacher')
    expect(screen.queryByLabelText('Pick a class')).not.toBeInTheDocument()
  })

  it('picking a class shows and selects that class\'s guardians', async () => {
    await openFamilyTemplate()
    fireEvent.change(await screen.findByLabelText('Pick a class'), { target: { value: 'c-robo' } })

    await waitFor(() => expect(screen.queryByText('Ben Parent')).not.toBeInTheDocument())
    expect(api.get).toHaveBeenCalledWith(
      '/api/sis/staff-admin/onboarding/recipients?audience=family&class_id=c-robo&organization_id=org-1')
    expect(checkbox('Ada Parent')).toBeChecked()
    expect(checkbox('Cy Parent')).toBeChecked()
    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })

  it('clearing the class restores the full list and the earlier selection', async () => {
    await openFamilyTemplate()
    fireEvent.click(checkbox('Ben Parent'))
    fireEvent.change(await screen.findByLabelText('Pick a class'), { target: { value: 'c-robo' } })
    await waitFor(() => expect(screen.queryByText('Ben Parent')).not.toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Pick a class'), { target: { value: '' } })
    expect(await screen.findByText('Ben Parent')).toBeInTheDocument()
    expect(screen.getByText('Ada Parent')).toBeInTheDocument()
    expect(checkbox('Ben Parent')).toBeChecked()
    expect(checkbox('Ada Parent')).not.toBeChecked()
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('assigns to the class guardians it selected', async () => {
    api.post.mockResolvedValue({ data: { assigned: 2 } })
    await openFamilyTemplate()
    fireEvent.change(await screen.findByLabelText('Pick a class'), { target: { value: 'c-robo' } })
    await waitFor(() => expect(checkbox('Ada Parent')).toBeChecked())
    fireEvent.click(screen.getByRole('button', { name: 'Assign checklist' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].user_ids.sort()).toEqual(['p1', 'p3'])
  })
})
