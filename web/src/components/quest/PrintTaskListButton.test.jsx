import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PrintTaskListButton from './PrintTaskListButton'
import { OrganizationContext } from '../../contexts/OrganizationContext'
import { printTaskListReceipt } from '../../utils/stepsReceiptPrinter'
import { toast } from 'react-hot-toast'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { first_name: 'Robin' } }),
}))

vi.mock('../../utils/stepsReceiptPrinter', () => ({
  printTaskListReceipt: vi.fn(() => true),
}))

vi.mock('react-hot-toast', () => {
  const toast = { success: vi.fn(), error: vi.fn() }
  return { default: toast, toast }
})

const tasks = [
  { id: 't2', title: 'Add the roof', is_completed: false, order_index: 1 },
  { id: 't1', title: 'Paint the base coat', is_completed: true, order_index: 0 },
]

const renderIn = (organization, props = {}) => render(
  <OrganizationContext.Provider value={organization === undefined ? null : { organization }}>
    <PrintTaskListButton questTitle="Birdhouse" tasks={tasks} {...props} />
  </OrganizationContext.Provider>
)

const printingOrg = { name: 'The Treehouse', feature_flags: { step_printing: true } }

describe('PrintTaskListButton', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing for an org without a printer', () => {
    const { container } = renderIn({ name: 'Other School', feature_flags: {} })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the quest has no tasks yet', () => {
    const { container } = renderIn(printingOrg, { tasks: [] })
    expect(container).toBeEmptyDOMElement()
  })

  // The quest page must survive a missing provider: no org, no flag, no button.
  it('renders nothing, and does not throw, outside OrganizationProvider', () => {
    const { container } = render(<PrintTaskListButton questTitle="Birdhouse" tasks={tasks} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('prints the tasks in display order, with the student and school on the label', () => {
    renderIn(printingOrg)
    fireEvent.click(screen.getByText('Print my task list'))

    expect(printTaskListReceipt).toHaveBeenCalledWith({
      orgName: 'The Treehouse',
      studentName: 'Robin',
      questTitle: 'Birdhouse',
      tasks: [
        expect.objectContaining({ id: 't1' }),
        expect.objectContaining({ id: 't2' }),
      ],
    })
  })

  it('says so when the print window is blocked', () => {
    printTaskListReceipt.mockReturnValueOnce(false)
    renderIn(printingOrg)
    fireEvent.click(screen.getByText('Print my task list'))
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('pop-ups'))
  })
})
