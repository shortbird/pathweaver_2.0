import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImprovedEvidenceUploader from './ImprovedEvidenceUploader'
import { EvidenceBlockRenderer } from './EvidenceBlockRenderer'
import EvidenceContentEditor from './EvidenceContentEditor'

// The scanner modal has its own test file; here it is stubbed with a button
// that immediately hands back a scanned PDF, so these tests only cover the
// wiring: scan button shown for documents, and the PDF landing in the same
// path as a picked file.
const scannedPdf = new File([new Uint8Array([37, 80, 68, 70])], 'Scan-123.pdf', {
  type: 'application/pdf',
})

vi.mock('../scan/DocumentScannerModal', () => ({
  default: ({ onScan, onClose }) => (
    <button
      type="button"
      onClick={() => {
        onScan(scannedPdf)
        onClose()
      }}
    >
      mock-finish-scan
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

describe('ImprovedEvidenceUploader scan wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('offers scanning for document evidence', () => {
    render(<ImprovedEvidenceUploader evidenceType="document" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /scan with camera/i })).toBeInTheDocument()
  })

  it('does not offer scanning for non-document evidence', () => {
    render(<ImprovedEvidenceUploader evidenceType="camera" onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /scan with camera/i })).not.toBeInTheDocument()
  })

  it('feeds the scanned PDF into the selected-file flow', async () => {
    const onChange = vi.fn()
    render(<ImprovedEvidenceUploader evidenceType="document" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: /scan with camera/i }))
    await userEvent.click(screen.getByRole('button', { name: /mock-finish-scan/i }))

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({ file: scannedPdf })
    })
    // Modal closed again
    expect(screen.queryByRole('button', { name: /mock-finish-scan/i })).not.toBeInTheDocument()
  })
})

describe('EvidenceContentEditor scan wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'blob:scan')
  })

  it('signals scanning on the document type card', () => {
    render(<EvidenceContentEditor onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText(/upload files or scan with camera/i)).toBeInTheDocument()
  })

  it('offers scanning in the document evidence flow', async () => {
    render(<EvidenceContentEditor onSave={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /document/i }))

    expect(screen.getByRole('button', { name: /scan with camera/i })).toBeInTheDocument()
  })

  it('adds the scanned PDF as a document item', async () => {
    render(<EvidenceContentEditor onSave={vi.fn()} onCancel={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /document/i }))

    await userEvent.click(screen.getByRole('button', { name: /scan with camera/i }))
    await userEvent.click(screen.getByRole('button', { name: /mock-finish-scan/i }))

    await waitFor(() => {
      expect(screen.getByText('Scan-123.pdf')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /mock-finish-scan/i })).not.toBeInTheDocument()
  })
})

describe('EvidenceBlockRenderer scan wiring', () => {
  const block = { id: 'block-1', type: 'document', content: { items: [] } }

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

  it('offers scanning on document blocks', () => {
    renderBlock()
    expect(screen.getByRole('button', { name: /scan with camera/i })).toBeInTheDocument()
  })

  it('uploads the scanned PDF and adds it as a document item', async () => {
    const handleFileUpload = vi.fn().mockResolvedValue({ localUrl: 'blob:scan' })
    const updateBlock = vi.fn()
    renderBlock({ mediaHandlers: { handleFileUpload }, updateBlock })

    await userEvent.click(screen.getByRole('button', { name: /scan with camera/i }))
    await userEvent.click(screen.getByRole('button', { name: /mock-finish-scan/i }))

    await waitFor(() => {
      expect(handleFileUpload).toHaveBeenCalledWith(scannedPdf, 'block-1', 'document')
    })
    await waitFor(() => {
      expect(updateBlock).toHaveBeenCalledWith('block-1', {
        items: [
          expect.objectContaining({ url: 'blob:scan', filename: 'Scan-123.pdf' }),
        ],
      })
    })
  })
})
