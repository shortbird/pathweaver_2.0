import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The worker module registers itself on `self.onmessage` — in jsdom `self`
 * is the window, so tests drive it by invoking window.onmessage directly and
 * capture its replies through a spied window.postMessage.
 */

const setOpenCv = vi.fn()
class FakeScanner {
  findPaperContour = vi.fn()
  getCornerPoints = vi.fn()
}
let scannerInstance

vi.mock('../vendor/jscanify.js', () => ({
  default: class {
    constructor() {
      scannerInstance = new FakeScanner()
      return scannerInstance
    }
  },
  setOpenCv: (cv) => setOpenCv(cv),
}))

function fakeMat() {
  return { delete: vi.fn(), data: new Uint8Array(16) }
}

const fakeCv = {
  Mat: function Mat() {
    return fakeMat()
  },
  matFromImageData: vi.fn(() => fakeMat()),
  matFromArray: vi.fn(() => fakeMat()),
  getPerspectiveTransform: vi.fn(() => fakeMat()),
  warpPerspective: vi.fn(),
  Size: function Size(w, h) {
    this.width = w
    this.height = h
  },
  Scalar: function Scalar() {},
  CV_32FC2: 13,
  INTER_LINEAR: 1,
  BORDER_CONSTANT: 0,
}

vi.mock('@techstark/opencv-js', () => ({ default: fakeCv }))

const corners = {
  topLeftCorner: { x: 10, y: 10 },
  topRightCorner: { x: 610, y: 10 },
  bottomLeftCorner: { x: 10, y: 810 },
  bottomRightCorner: { x: 610, y: 810 },
}

describe('documentScanner.worker', () => {
  let posted

  beforeEach(async () => {
    vi.clearAllMocks()
    posted = []
    vi.spyOn(window, 'postMessage').mockImplementation((msg, transfer) => {
      posted.push({ msg, transfer })
    })
    global.ImageData = class ImageData {
      constructor(data, width, height) {
        this.data = data
        this.width = width
        this.height = height
      }
    }
    vi.resetModules()
    await import('./documentScanner.worker.js')
  })

  afterEach(() => {
    delete global.ImageData
    vi.restoreAllMocks()
  })

  const send = (data) => window.onmessage({ data })

  it('loads OpenCV once, injects it into jscanify, and acks', async () => {
    await send({ id: 1, op: 'load' })
    await send({ id: 2, op: 'load' })

    expect(setOpenCv).toHaveBeenCalledTimes(1)
    expect(setOpenCv).toHaveBeenCalledWith(fakeCv)
    expect(posted[0].msg).toEqual({ id: 1, ok: true, result: true })
    expect(posted[1].msg).toEqual({ id: 2, ok: true, result: true })
  })

  it('detects corners from frame pixels and frees the mats', async () => {
    const contour = { delete: vi.fn() }
    const imageData = { width: 640, height: 480, data: new Uint8Array(4) }
    await send({ id: 1, op: 'load' })
    scannerInstance.findPaperContour.mockReturnValue(contour)
    scannerInstance.getCornerPoints.mockReturnValue(corners)

    await send({ id: 2, op: 'detect', payload: { imageData } })

    expect(fakeCv.matFromImageData).toHaveBeenCalledWith(imageData)
    expect(posted[1].msg).toEqual({ id: 2, ok: true, result: corners })
    expect(contour.delete).toHaveBeenCalled()
    expect(fakeCv.matFromImageData.mock.results[0].value.delete).toHaveBeenCalled()
  })

  it('answers null when no contour is found', async () => {
    await send({ id: 1, op: 'load' })
    scannerInstance.findPaperContour.mockReturnValue(null)

    await send({ id: 2, op: 'detect', payload: { imageData: { data: new Uint8Array(4) } } })

    expect(posted[1].msg).toEqual({ id: 2, ok: true, result: null })
  })

  it('warps the page out of the frame and transfers the pixels back', async () => {
    const imageData = { width: 1000, height: 800, data: new Uint8Array(4) }
    await send({ id: 1, op: 'load' })

    await send({ id: 2, op: 'extract', payload: { imageData, corners, width: 600, height: 800 } })

    expect(fakeCv.warpPerspective).toHaveBeenCalled()
    const size = fakeCv.warpPerspective.mock.calls[0][3]
    expect(size).toMatchObject({ width: 600, height: 800 })
    const { msg, transfer } = posted[1]
    expect(msg.ok).toBe(true)
    expect(msg.result).toMatchObject({ width: 600, height: 800 })
    expect(transfer).toEqual([msg.result.data.buffer])
  })

  it('reports failures as ok:false replies instead of crashing', async () => {
    await send({ id: 1, op: 'load' })
    scannerInstance.findPaperContour.mockImplementation(() => {
      throw new Error('cv exploded')
    })

    await send({ id: 2, op: 'detect', payload: { imageData: { data: new Uint8Array(4) } } })

    expect(posted[1].msg).toEqual({ id: 2, ok: false, error: 'cv exploded' })
  })

  it('rejects unknown ops', async () => {
    await send({ id: 1, op: 'reticulate' })
    expect(posted[0].msg.ok).toBe(false)
    expect(posted[0].msg.error).toMatch(/unknown scanner op/i)
  })
})
