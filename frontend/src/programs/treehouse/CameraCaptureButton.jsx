import React, { useEffect, useRef, useState } from 'react'

/**
 * "Take a photo" button that opens an in-app camera (getUserMedia) with a live
 * preview and a big shutter button — identical on every device, unlike
 * <input capture="environment"> which silently becomes a file picker on
 * laptops/desktops. Falls back to the file input when the camera is
 * unavailable or blocked.
 *
 * Usage: <CameraCaptureButton onPhoto={(file) => ...}>label</CameraCaptureButton>
 */
export default function CameraCaptureButton({ onPhoto, disabled, className, children }) {
  const [stream, setStream] = useState(null)
  const [starting, setStarting] = useState(false)
  const videoRef = useRef(null)
  const fileInputRef = useRef(null)

  const stopStream = (s) => {
    (s || stream)?.getTracks?.().forEach((t) => t.stop())
  }

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream
    }
    return () => { if (stream) stopStream(stream) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream])

  const open = async () => {
    if (disabled || starting) return
    if (!navigator.mediaDevices?.getUserMedia) {
      fileInputRef.current?.click()
      return
    }
    setStarting(true)
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      setStream(s)
    } catch {
      // Camera blocked or missing — the file picker still gets the job done.
      fileInputRef.current?.click()
    } finally {
      setStarting(false)
    }
  }

  const snap = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) {
        onPhoto(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      }
      close()
    }, 'image/jpeg', 0.9)
  }

  const close = () => {
    stopStream()
    setStream(null)
  }

  const onFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onPhoto(file)
  }

  return (
    <>
      <button type="button" onClick={open} disabled={disabled} className={className}>
        {starting ? 'Opening camera…' : children}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFile}
      />

      {stream && (
        <div className="fixed inset-0 z-[70] bg-black flex flex-col">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="flex-1 w-full object-contain min-h-0"
          />
          <div className="flex items-center justify-center gap-8 p-6 bg-black">
            <button
              type="button"
              onClick={close}
              className="px-6 py-4 rounded-2xl bg-white/15 text-white text-lg font-bold"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={snap}
              aria-label="Take photo"
              className="w-20 h-20 rounded-full bg-white border-4 border-optio-purple active:scale-95 transition"
            />
          </div>
        </div>
      )}
    </>
  )
}
