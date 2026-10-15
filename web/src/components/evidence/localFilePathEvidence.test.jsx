/**
 * Ticket d0cc8d45: a student on a Chromebook opened the evidence Link picker
 * and pasted `file:///home/chronos/u-.../Screenshot ....png`. It saved as a
 * link block, the file was never uploaded, and the teacher saw nothing — 18
 * blocks from 2 students over a month.
 *
 * Every web field where a student types a link now refuses a path on their
 * own computer, says why, and does not save it. A normal https link still
 * saves. Anywhere a saved one is shown, it says the file never uploaded
 * instead of offering a link that opens nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EvidenceContentEditor from './EvidenceContentEditor'
import { EvidenceBlockRenderer } from './EvidenceBlockRenderer'
import EvidenceDisplay from './EvidenceDisplay'
import LinkBlock from './blocks/LinkBlock'
import UnifiedEvidenceDisplay from './UnifiedEvidenceDisplay'
import LtiEvidenceEditor from '../lti/LtiEvidenceEditor'
import ParentMomentCaptureModal from '../parent/ParentMomentCaptureModal'
import LearningEventModal from '../learning-events/LearningEventModal'

// vi.mock and vi.hoisted are hoisted above these imports.

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: toastMock, toast: toastMock }))

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('../../services/api', () => ({ default: api }))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isSuperadmin: false, user: { id: 'u1' } }),
}))
vi.mock('../../contexts/ConfirmContext', () => ({
  useConfirm: () => async () => true,
}))
vi.mock('./EvidenceEditorContext', () => ({
  useEvidenceEditor: () => ({
    activeBlock: null,
    setActiveBlock: vi.fn(),
    collapsedBlocks: state.collapsed,
    toggleBlockCollapse: vi.fn(),
    uploadingBlocks: new Set(),
    uploadErrors: {},
    setBlocks: vi.fn(),
    isSavedLocalPath: (url) => state.savedLocal.has(url),
  }),
}))
vi.mock('../../hooks/useHidePillars', () => ({ default: () => false }))
vi.mock('../../hooks/useStudentScope', () => ({ useStudentScope: () => ({ studentId: null }) }))
vi.mock('../interest-tracks/TrackSelector', () => ({ default: () => null }))
vi.mock('../../services/signedUpload', () => ({ uploadViaSignedUrl: vi.fn() }))

const state = vi.hoisted(() => ({ collapsed: new Set(), savedLocal: new Set() }))

const LOCAL =
  'file:///home/chronos/u-3f2a9c/MyFiles/Downloads/Screenshot 2026-07-23 8.43.22 AM.png'
const GOOD = 'https://docs.google.com/document/d/abc/edit'
const MESSAGE =
  "That's a file on your computer, not a link, so no one else can open it. Use Upload to add the file instead."
const NEVER_UPLOADED =
  'Screenshot 2026-07-23 8.43.22 AM.png never uploaded. Add it again with Upload.'

beforeEach(() => {
  vi.clearAllMocks()
  state.collapsed = new Set()
  state.savedLocal = new Set()
})

// ---------------------------------------------------------------- entry points

describe('Add Evidence modal link field (EvidenceContentEditor, ticket d0cc8d45)', () => {
  const openLinkField = (onSave) => {
    render(<EvidenceContentEditor onSave={onSave} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Link/ }))
    fireEvent.click(screen.getByRole('button', { name: /Add link/ }))
    return screen.getByPlaceholderText('https://example.com')
  }

  it('a pasted file path shows the message and Save does not save it', () => {
    const onSave = vi.fn()
    fireEvent.change(openLinkField(onSave), { target: { value: LOCAL } })
    expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE)
    fireEvent.click(screen.getByRole('button', { name: /Save Evidence/ }))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('a pasted path is not saved even with other evidence already added', () => {
    const onSave = vi.fn()
    fireEvent.change(openLinkField(onSave), { target: { value: GOOD } })
    fireEvent.click(screen.getByRole('button', { name: /Add Another/ }))
    fireEvent.click(screen.getByRole('button', { name: /Add link/ }))
    fireEvent.change(screen.getByPlaceholderText('https://example.com'), { target: { value: LOCAL } })
    fireEvent.click(screen.getByRole('button', { name: /Save Evidence/ }))
    expect(onSave).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith(MESSAGE)
  })

  it('a normal https link still saves', () => {
    const onSave = vi.fn()
    fireEvent.change(openLinkField(onSave), { target: { value: GOOD } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Save Evidence/ }))
    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'link', content: { items: [{ url: GOOD, title: '' }] } }),
    ])
  })
})

const renderEditorBlock = (url) => {
  const updateBlock = vi.fn()
  render(
    <EvidenceBlockRenderer
      block={{ id: 'b1', type: 'link', content: { items: [{ url, title: '' }] } }}
      index={0}
      mediaHandlers={{}}
      addBlock={vi.fn()}
      updateBlock={updateBlock}
      deleteBlock={vi.fn()}
    />,
  )
  return updateBlock
}

describe('Quest task evidence editor link block (EvidenceBlockRenderer, ticket d0cc8d45)', () => {
  it('a file path shows the message and no dead link', () => {
    renderEditorBlock(LOCAL)
    expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE)
    expect(document.querySelector(`a[href="${LOCAL}"]`)).toBeNull()
  })

  it('a normal https link shows its link and no message', () => {
    renderEditorBlock(GOOD)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(document.querySelector(`a[href="${GOOD}"]`)).not.toBeNull()
  })

  it('a file path saved before the editor opened says it never uploaded', () => {
    state.savedLocal = new Set([LOCAL])
    renderEditorBlock(LOCAL)
    expect(screen.getByText(NEVER_UPLOADED)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('the collapsed block says the file never uploaded', () => {
    state.collapsed = new Set(['b1'])
    renderEditorBlock(LOCAL)
    expect(screen.getByText(NEVER_UPLOADED)).toBeInTheDocument()
  })
})

describe('LTI evidence editor link field (ticket d0cc8d45)', () => {
  it('a pasted file path shows the message; neither Add link nor Mark complete saves it', () => {
    const onComplete = vi.fn().mockResolvedValue(undefined)
    render(<LtiEvidenceEditor taskId="t1" onComplete={onComplete} />)
    fireEvent.change(screen.getByTestId('lti-evidence-link'), { target: { value: LOCAL } })
    expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE)
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
    fireEvent.click(screen.getByRole('button', { name: /Mark complete/ }))
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('a bare /home path is caught before it is dressed up as https:///home', () => {
    const onComplete = vi.fn().mockResolvedValue(undefined)
    render(<LtiEvidenceEditor taskId="t1" onComplete={onComplete} />)
    fireEvent.change(screen.getByTestId('lti-evidence-link'), { target: { value: '/home/maci/a.png' } })
    fireEvent.click(screen.getByRole('button', { name: /Mark complete/ }))
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('a normal https link still saves', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined)
    render(<LtiEvidenceEditor taskId="t1" onComplete={onComplete} />)
    fireEvent.change(screen.getByTestId('lti-evidence-link'), { target: { value: GOOD } })
    fireEvent.click(screen.getByRole('button', { name: /Mark complete/ }))
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([{ type: 'link', content: { url: GOOD } }]),
    )
  })
})

describe('Parent moment capture link field (ticket d0cc8d45)', () => {
  const setup = () => {
    api.post.mockResolvedValue({ data: { moment: { id: 'm1' } } })
    render(
      // The modal's `children` prop is the list of kids, not React children.
      <ParentMomentCaptureModal isOpen onClose={vi.fn()} {...{ children: [{ id: 'kid1', name: 'Maci' }] }} />,
    )
    fireEvent.change(screen.getByPlaceholderText(/./, { selector: 'textarea' }), {
      target: { value: 'Made a poster' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    return screen.getByPlaceholderText(/Paste URL/)
  }

  it('a pasted file path shows the message and is not added to the moment', async () => {
    fireEvent.change(setup(), { target: { value: LOCAL } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText(MESSAGE)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Save Moment/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].media).toEqual([])
  })

  it('a normal https link is still added', async () => {
    fireEvent.change(setup(), { target: { value: GOOD } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Save Moment/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].media).toEqual([{ type: 'link', url: GOOD, title: '' }])
  })
})

describe('Learning moment modal link block (LearningEventModal, ticket d0cc8d45)', () => {
  const editEvent = (url) => ({
    id: 'e1',
    description: 'Made a poster',
    evidence_blocks: [{ id: 'blk1', block_type: 'link', content: { url, title: '' } }],
  })

  it('a file path shows the message and Save Changes saves nothing', () => {
    render(<LearningEventModal isOpen onClose={vi.fn()} editEvent={editEvent(LOCAL)} />)
    expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE)
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }))
    expect(api.put).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith(MESSAGE)
  })

  it('a normal https link still saves', async () => {
    api.put.mockResolvedValue({ data: { success: true, event: { id: 'e1' } } })
    api.post.mockResolvedValue({ data: { success: true } })
    render(<LearningEventModal isOpen onClose={vi.fn()} editEvent={editEvent(GOOD)} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/learning-events/e1/evidence',
      { blocks: [{ block_type: 'link', content: { url: GOOD, title: '' }, order_index: 0 }] },
    ))
  })
})

// ------------------------------------------------------------------- renderers

const savedLinkBlock = (url) => ({
  id: 'b1',
  type: 'link',
  block_type: 'link',
  content: { items: [{ url, title: url === LOCAL ? LOCAL : 'My doc' }] },
})

describe('saved link evidence shown to the student (ticket d0cc8d45)', () => {
  it('task workspace (EvidenceDisplay): a file path says it never uploaded, with no link', () => {
    render(<EvidenceDisplay blocks={[savedLinkBlock(LOCAL)]} />)
    expect(screen.getByText(NEVER_UPLOADED)).toBeInTheDocument()
    expect(document.querySelector('a[href^="file:"]')).toBeNull()
  })

  it('task workspace (EvidenceDisplay): a normal link is unchanged', () => {
    render(<EvidenceDisplay blocks={[savedLinkBlock(GOOD)]} />)
    expect(screen.queryByText(/never uploaded/)).not.toBeInTheDocument()
    expect(document.querySelector(`a[href="${GOOD}"]`)).not.toBeNull()
  })

  it('diploma / portfolio (UnifiedEvidenceDisplay -> LinkBlock): a file path says it never uploaded', () => {
    render(<UnifiedEvidenceDisplay evidence={{ evidence_type: 'multi_format', evidence_blocks: [savedLinkBlock(LOCAL)] }} />)
    expect(screen.getByText(NEVER_UPLOADED)).toBeInTheDocument()
    expect(document.querySelector('a[href^="file:"]')).toBeNull()
  })

  it('LinkBlock: a normal link is unchanged', () => {
    render(<LinkBlock block={savedLinkBlock(GOOD)} />)
    expect(screen.queryByText(/never uploaded/)).not.toBeInTheDocument()
    expect(document.querySelector(`a[href="${GOOD}"]`)).not.toBeNull()
  })
})
