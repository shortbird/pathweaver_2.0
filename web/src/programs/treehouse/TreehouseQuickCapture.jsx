import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import ModalOverlay from '../../components/ui/ModalOverlay'
import CameraCaptureButton from './CameraCaptureButton'

/**
 * "Show My Work" — one photo, one caption, straight into the student's own
 * portfolio, with no quest and no task in the way.
 *
 * Young learners finish things that no quest asked for. Until this button, the
 * only way to keep that work was to start a quest first, which is three screens
 * of setup for a kid holding a wet painting. This is the learning-moment flow
 * the journal already has, reduced to camera → caption → save.
 *
 * The moment lands in the journal and on the portfolio like any other:
 *   1. POST /quick            — the moment (description is required, hence the
 *                               fallback caption)
 *   2. POST /<id>/upload      — the photo into private storage
 *   3. POST /<id>/evidence    — the block that points at it
 * Step 3 stores `file_url`, the durable pointer, never the signed `display_url`
 * twin, which expires.
 */

// The journal shows the description as the moment's body. A young learner who
// skips the caption still gets a readable entry instead of a 400.
const DEFAULT_CAPTION = 'Photo of my work'

export default function TreehouseQuickCapture({ className }) {
  const [photo, setPhoto] = useState(null)
  const [caption, setCaption] = useState('')
  const [saving, setSaving] = useState(false)

  // Release the preview object URL when the photo is replaced or cleared.
  useEffect(() => () => {
    if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl)
  }, [photo])

  const takePhoto = (file) => {
    setPhoto({ file, previewUrl: URL.createObjectURL(file) })
  }

  const close = () => {
    if (saving) return
    setPhoto(null)
    setCaption('')
  }

  const save = async () => {
    if (!photo || saving) return
    setSaving(true)
    try {
      const description = caption.trim() || DEFAULT_CAPTION

      const { data } = await api.post('/api/learning-events/quick', { description })
      const eventId = data?.event?.id
      if (!eventId) throw new Error('Moment was not created')

      const form = new FormData()
      form.append('file', photo.file)
      form.append('block_type', 'image')
      const upload = await api.post(`/api/learning-events/${eventId}/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      await api.post(`/api/learning-events/${eventId}/evidence`, {
        blocks: [{
          block_type: 'image',
          order_index: 0,
          file_url: upload.data.file_url,
          file_name: upload.data.filename,
          content: {
            url: upload.data.file_url,
            caption: description,
            alt_text: description,
          },
        }],
      })

      toast.success('Saved to your portfolio!')
      setPhoto(null)
      setCaption('')
    } catch (error) {
      // "Try again!" is the right advice for a dropped connection and the wrong
      // advice for a photo that is over the size limit — that one never
      // succeeds, so pass the server's reason through when there is one.
      toast.error(error.response?.data?.error || 'Could not save that. Try again!')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <CameraCaptureButton onPhoto={takePhoto} className={className}>
        <span className="text-5xl" aria-hidden>📷</span>
        <span className="text-xl font-bold text-center leading-tight">Show My Work</span>
      </CameraCaptureButton>

      {photo && (
        <ModalOverlay onClose={close}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-md">
            <p className="text-2xl font-bold text-neutral-900 text-center">Nice work!</p>
            <img
              src={photo.previewUrl}
              alt="The work you photographed"
              className="mt-4 w-full max-h-64 object-contain rounded-2xl bg-neutral-100"
            />
            <label htmlFor="treehouse-capture-caption" className="block text-neutral-500 mt-4">
              What is it?
            </label>
            <input
              id="treehouse-capture-caption"
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={saving}
              maxLength={200}
              placeholder="I built a birdhouse"
              className="mt-1 w-full rounded-2xl border-2 border-optio-purple/30 px-4 py-4 text-lg focus:outline-none focus:border-optio-purple disabled:opacity-60"
            />

            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="w-full py-4 rounded-2xl bg-gradient-primary text-white text-lg font-bold disabled:opacity-60"
              >
                {saving ? 'Saving…' : '✓ Keep it in my portfolio'}
              </button>
              <CameraCaptureButton
                disabled={saving}
                onPhoto={takePhoto}
                className={`block w-full text-center py-4 rounded-2xl bg-optio-purple/10 text-optio-purple text-lg font-bold ${saving ? 'opacity-60 pointer-events-none' : ''}`}
              >
                📷 Take it again
              </CameraCaptureButton>
            </div>

            <button
              type="button"
              onClick={close}
              disabled={saving}
              className="w-full mt-2 py-3 text-neutral-500 font-semibold"
            >
              ← Back
            </button>
          </div>
        </ModalOverlay>
      )}
    </>
  )
}
