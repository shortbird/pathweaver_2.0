import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TreehouseSignalBar from './TreehouseSignalBar'

let profile = {}
const createSignal = vi.fn(() => Promise.resolve({ data: { success: true } }))

vi.mock('../../hooks/useTreehouseProfile', () => ({
  useTreehouseProfile: () => profile,
}))
vi.mock('../../services/api', () => ({
  treehouseAPI: { createSignal: (...a) => createSignal(...a) },
}))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('TreehouseSignalBar (F2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    profile = { isMember: true, isFacilitator: false }
  })

  it('renders help + proud buttons for a Treehouse student', () => {
    render(<TreehouseSignalBar questId="q1" />)
    expect(screen.getByText(/I need help/i)).toBeInTheDocument()
    expect(screen.getByText(/I'm proud of this/i)).toBeInTheDocument()
  })

  it('renders nothing for non-members', () => {
    profile = { isMember: false, isFacilitator: false }
    const { container } = render(<TreehouseSignalBar questId="q1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for facilitators', () => {
    profile = { isMember: true, isFacilitator: true }
    const { container } = render(<TreehouseSignalBar questId="q1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sends a help signal with quest + task context', async () => {
    render(<TreehouseSignalBar questId="q1" taskId="t1" />)
    fireEvent.click(screen.getByText(/I need help/i))
    await waitFor(() => expect(createSignal).toHaveBeenCalledWith({
      signal_type: 'help', quest_id: 'q1', task_id: 't1',
    }))
  })

  it('sends a proud signal', async () => {
    render(<TreehouseSignalBar questId="q1" />)
    fireEvent.click(screen.getByText(/I'm proud of this/i))
    await waitFor(() => expect(createSignal).toHaveBeenCalledWith({
      signal_type: 'proud', quest_id: 'q1', task_id: undefined,
    }))
  })
})
