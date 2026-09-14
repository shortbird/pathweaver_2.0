import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImprovedEvidenceUploader from './ImprovedEvidenceUploader'
import { EvidenceBlockRenderer } from './EvidenceBlockRenderer'
import EvidenceContentEditor from './EvidenceContentEditor'

// The camera button has its own live-preview behaviour; here it is stubbed
// with a button that immediately hands back a photo, so these tests only cover
// the wiring: a "Take a photo" button on every photo upload, and the photo
// landing in the same path as a picked file. This is what Treehouse asked for
// on 2026-09-14: older students had no way to open the camera for a photo,
// only the file picker (and the document scanner, which crops to a page).
const snapped = new File([new Uint8Array([255, 216, 255])], 'photo-1.jpg', {
  type: 'image/jpeg',
})

vi.mock('./CameraCaptureButton', () => ({
  default: ({ onPhoto, children, className }) => (
    <button type="button" className={className} onClick={() => onPhoto(snapped)}>
      {children}
    </button>
  ),
}))

vi.mock('./EvidenceEditorContext', () => ({
  useEvidenceEditor: () => ({
    activeBlock: null,
    setActiveBlock: vi.fn(),
    collapsedBlocks: new Set(),
    toggleBlockCollapse: vi.fn(),
    uploadingBlocks: new Set(),
    uploadErrors: {},
    setBlocks: vi.fn(),
  }),
}))

describe('ImprovedEvidenceUploader camera wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('offers the camera for photo evidence', () => {
    render(<ImprovedEvidenceUploader evidenceType="camera" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /take a photo/i })).toBeInTheDocument()
  })

  it('does not offer the camera for document evidence', () => {
    render(<ImprovedEvidenceUploader evidenceType="document" onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /take a photo/i })).not.toBeInTheDocument()
  })

  it('feeds the photo into the selected-file flow', async () => {
    const onChange = vi.fn()
    render(<ImprovedEvidenceUploader evidenceType="camera" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: /take a photo/i }))

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({ file: snapped })
    })
  })
})

describe('EvidenceContentEditor camera wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'blob:photo')
  })

  it('offers the camera in the photo evidence flow', async () => {
    render(<EvidenceContentEditor onSave={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /^camera/i }))

    expect(screen.getByRole('button', { name: /take a photo/i })).toBeInTheDocument()
  })

  it('adds the photo as a media item', async () => {
    render(<EvidenceContentEditor onSave={vi.fn()} onCancel={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /^camera/i }))

    await userEvent.click(screen.getByRole('button', { name: /take a photo/i }))

    await waitFor(() => {
      expect(screen.getByAltText('photo-1.jpg')).toBeInTheDocument()
    })
  })
})

describe('EvidenceBlockRenderer camera wiring', () => {
  const block = { id: 'block-1', type: 'image', content: { items: [] } }

  function renderBlock({ mediaHandlers, updateBlock } = {}) {
    return render(
      <EvidenceBlockRenderer
        block={block}
        index={0}
        mediaHandlers={mediaHandlers ?? { handleFileUpload: vi.fn() }}
        addBlock={vi.fn()}
        updateBlock={updateBlock ?? vi.fn()}
        deleteBlock={vi.fn()}
      />
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('offers the camera on image blocks', () => {
    renderBlock()
    expect(screen.getByRole('button', { name: /take a photo/i })).toBeInTheDocument()
  })

  it('uploads the photo and adds it as an image item', async () => {
    const handleFileUpload = vi.fn().mockResolvedValue({ localUrl: 'blob:photo' })
    const updateBlock = vi.fn()
    renderBlock({ mediaHandlers: { handleFileUpload }, updateBlock })

    await userEvent.click(screen.getByRole('button', { name: /take a photo/i }))

    await waitFor(() => {
      expect(handleFileUpload).toHaveBeenCalledWith(snapped, 'block-1', 'image')
    })
    await waitFor(() => {
      expect(updateBlock).toHaveBeenCalledWith('block-1', {
        items: [expect.objectContaining({ url: 'blob:photo', alt: 'photo-1.jpg' })],
      })
    })
  })
})
