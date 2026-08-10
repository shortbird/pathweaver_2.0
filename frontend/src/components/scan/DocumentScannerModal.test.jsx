import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DocumentScannerModal from './DocumentScannerModal'
import {
  loadScanner,
  detectDocumentCorners,
  extractDocument,
  pagesToPdfFile,
} from '../../services/documentScanner'

vi.mock('../../services/documentScanner', () => ({
  loadScanner: vi.fn(),
  detectDocumentCorners: vi.fn(),
  extractDocument: vi.fn(),
  pagesToPdfFile: vi.fn(),
}))

const fakeDeps = { cv: {}, scanner: {} }

function fakePageCanvas(label) {
  return {
    width: 600,
    height: 800,
    toDataURL: () => `data:image/jpeg;base64,${label}`,
  }
}

function fakeCorners() {
  return {
    topLeftCorner: { x: 10, y: 10 },
    topRightCorner: { x: 600, y: 12 },
    bottomLeftCorner: { x: 12, y: 780 },
    bottomRightCorner: { x: 590, y: 790 },
  }
}

describe('DocumentScannerModal', () => {
  let stopTrack
  let onClose
  let onScan

  beforeEach(() => {
    vi.clearAllMocks()
    onClose = vi.fn()
    onScan = vi.fn()
    stopTrack = vi.fn()

    loadScanner.mockResolvedValue(fakeDeps)
    detectDocumentCorners.mockReturnValue(fakeCorners())
    extractDocument.mockImplementation(() => fakePageCanvas('page'))

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: stopTrack }],
        }),
      },
      writable: true,
      configurable: true,
    })

    // jsdom's video element reports 0x0; give the capture path real pixels.
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      get: () => 640,
      configurable: true,
    })
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      get: () => 480,
      configurable: true,
    })
    // Fallback-photo path decodes the picked file with createImageBitmap.
    global.createImageBitmap = vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() }))
    // jsdom canvases can't rasterize; thumbnails come from toDataURL.
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/jpeg;base64,frame')
  })

  afterEach(() => {
    delete HTMLVideoElement.prototype.videoWidth
    delete HTMLVideoElement.prototype.videoHeight
    delete global.createImageBitmap
  })

  async function renderReady() {
    const utils = render(<DocumentScannerModal onClose={onClose} onScan={onScan} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /capture page/i })).toBeInTheDocument()
    })
    return utils
  }

  // Generous timeout: the first test in the file pays the component's
  // one-time import cost, which can exceed the 5s default on a loaded machine.
  it('requests the back camera and shows the capture UI', { timeout: 15000 }, async () => {
    await renderReady()
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: 'environment' }),
        audio: false,
      })
    )
  })

  it('falls back to photo picking when the camera is unavailable', async () => {
    navigator.mediaDevices.getUserMedia.mockRejectedValue(new Error('denied'))
    const { container } = render(<DocumentScannerModal onClose={onClose} onScan={onScan} />)

    await waitFor(() => {
      expect(screen.getByText(/camera isn't available/i)).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /capture page/i })).not.toBeInTheDocument()
    expect(container.querySelector('input[type="file"]')).toBeInTheDocument()
  })

  it('shows an error state when the scanner fails to load', async () => {
    loadScanner.mockRejectedValue(new Error('wasm fetch failed'))
    render(<DocumentScannerModal onClose={onClose} onScan={onScan} />)

    await waitFor(() => {
      expect(screen.getByText(/couldn't load/i)).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('captures a detected page and lists it', async () => {
    await renderReady()
    await userEvent.click(screen.getByRole('button', { name: /capture page/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save pdf \(1 page\)/i })).toBeInTheDocument()
    })
    expect(extractDocument).toHaveBeenCalled()
    expect(screen.getByAltText(/page 1/i)).toBeInTheDocument()
  })

  it('still captures the raw frame when no document is detected', async () => {
    detectDocumentCorners.mockReturnValue(null)
    await renderReady()
    await userEvent.click(screen.getByRole('button', { name: /capture page/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save pdf \(1 page\)/i })).toBeInTheDocument()
    })
    expect(extractDocument).not.toHaveBeenCalled()
  })

  it('removes a captured page', async () => {
    await renderReady()
    await userEvent.click(screen.getByRole('button', { name: /capture page/i }))
    await waitFor(() => {
      expect(screen.getByAltText(/page 1/i)).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /remove page 1/i }))
    expect(screen.queryByAltText(/page 1/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save pdf/i })).not.toBeInTheDocument()
  })

  it('assembles the pages into a PDF and hands it back', async () => {
    const pdfFile = new File(['pdf'], 'Scan-1.pdf', { type: 'application/pdf' })
    pagesToPdfFile.mockResolvedValue(pdfFile)
    const pageA = fakePageCanvas('a')
    const pageB = fakePageCanvas('b')
    extractDocument.mockReturnValueOnce(pageA).mockReturnValueOnce(pageB)

    await renderReady()
    await userEvent.click(screen.getByRole('button', { name: /capture page/i }))
    await userEvent.click(screen.getByRole('button', { name: /capture page/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save pdf \(2 pages\)/i })).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /save pdf \(2 pages\)/i }))

    await waitFor(() => {
      expect(onScan).toHaveBeenCalledWith(pdfFile)
    })
    expect(pagesToPdfFile).toHaveBeenCalledWith([pageA, pageB])
    expect(onClose).toHaveBeenCalled()
  })

  it('stops the camera stream on cancel', async () => {
    await renderReady()
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(stopTrack).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('processes a picked photo through detection', async () => {
    const { container } = await renderReady()
    const input = container.querySelector('input[type="file"]')
    const photo = new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' })

    fireEvent.change(input, { target: { files: [photo] } })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save pdf \(1 page\)/i })).toBeInTheDocument()
    })
    expect(global.createImageBitmap).toHaveBeenCalledWith(photo)
    expect(detectDocumentCorners).toHaveBeenCalled()
  })
})
