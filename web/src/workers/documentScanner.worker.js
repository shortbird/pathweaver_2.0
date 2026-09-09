/**
 * Document scanner worker: owns OpenCV.js and the vendored jscanify.
 *
 * OpenCV MUST live in a worker, not the page. Its embind layer generates
 * function bindings with `new Function(...)` at runtime, which the page's
 * Content Security Policy blocks (script-src has no 'unsafe-eval', and we are
 * not adding it — it would gut the site's XSS protection). A dedicated
 * same-origin worker gets its policy from its own response headers, which
 * carry no CSP, so wasm compilation and embind work here. It also keeps edge
 * detection off the UI thread. If site CSP ever moves from the index.html
 * meta tag to real HTTP headers, the worker script's response must NOT get
 * the page's script-src (or needs 'wasm-unsafe-eval' 'unsafe-eval').
 *
 * Protocol: { id, op: 'load' | 'detect' | 'extract', payload } in,
 * { id, ok, result | error } out. Geometry decisions (quad-area filtering,
 * output page sizing) stay in services/documentScanner.js — this worker only
 * does the cv-touching work.
 */

import Jscanify, { setOpenCv } from '../vendor/jscanify.js'

let deps = null

const OPENCV_INIT_TIMEOUT_MS = 30000

// @techstark/opencv-js has shipped three init shapes across versions: an
// already-initialized cv, a promise of one, and the onRuntimeInitialized
// callback. Handle all three.
async function resolveOpenCv(mod) {
  if (typeof mod?.then === 'function') return await mod
  if (mod?.Mat) return mod
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('OpenCV failed to initialize')),
      OPENCV_INIT_TIMEOUT_MS
    )
    mod.onRuntimeInitialized = () => {
      clearTimeout(timer)
      resolve(mod)
    }
  })
}

async function ensureLoaded() {
  if (!deps) {
    const cvModule = await import('@techstark/opencv-js')
    const cv = await resolveOpenCv(cvModule.default ?? cvModule)
    setOpenCv(cv)
    deps = { cv, scanner: new Jscanify() }
  }
  return deps
}

/** Find the paper's corner points in an ImageData frame, or null. */
function detect({ imageData }) {
  const { cv, scanner } = deps
  const mat = cv.matFromImageData(imageData)
  let contour = null
  try {
    contour = scanner.findPaperContour(mat)
    if (!contour) return null
    return scanner.getCornerPoints(contour) || null
  } finally {
    if (contour && typeof contour.delete === 'function') contour.delete()
    mat.delete()
  }
}

/**
 * Perspective-warp the quad at `corners` out of the frame into a flat
 * width x height page, returned as ImageData. Mirrors the vendored
 * jscanify.extractPaper, which can't run here because it renders through
 * document.createElement('canvas').
 */
function extract({ imageData, corners, width, height }) {
  const { cv } = deps
  const { topLeftCorner: tl, topRightCorner: tr, bottomLeftCorner: bl, bottomRightCorner: br } = corners
  const src = cv.matFromImageData(imageData)
  const dst = new cv.Mat()
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x, tl.y,
    tr.x, tr.y,
    bl.x, bl.y,
    br.x, br.y,
  ])
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    width, 0,
    0, height,
    width, height,
  ])
  const M = cv.getPerspectiveTransform(srcTri, dstTri)
  try {
    cv.warpPerspective(src, dst, M, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar())
    return new ImageData(new Uint8ClampedArray(dst.data), width, height)
  } finally {
    src.delete()
    dst.delete()
    srcTri.delete()
    dstTri.delete()
    M.delete()
  }
}

self.onmessage = async (event) => {
  const { id, op, payload } = event.data
  try {
    await ensureLoaded()
    if (op === 'load') {
      self.postMessage({ id, ok: true, result: true })
      return
    }
    if (op === 'detect') {
      self.postMessage({ id, ok: true, result: detect(payload) })
      return
    }
    if (op === 'extract') {
      const result = extract(payload)
      self.postMessage({ id, ok: true, result }, [result.data.buffer])
      return
    }
    throw new Error(`Unknown scanner op: ${op}`)
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) })
  }
}
