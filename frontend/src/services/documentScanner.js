/**
 * Web document scanner: OpenCV.js edge detection + perspective correction
 * (via the vendored jscanify), assembled into a single multi-page PDF with
 * pdf-lib — the browser counterpart of the mobile app's native scanner
 * (frontend-v2/src/services/documentScanner.ts), which produces the same
 * "one scan == exactly one page, page box == image box" PDFs.
 *
 * Everything heavy is behind dynamic imports: OpenCV.js is a ~10MB wasm
 * build, so nothing here may be imported eagerly from a page bundle. Callers
 * invoke loadScanner() on user intent (opening the scan modal), not on mount.
 */

let scannerPromise = null

const OPENCV_INIT_TIMEOUT_MS = 30000

// A paper quad smaller than this fraction of the frame is treated as noise:
// jscanify always returns the *largest* contour, which on a paperless desk is
// some stray object, and warping to it would produce garbage.
const MIN_PAPER_AREA_FRACTION = 0.08

/**
 * The @techstark/opencv-js module has shipped three init shapes across
 * versions: an already-initialized cv, a promise of one, and the classic
 * onRuntimeInitialized callback. Handle all three.
 */
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

/**
 * Lazy-load OpenCV + jscanify once and return `{ cv, scanner }`.
 * A failed load (flaky network fetching the wasm chunk) clears the cache so
 * the next call retries instead of replaying the rejection forever.
 */
export function loadScanner() {
  if (!scannerPromise) {
    scannerPromise = (async () => {
      const [cvModule, jscanifyModule] = await Promise.all([
        import('@techstark/opencv-js'),
        import('../vendor/jscanify.js'),
      ])
      const cv = await resolveOpenCv(cvModule.default ?? cvModule)
      jscanifyModule.setOpenCv(cv)
      const Scanner = jscanifyModule.default
      return { cv, scanner: new Scanner() }
    })().catch((err) => {
      scannerPromise = null
      throw err
    })
  }
  return scannerPromise
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
 * Detect the document in `source` (a canvas, img, or video frame) and return
 * its corner points, or null when nothing page-like is in view.
 */
export function detectDocumentCorners({ cv, scanner }, source) {
  const mat = cv.imread(source)
  let contour = null
  try {
    contour = scanner.findPaperContour(mat)
    if (!contour) return null
    const corners = scanner.getCornerPoints(contour)
    const { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner } = corners || {}
    if (!topLeftCorner || !topRightCorner || !bottomLeftCorner || !bottomRightCorner) return null
    if (quadArea(corners) < mat.cols * mat.rows * MIN_PAPER_AREA_FRACTION) return null
    return corners
  } finally {
    if (contour && typeof contour.delete === 'function') contour.delete()
    mat.delete()
  }
}

/**
 * Perspective-correct the document at `corners` out of `source`. The output
 * page is sized from the corner geometry — the longer of each opposing edge
 * pair — so the flattened scan keeps the paper's real aspect ratio.
 * Returns a canvas.
 */
export function extractDocument({ scanner }, source, corners) {
  const { topLeftCorner: tl, topRightCorner: tr, bottomLeftCorner: bl, bottomRightCorner: br } = corners
  const width = Math.round(Math.max(distance(tl, tr), distance(bl, br)))
  const height = Math.round(Math.max(distance(tl, bl), distance(tr, br)))
  return scanner.extractPaper(source, width, height, corners)
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
