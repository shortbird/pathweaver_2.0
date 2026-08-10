/**
 * Web document scanner: edge detection + perspective correction, assembled
 * into a single multi-page PDF — the browser counterpart of the mobile app's
 * native scanner (frontend-v2/src/services/documentScanner.ts).
 *
 * The OpenCV work runs in a dedicated Web Worker
 * (workers/documentScanner.worker.js) because OpenCV's embind generates code
 * with `new Function(...)`, which the page CSP blocks — see the worker's
 * header comment. This module is the worker's client: it converts canvases
 * to ImageData, makes the calls, and applies the geometry policy (quad-area
 * sanity filter, output page sizing). detect/extract are therefore async.
 *
 * The worker (with its ~10MB OpenCV bundle) and pdf-lib are only fetched on
 * first use — never import this module's dependencies eagerly.
 */

let worker = null
let readyPromise = null
let callSeq = 0
const pending = new Map()

// A paper quad smaller than this fraction of the frame is treated as noise:
// jscanify always returns the *largest* contour, which on a paperless desk is
// some stray object, and warping to it would produce garbage.
const MIN_PAPER_AREA_FRACTION = 0.08

function teardownWorker(error) {
  for (const p of pending.values()) p.reject(error || new Error('Scanner worker stopped'))
  pending.clear()
  worker?.terminate?.()
  worker = null
  readyPromise = null
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/documentScanner.worker.js', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event) => {
      const { id, ok, result, error } = event.data
      const call = pending.get(id)
      if (!call) return
      pending.delete(id)
      if (ok) call.resolve(result)
      else call.reject(new Error(error))
    }
    worker.onerror = (event) => {
      // Script-level failure (e.g. the OpenCV chunk failed to fetch): every
      // in-flight call is dead, and so is the worker.
      teardownWorker(new Error(event?.message || 'Scanner worker failed'))
    }
  }
  return worker
}

function callWorker(op, payload, transfer) {
  return new Promise((resolve, reject) => {
    const id = ++callSeq
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, op, payload }, transfer || [])
  })
}

/**
 * Start the worker and have it load OpenCV + jscanify. Returns an opaque
 * ready handle. A failed load tears the worker down so the next call retries
 * instead of replaying the rejection forever.
 */
export function loadScanner() {
  if (!readyPromise) {
    readyPromise = callWorker('load').catch((err) => {
      teardownWorker(err)
      throw err
    })
  }
  return readyPromise
}

function toImageData(source) {
  const ctx = source.getContext('2d')
  if (!ctx) throw new Error('Could not read pixels from the capture canvas')
  return ctx.getImageData(0, 0, source.width, source.height)
}

function distance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y)
}

/** Shoelace area of the corner quad. */
function quadArea({ topLeftCorner: tl, topRightCorner: tr, bottomRightCorner: br, bottomLeftCorner: bl }) {
  const pts = [tl, tr, br, bl]
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area) / 2
}

/**
 * Detect the document in `source` (a canvas) and return its corner points,
 * or null when nothing page-like is in view.
 */
export async function detectDocumentCorners(_scanner, source) {
  const imageData = toImageData(source)
  const frameArea = imageData.width * imageData.height
  const corners = await callWorker('detect', { imageData }, [imageData.data.buffer])
  if (!corners) return null
  const { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner } = corners
  if (!topLeftCorner || !topRightCorner || !bottomLeftCorner || !bottomRightCorner) return null
  if (quadArea(corners) < frameArea * MIN_PAPER_AREA_FRACTION) return null
  return corners
}

/**
 * Perspective-correct the document at `corners` out of `source`. The output
 * page is sized from the corner geometry — the longer of each opposing edge
 * pair — so the flattened scan keeps the paper's real aspect ratio.
 * Returns a canvas.
 */
export async function extractDocument(_scanner, source, corners) {
  const { topLeftCorner: tl, topRightCorner: tr, bottomLeftCorner: bl, bottomRightCorner: br } = corners
  const width = Math.round(Math.max(distance(tl, tr), distance(bl, br)))
  const height = Math.round(Math.max(distance(tl, bl), distance(tr, br)))

  const imageData = toImageData(source)
  const page = await callWorker('extract', { imageData, corners, width, height }, [imageData.data.buffer])

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not render the extracted page')
  ctx.putImageData(page, 0, 0)
  return canvas
}

function canvasToJpegBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not encode the scanned page'))
          return
        }
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject)
      },
      'image/jpeg',
      0.9
    )
  })
}

/**
 * Assemble scanned page canvases into one PDF File. Each page box matches its
 * image's pixel dimensions exactly, so a scan never overflows onto a second
 * page — same rule as the mobile scanner, which shipped that bug once.
 */
export async function pagesToPdfFile(pageCanvases, filename) {
  if (!pageCanvases || pageCanvases.length === 0) {
    throw new Error('No scanned pages to save')
  }
  const { PDFDocument } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  for (const canvas of pageCanvases) {
    const bytes = await canvasToJpegBytes(canvas)
    const image = await pdf.embedJpg(bytes)
    const page = pdf.addPage([image.width, image.height])
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  }
  const pdfBytes = await pdf.save()
  const name = filename || `Scan-${Date.now()}.pdf`
  return new File([pdfBytes], name, { type: 'application/pdf' })
}
