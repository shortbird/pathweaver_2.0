import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import api from '../../../services/api'
import XpCalibrationModal, { XpCalibrationPanel } from './XpCalibrationPanel'
import SaveXpExample from './SaveXpExample'

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}))

const BASE = '/api/credit-dashboard/xp-calibration'

const serve = ({ modified = false, examples = [] } = {}) => api.get.mockResolvedValue({
  data: {
    data: {
      guide: { content: '- 25: quick', default_content: '- 25: quick', modified },
      examples,
    },
  },
})

const mount = (ui) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {ui}
  </QueryClientProvider>
)

describe('XpCalibrationPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('saves an edited scale', async () => {
    serve()
    api.put.mockResolvedValue({ data: {} })
    mount(<XpCalibrationPanel />)

    const box = await screen.findByLabelText('XP scale')
    expect(box).toHaveValue('- 25: quick')
    await userEvent.clear(box)
    await userEvent.type(box, '- 25: a short reply')
    await userEvent.click(screen.getByRole('button', { name: 'Save scale' }))

    expect(api.put).toHaveBeenCalledWith(`${BASE}/guide`, { content: '- 25: a short reply' })
  })

  it('offers a reset only once the scale was edited', async () => {
    serve({ modified: false })
    const { unmount } = mount(<XpCalibrationPanel />)
    await screen.findByLabelText('XP scale')
    expect(screen.queryByRole('button', { name: 'Reset to default' })).toBeNull()
    unmount()

    serve({ modified: true })
    mount(<XpCalibrationPanel />)
    expect(await screen.findByRole('button', { name: 'Reset to default' })).toBeInTheDocument()
  })

  it('adds an example as a number of XP', async () => {
    serve()
    api.post.mockResolvedValue({ data: {} })
    mount(<XpCalibrationPanel />)

    await userEvent.type(await screen.findByLabelText('Work'), 'Two-sentence discussion comment')
    await userEvent.click(screen.getByRole('button', { name: 'Add example' }))

    expect(api.post).toHaveBeenCalledWith(`${BASE}/examples`, {
      work: 'Two-sentence discussion comment', xp: 25, note: '',
    })
  })

  it('pauses an example without deleting it', async () => {
    serve({ examples: [{ id: 'ex1', work: 'A poem', xp: 50, note: null, status: 'active' }] })
    api.patch.mockResolvedValue({ data: {} })
    mount(<XpCalibrationPanel />)

    await userEvent.click(await screen.findByRole('button', { name: 'Pause' }))
    expect(api.patch).toHaveBeenCalledWith(`${BASE}/examples/ex1`, { status: 'paused' })
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('queues suggestions above the scale, with what the AI said', async () => {
    serve({ examples: [
      { id: 's1', work: 'a two-sentence discussion comment', xp: 25, status: 'suggested',
        subjects: { language_arts: 100 }, ai_xp: 100, ai_subjects: { language_arts: 100 } },
      { id: 'ex1', work: 'A poem', xp: 50, status: 'active' },
    ] })
    api.patch.mockResolvedValue({ data: {} })
    api.delete.mockResolvedValue({ data: {} })
    mount(<XpCalibrationPanel />)

    expect(await screen.findByText('Waiting for you (1)')).toBeInTheDocument()
    expect(screen.getByText('AI said 100 XP, Language Arts 100%')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(api.patch).toHaveBeenCalledWith(`${BASE}/examples/s1`, { status: 'active' })

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(api.delete).toHaveBeenCalledWith(`${BASE}/examples/s1`)
  })

  it('shows no queue when nothing is waiting', async () => {
    serve({ examples: [{ id: 'ex1', work: 'A poem', xp: 50, status: 'active' }] })
    mount(<XpCalibrationPanel />)
    await screen.findByLabelText('XP scale')
    expect(screen.queryByText(/Waiting for you/)).toBeNull()
  })

  it('steps the example XP between task sizes', async () => {
    serve()
    api.post.mockResolvedValue({ data: {} })
    mount(<XpCalibrationPanel />)
    const xp = await screen.findByLabelText('XP')
    fireEvent.keyDown(xp, { key: 'ArrowUp' })
    fireEvent.keyDown(xp, { key: 'ArrowUp' })
    expect(xp).toHaveValue(75)
    await userEvent.type(screen.getByLabelText('Work'), 'A lab report')
    await userEvent.click(screen.getByRole('button', { name: 'Add example' }))
    expect(api.post).toHaveBeenCalledWith(`${BASE}/examples`, { work: 'A lab report', xp: 75, note: '' })
  })
})

describe('SaveXpExample (grader)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('saves the reviewer’s call on this submission, linked to it', async () => {
    api.post.mockResolvedValue({ data: {} })
    mount(<SaveXpExample completionId="c-1" taskTitle="Discussion post" xp={25}
      subjects={{ language_arts: 25 }} />)

    await userEvent.click(screen.getByRole('button', { name: 'Save as AI example' }))
    const work = screen.getByLabelText('Work')
    expect(work).toHaveValue('Discussion post')
    expect(screen.getByLabelText('Example XP')).toHaveValue(25)
    expect(screen.getByText('Subjects saved with it: Language Arts 100%')).toBeInTheDocument()

    await userEvent.clear(work)
    await userEvent.type(work, 'A two-sentence discussion comment')
    await userEvent.click(screen.getByRole('button', { name: 'Save example' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`${BASE}/examples`, {
      work: 'A two-sentence discussion comment', xp: 25, note: '',
      subjects: { language_arts: 25 }, completion_id: 'c-1',
    }))
    expect(await screen.findByText('Saved. The next AI review uses it.')).toBeInTheDocument()
  })
})

describe('XpCalibrationModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads nothing until it is opened', () => {
    mount(<XpCalibrationModal isOpen={false} onClose={() => {}} />)
    expect(api.get).not.toHaveBeenCalled()
  })

  it('shows the scale inside the popup when opened', async () => {
    serve()
    mount(<XpCalibrationModal isOpen onClose={() => {}} />)
    expect(await screen.findByText('Tune AI XP')).toBeInTheDocument()
    expect(await screen.findByLabelText('XP scale')).toHaveValue('- 25: quick')
  })
})
