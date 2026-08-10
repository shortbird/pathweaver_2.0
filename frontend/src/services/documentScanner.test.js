import { describe, it, expect, vi, beforeEach } from 'vitest'

// pagesToPdfFile lazy-imports pdf-lib; a static vi.mock covers every test.
const embedJpg = vi.fn()
const addPage = vi.fn()
const drawImage = vi.fn()
const save = vi.fn()
vi.mock('pdf-lib', () => ({
  PDFDocument: {
    create: vi.fn(async () => ({ embedJpg, addPage, save })),
  },
}))

/**
 * The service talks to the scan worker over postMessage. FakeWorker answers
 * each op from `FakeWorker.handlers`, so tests script the worker's side.
 */
class FakeWorker {
  static instances = []
  static handlers = {}

  constructor(url, opts) {
    this.url = url
    this.opts = opts
    this.onmessage = null
    this.onerror = null
    this.sent = []
    this.terminated = false
    FakeWorker.instances.push(this)
  }

  postMessage(msg) {
    this.sent.push(msg)
    const respond = (data) => queueMicrotask(() => this.onmessage?.({ data }))
    const handler = FakeWorker.handlers[msg.op]
    if (!handler) {
      respond({ id: msg.id, ok: false, error: `no handler for ${msg.op}` })
      return
    }
    try {
      respond({ id: msg.id, ok: true, result: handler(msg.payload, this) })
    } catch (err) {
      respond({ id: msg.id, ok: false, error: err.message })
    }
  }

  terminate() {
    this.terminated = true
  }
}

/** The service caches its worker at module scope, so import it fresh. */
async function importService() {
  vi.resetModules()
  FakeWorker.instances = []
  FakeWorker.handlers = { load: () => true }
  global.Worker = FakeWorker
  return await import('./documentScanner')
}

/** Corner set for a rectangle from (x, y) to (x + w, y + h). */
function rectCorners(x, y, w, h) {
  return {
    topLeftCorner: { x, y },
    topRightCorner: { x: x + w, y },
    bottomLeftCorner: { x, y: y + h },
    bottomRightCorner: { x: x + w, y: y + h },
  }
}

/** Canvas stand-in whose 2d context yields a width x height ImageData. */
function fakeSourceCanvas(width = 1000, height = 800) {
  return {
    width,
    height,
    getContext: () => ({
      getImageData: () => ({ width, height, data: new Uint8Array(4) }),
      putImageData: vi.fn(),
    }),
  }
}

describe('loadScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('spawns the worker as a same-origin module worker and awaits its load', async () => {
    const svc = await importService()

    await svc.loadScanner()

    expect(FakeWorker.instances).toHaveLength(1)
    const w = FakeWorker.instances[0]
    expect(String(w.url)).toMatch(/documentScanner\.worker\.js/)
    expect(w.opts).toEqual({ type: 'module' })
    expect(w.sent[0]).toMatchObject({ op: 'load' })
  })

  it('returns the same promise on repeated calls', async () => {
    const svc = await importService()
    const first = svc.loadScanner()
    const second = svc.loadScanner()
    expect(second).toBe(first)
    await first
    expect(FakeWorker.instances).toHaveLength(1)
  })

  it('tears down and allows a retry after a failed load', async () => {
    const svc = await importService()
    let calls = 0
    FakeWorker.handlers.load = () => {
      calls += 1
      if (calls === 1) throw new Error('wasm fetch failed')
      return true
    }

    await expect(svc.loadScanner()).rejects.toThrow('wasm fetch failed')
    expect(FakeWorker.instances[0].terminated).toBe(true)

    await expect(svc.loadScanner()).resolves.toBeTruthy()
    expect(FakeWorker.instances).toHaveLength(2)
  })
})

