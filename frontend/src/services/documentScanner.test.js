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
 * loadScanner resolves its deps with dynamic imports, so each test that needs
 * a different OpenCV module shape re-imports the service with vi.doMock.
 */
async function importService({ cvModule, jscanifyModule } = {}) {
  vi.resetModules()
  vi.doMock('@techstark/opencv-js', () => cvModule ?? { default: { Mat: function Mat() {} } })
  vi.doMock('../vendor/jscanify.js', () => jscanifyModule ?? fakeJscanifyModule())
  return await import('./documentScanner')
}

function fakeJscanifyModule() {
  const setOpenCv = vi.fn()
  class FakeScanner {}
  return { default: FakeScanner, setOpenCv }
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

/** Minimal cv + scanner pair for the detection/extraction helpers. */
function fakeDeps({ contour, corners, extracted } = {}) {
  const mat = { cols: 1000, rows: 800, delete: vi.fn() }
  const contourObj = contour === null ? null : { delete: vi.fn(), ...contour }
  const cv = { imread: vi.fn(() => mat) }
  const scanner = {
    findPaperContour: vi.fn(() => contourObj),
    getCornerPoints: vi.fn(() => corners),
    extractPaper: vi.fn(() => extracted ?? { width: 1, height: 1 }),
  }
  return { cv, scanner, mat, contourObj }
}

describe('loadScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes from a ready cv module and injects it into jscanify', async () => {
    const cv = { Mat: function Mat() {} }
    const jscanifyModule = fakeJscanifyModule()
    const svc = await importService({ cvModule: { default: cv }, jscanifyModule })

    const result = await svc.loadScanner()

    expect(jscanifyModule.setOpenCv).toHaveBeenCalledWith(cv)
    expect(result.cv).toBe(cv)
    expect(result.scanner).toBeInstanceOf(jscanifyModule.default)
  })

  it('awaits a promise-shaped cv module', async () => {
    const cv = { Mat: function Mat() {} }
    const svc = await importService({ cvModule: { default: Promise.resolve(cv) } })

    const result = await svc.loadScanner()

    expect(result.cv).toBe(cv)
  })

  it('waits for onRuntimeInitialized when cv is not ready yet', async () => {
    const cvModule = {} // no Mat, not a promise
    const svc = await importService({ cvModule: { default: cvModule } })

    const pending = svc.loadScanner()
    await vi.waitFor(() => {
      expect(typeof cvModule.onRuntimeInitialized).toBe('function')
    })
    cvModule.onRuntimeInitialized()

    const result = await pending
    expect(result.cv).toBe(cvModule)
  })

  it('returns the same instance on repeated calls', async () => {
    const svc = await importService()
    const first = await svc.loadScanner()
    const second = await svc.loadScanner()
    expect(second).toBe(first)
  })

  it('allows a retry after a failed load', async () => {
    // The module itself loads fine, but the first attempt to use it blows up
    // (stand-in for a flaky wasm-chunk fetch): accessing `default` throws once.
    let calls = 0
    vi.resetModules()
    vi.doMock('@techstark/opencv-js', () => ({
      get default() {
        calls += 1
        if (calls === 1) throw new Error('network error')
        return { Mat: function Mat() {} }
      },
    }))
    vi.doMock('../vendor/jscanify.js', () => fakeJscanifyModule())
    const svc = await import('./documentScanner')

    await expect(svc.loadScanner()).rejects.toThrow('network error')
    const result = await svc.loadScanner()
    expect(result.scanner).toBeTruthy()
  })
})

describe('detectDocumentCorners', () => {
  let svc
  beforeEach(async () => {
    svc = await importService()
  })

  it('returns the corner points of a detected page', () => {
    const corners = rectCorners(100, 100, 700, 500)
    const deps = fakeDeps({ corners })

    const result = svc.detectDocumentCorners(deps, 'source')

    expect(deps.cv.imread).toHaveBeenCalledWith('source')
    expect(result).toEqual(corners)
  })

  it('returns null when no contour is found', () => {
    const deps = fakeDeps({ contour: null })
    expect(svc.detectDocumentCorners(deps, 'source')).toBeNull()
  })

  it('returns null when a corner is missing', () => {
    const corners = rectCorners(100, 100, 700, 500)
    delete corners.bottomRightCorner
    const deps = fakeDeps({ corners })
    expect(svc.detectDocumentCorners(deps, 'source')).toBeNull()
  })

  it('returns null when the detected quad is too small to be the page', () => {
    // 50x40 blob in a 1000x800 frame: 0.25% of the frame — noise, not paper.
    const deps = fakeDeps({ corners: rectCorners(10, 10, 50, 40) })
    expect(svc.detectDocumentCorners(deps, 'source')).toBeNull()
  })

  it('frees the mat and contour even on the null paths', () => {
    const deps = fakeDeps({ corners: rectCorners(10, 10, 50, 40) })
    svc.detectDocumentCorners(deps, 'source')
    expect(deps.mat.delete).toHaveBeenCalled()
    expect(deps.contourObj.delete).toHaveBeenCalled()
  })
})

describe('extractDocument', () => {
  it('warps using the corner geometry to size the output page', async () => {
    const svc = await importService()
    const corners = rectCorners(100, 50, 600, 800)
    const extracted = { width: 600, height: 800 }
    const deps = fakeDeps({ extracted })

    const result = svc.extractDocument(deps, 'source', corners)

    expect(deps.scanner.extractPaper).toHaveBeenCalledWith('source', 600, 800, corners)
    expect(result).toBe(extracted)
  })

  it('uses the longer of each opposing edge pair for the output size', async () => {
    const svc = await importService()
    // Keystoned trapezoid: top edge 500 wide, bottom edge 620 wide, both
    // slanted sides hypot(60, 700) ≈ 702.57 tall.
    const corners = {
      topLeftCorner: { x: 160, y: 100 },
      topRightCorner: { x: 660, y: 100 },
      bottomLeftCorner: { x: 100, y: 800 },
      bottomRightCorner: { x: 720, y: 800 },
    }
    const deps = fakeDeps({})

    svc.extractDocument(deps, 'source', corners)

    const [, width, height] = deps.scanner.extractPaper.mock.calls[0]
    expect(width).toBe(620)
    expect(height).toBe(703)
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
