import React, { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  loadScanner,
  detectDocumentCorners,
  extractDocument,
  pagesToPdfFile,
} from '../../services/documentScanner'

const DETECT_INTERVAL_MS = 400
// Live-preview detection runs on a downscaled frame: edge detection on a
// 1080p frame every 400ms would peg a tablet CPU for no visual gain.
const DETECT_MAX_WIDTH = 480

/**
 * Full-screen document scanner: live camera preview with the detected page
 * outlined, a shutter to capture (perspective-corrected) pages, and a save
 * action that assembles every captured page into one PDF File.
 *
 * The web counterpart of the mobile app's native VisionKit/ML Kit scanner.
 * OpenCV and pdf-lib are lazy-loaded by the scanner service, so mounting this
 * modal is what triggers the (one-time) heavy download — only render it once
 * the user asks to scan.
 *
 * Props: onScan(file) receives the finished PDF; onClose is called whenever
 * the modal is done (after save or cancel).
 */
export default function DocumentScannerModal({ onClose, onScan }) {
  const [status, setStatus] = useState('starting') // starting | ready | nocamera | error
  const [pages, setPages] = useState([])
  const [saving, setSaving] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const workCanvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const depsRef = useRef(null)
  const streamRef = useRef(null)
  const nextPageId = useRef(1)

  const stopStream = () => {
    streamRef.current?.getTracks?.().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        depsRef.current = await loadScanner()
      } catch (err) {
        console.error('Document scanner failed to load', err)
        if (alive) setStatus('error')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        if (alive) setStatus('nocamera')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        setStatus('ready')
      } catch {
        if (alive) setStatus('nocamera')
      }
    })()
    return () => {
      alive = false
      stopStream()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  // Once the camera is live: feed the video element and run the outline loop.
  useEffect(() => {
    if (status !== 'ready') return
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
    const interval = setInterval(updateOverlay, DETECT_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const detectBusyRef = useRef(false)

  const updateOverlay = async () => {
    const video = videoRef.current
    const overlay = overlayRef.current
    const deps = depsRef.current
    if (!video || !overlay || !deps || !video.videoWidth) return
    if (detectBusyRef.current) return // previous frame still in the worker

    const scale = Math.min(1, DETECT_MAX_WIDTH / video.videoWidth)
    const work = (workCanvasRef.current ||= document.createElement('canvas'))
    work.width = Math.round(video.videoWidth * scale)
    work.height = Math.round(video.videoHeight * scale)
    const workCtx = work.getContext('2d')
    if (!workCtx) return
    workCtx.drawImage(video, 0, 0, work.width, work.height)

    let corners = null
    detectBusyRef.current = true
    try {
      corners = await detectDocumentCorners(deps, work)
    } catch {
      return // skip this frame; OpenCV hiccups on odd frames are not fatal
    } finally {
      detectBusyRef.current = false
    }

    overlay.width = video.videoWidth
    overlay.height = video.videoHeight
    const ctx = overlay.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, overlay.width, overlay.height)
    if (!corners) return

    const up = 1 / scale
    const { topLeftCorner: tl, topRightCorner: tr, bottomRightCorner: br, bottomLeftCorner: bl } = corners
    ctx.strokeStyle = '#6d469b'
    ctx.lineWidth = Math.max(4, overlay.width / 200)
    ctx.beginPath()
    ctx.moveTo(tl.x * up, tl.y * up)
    ctx.lineTo(tr.x * up, tr.y * up)
    ctx.lineTo(br.x * up, br.y * up)
    ctx.lineTo(bl.x * up, bl.y * up)
    ctx.closePath()
    ctx.stroke()
  }

  const addPage = (canvas) => {
    let thumb = ''
    try {
      thumb = canvas.toDataURL('image/jpeg', 0.5)
    } catch {
      // Thumbnail is cosmetic; the page canvas itself is what gets saved.
    }
    setPages((prev) => [...prev, { id: nextPageId.current++, canvas, thumb }])
  }

  // Detect + flatten `source` (a full-res canvas) into a page. When no page
  // outline is found we keep the raw frame — a slightly skewed capture beats
  // losing the shot.
  const capturePage = async (source) => {
    const deps = depsRef.current
    let corners = null
    try {
      corners = await detectDocumentCorners(deps, source)
    } catch {
      corners = null
    }
    let page = source
    if (corners) {
      try {
        page = (await extractDocument(deps, source, corners)) || source
      } catch {
        page = source
      }
    } else {
      toast("Couldn't find the page edges, so the full photo was kept.")
    }
    addPage(page)
  }

  const grabFrame = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return null
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0)
    return canvas
  }

  const handleCapture = () => {
    const frame = grabFrame()
    if (frame) capturePage(frame)
  }

  const handlePickFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      let source
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file)
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
        bitmap.close?.()
        source = canvas
      } else {
        source = await new Promise((resolve, reject) => {
          const url = URL.createObjectURL(file)
          const img = new Image()
          img.onload = () => {
            URL.revokeObjectURL(url)
            resolve(img)
          }
          img.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error('decode failed'))
          }
          img.src = url
        })
      }
      await capturePage(source)
    } catch {
      toast.error('Could not read that photo.')
    }
  }

  const removePage = (id) => {
    setPages((prev) => prev.filter((p) => p.id !== id))
  }

  const handleCancel = () => {
    stopStream()
    onClose()
  }

  const handleSave = async () => {
    if (saving || pages.length === 0) return
    setSaving(true)
    try {
      const file = await pagesToPdfFile(pages.map((p) => p.canvas))
      stopStream()
      onScan(file)
      onClose()
    } catch {
      toast.error('Could not create the PDF. Try again.')
      setSaving(false)
    }
  }

  const pageCountLabel = `${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col" role="dialog" aria-label="Scan documents">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-white text-base font-semibold">Scan documents</h2>
      </div>

      <div className="relative flex-1 min-h-0">
        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-white/80 text-sm">Opening the scanner…</p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="text-white text-sm">
              The scanner couldn't load. Check your connection and try again.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setStatus('starting')
                  setAttempt((a) => a + 1)
                }}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-6 py-3 rounded-xl bg-white/15 text-white text-sm font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {status === 'nocamera' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="text-white text-sm">
              The camera isn't available here. You can still add a photo of each page and Optio
              will straighten it into the PDF.
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold"
            >
              Add photo of page
            </button>
          </div>
        )}

        {status === 'ready' && (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-contain"
            />
            <canvas
              ref={overlayRef}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />
          </>
        )}
      </div>

      {pages.length > 0 && (
        <div className="flex gap-3 px-4 py-3 overflow-x-auto bg-black/90">
          {pages.map((page, idx) => (
            <div key={page.id} className="relative flex-shrink-0">
              <img
                src={page.thumb}
                alt={`Page ${idx + 1}`}
                className="h-20 w-16 object-cover rounded-lg border border-white/30"
              />
              <button
                type="button"
                onClick={() => removePage(page.id)}
                aria-label={`Remove page ${idx + 1}`}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white text-gray-900 text-xs font-bold shadow"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-6 px-4 py-5 bg-black">
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          className="px-5 py-3 rounded-xl bg-white/15 text-white text-sm font-semibold"
        >
          Cancel
        </button>

        {status === 'ready' && (
          <button
            type="button"
            onClick={handleCapture}
            disabled={saving}
            aria-label="Capture page"
            className="w-16 h-16 rounded-full bg-white border-4 border-optio-purple active:scale-95 transition"
          />
        )}

        {status === 'ready' && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={saving}
            className="px-4 py-3 rounded-xl bg-white/15 text-white text-sm font-medium"
          >
            Add photo
          </button>
        )}

        {pages.length > 0 && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-60"
          >
            {saving ? 'Saving…' : `Save PDF (${pageCountLabel})`}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePickFile}
      />
    </div>
  )
}