describe('detectDocumentCorners', () => {
  let svc
  beforeEach(async () => {
    vi.clearAllMocks()
    svc = await importService()
  })

  it('sends the frame pixels to the worker and returns its corners', async () => {
    const corners = rectCorners(100, 100, 700, 500)
    FakeWorker.handlers.detect = (payload) => {
      expect(payload.imageData).toMatchObject({ width: 1000, height: 800 })
      return corners
    }

    const result = await svc.detectDocumentCorners({}, fakeSourceCanvas())

    expect(result).toEqual(corners)
  })

  it('returns null when the worker finds no contour', async () => {
    FakeWorker.handlers.detect = () => null
    expect(await svc.detectDocumentCorners({}, fakeSourceCanvas())).toBeNull()
  })

  it('returns null when a corner is missing', async () => {
    const corners = rectCorners(100, 100, 700, 500)
    delete corners.bottomRightCorner
    FakeWorker.handlers.detect = () => corners
    expect(await svc.detectDocumentCorners({}, fakeSourceCanvas())).toBeNull()
  })

  it('returns null when the detected quad is too small to be the page', async () => {
    // 50x40 blob in a 1000x800 frame: 0.25% of the frame — noise, not paper.
    FakeWorker.handlers.detect = () => rectCorners(10, 10, 50, 40)
    expect(await svc.detectDocumentCorners({}, fakeSourceCanvas())).toBeNull()
  })
})

describe('extractDocument', () => {
  let svc
  beforeEach(async () => {
    vi.clearAllMocks()
    svc = await importService()
  })

  it('sizes the output from the longer of each opposing edge pair', async () => {
    // Keystoned trapezoid: top edge 500 wide, bottom edge 620 wide, both
    // slanted sides hypot(60, 700) ≈ 702.57 tall.
    const corners = {
      topLeftCorner: { x: 160, y: 100 },
      topRightCorner: { x: 660, y: 100 },
      bottomLeftCorner: { x: 100, y: 800 },
      bottomRightCorner: { x: 720, y: 800 },
    }
    let received
    FakeWorker.handlers.extract = (payload) => {
      received = payload
      return { width: payload.width, height: payload.height, data: new Uint8Array(4) }
    }

    const canvas = await svc.extractDocument({}, fakeSourceCanvas(), corners)

    expect(received.width).toBe(620)
    expect(received.height).toBe(703)
    expect(received.corners).toEqual(corners)
    expect(canvas.width).toBe(620)
    expect(canvas.height).toBe(703)
  })

  it('paints the returned page pixels onto the result canvas', async () => {
    const page = { width: 600, height: 800, data: new Uint8Array(4) }
    FakeWorker.handlers.extract = () => page
    const putImageData = vi.fn()
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag)
      if (tag === 'canvas') el.getContext = () => ({ putImageData })
      return el
    })

    await svc.extractDocument({}, fakeSourceCanvas(), rectCorners(0, 0, 600, 800))

    expect(putImageData).toHaveBeenCalledWith(page, 0, 0)
  })
})

describe('pagesToPdfFile', () => {
  let svc
  beforeEach(async () => {
    vi.clearAllMocks()
    svc = await importService()
    save.mockResolvedValue(new Uint8Array([1, 2, 3]))
    addPage.mockReturnValue({ drawImage })
  })

  function fakePageCanvas(width, height) {
    return {
      width,
      height,
      toBlob: (cb, type, quality) => {
        expect(type).toBe('image/jpeg')
        expect(quality).toBeCloseTo(0.9)
        // jsdom's Blob lacks arrayBuffer(); hand back a minimal stand-in.
        cb({ arrayBuffer: async () => new Uint8Array([255, 216, 255]).buffer })
      },
    }
  }

  it('creates one PDF page per canvas, sized to that image', async () => {
    embedJpg
      .mockResolvedValueOnce({ width: 600, height: 800 })
      .mockResolvedValueOnce({ width: 900, height: 500 })

    const file = await svc.pagesToPdfFile([fakePageCanvas(600, 800), fakePageCanvas(900, 500)])

    expect(embedJpg).toHaveBeenCalledTimes(2)
    expect(addPage).toHaveBeenNthCalledWith(1, [600, 800])
    expect(addPage).toHaveBeenNthCalledWith(2, [900, 500])
    expect(drawImage).toHaveBeenCalledTimes(2)
    expect(drawImage.mock.calls[0][1]).toEqual({ x: 0, y: 0, width: 600, height: 800 })
    expect(file).toBeInstanceOf(File)
    expect(file.type).toBe('application/pdf')
    expect(file.name).toMatch(/^Scan-.*\.pdf$/)
  })

  it('rejects an empty page list', async () => {
    await expect(svc.pagesToPdfFile([])).rejects.toThrow()
  })
})
