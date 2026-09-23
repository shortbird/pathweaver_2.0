/**
 * "Pick a class" on the Families tab of the Assign composer (ticket
 * a19d5660). Picking a class shows and selects that class's guardians;
 * "All families" puts the full list back with the earlier picks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AssignComposer from './AssignComposer'

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

function answer(url) {
  if (url.startsWith('/api/sis/classes')) {
    return { data: { classes: [{ id: 'c-robo', name: 'Robotics' }] } }
  }
  if (url.includes('onboarding/recipients') && url.includes('class_id=c-robo')) {
    return { data: { recipients: [FAMILIES[0], FAMILIES[2]] } }
  }
  if (url.includes('onboarding/recipients?audience=family')) return { data: { recipients: FAMILIES } }
  if (url.includes('onboarding/recipients?audience=staff')) {
    return { data: { recipients: [{ id: 's1', name: 'Tess Teacher' }] } }
  }
  return { data: {} }
}

const box = (name) => screen.getByLabelText(`Select ${name}`)

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => Promise.resolve(answer(url)))
})

async function openFamilies() {
  render(<AssignComposer orgId="org-1" sigEndpoint="/api/sis/staff-admin/signature-requests"
    onClose={() => {}} />)
  await screen.findByText('Tess Teacher')
  fireEvent.click(screen.getByRole('button', { name: /^Families/ }))
  await screen.findByText('Ben Parent')
}

describe('AssignComposer class filter (ticket a19d5660)', () => {
  it('offers a class picker on the Families tab only', async () => {
    render(<AssignComposer orgId="org-1" sigEndpoint="/x" onClose={() => {}} />)
    await screen.findByText('Tess Teacher')
    expect(screen.queryByLabelText('Pick a class')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Families/ }))
    expect(await screen.findByLabelText('Pick a class')).toBeInTheDocument()
  })

  it('picking a class shows and selects that class\'s guardians', async () => {
    await openFamilies()
    fireEvent.change(await screen.findByLabelText('Pick a class'), { target: { value: 'c-robo' } })
    await waitFor(() => expect(screen.queryByText('Ben Parent')).not.toBeInTheDocument())
    expect(box('Ada Parent')).toBeChecked()
    expect(box('Cy Parent')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Families (2)' })).toBeInTheDocument()
  })

  it('clearing the class restores the full list and the earlier selection', async () => {
    await openFamilies()
    fireEvent.click(box('Ben Parent'))
    fireEvent.change(await screen.findByLabelText('Pick a class'), { target: { value: 'c-robo' } })
    await waitFor(() => expect(screen.queryByText('Ben Parent')).not.toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Pick a class'), { target: { value: '' } })
    expect(await screen.findByText('Ben Parent')).toBeInTheDocument()
    expect(box('Ben Parent')).toBeChecked()
    expect(box('Ada Parent')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Families (1)' })).toBeInTheDocument()
  })

  it('keeps the class choice when you visit the Staff tab and come back', async () => {
    await openFamilies()
    fireEvent.change(await screen.findByLabelText('Pick a class'), { target: { value: 'c-robo' } })
    await waitFor(() => expect(screen.queryByText('Ben Parent')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^Staff/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Families/ }))
    expect(await screen.findByLabelText('Pick a class')).toHaveValue('c-robo')
    expect(screen.queryByText('Ben Parent')).not.toBeInTheDocument()
  })
})
