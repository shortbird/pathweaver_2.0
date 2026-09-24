import React, { useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PhotoIcon } from '@heroicons/react/24/outline'

/**
 * The picture across the top of the quest. Uploaded the moment it is chosen,
 * straight onto the quest (which exists from the moment the editor opens), so
 * the preview shows the real thing.
 *
 * Only the training builder could do this until P6 (2026-09-23); a quest made
 * anywhere else got whatever the stock search found for its title.
 */
export default function HeaderImageField({ imageUrl, fallbackLogo = null, isDraft, onUpload, onRemove, disabled }) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)

  const pick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Choose an image file'); return }
    setBusy(true)
    try {
      await onUpload(file)
      toast.success('Header image saved')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not upload that image')
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }

  const remove = async () => {
    setBusy(true)
    try { await onRemove() } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove the image')
    } finally { setBusy(false) }
  }

  return (
    <div className="flex items-center gap-3">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="w-24 h-16 rounded-lg object-cover border border-gray-200" />
      ) : fallbackLogo ? (
        <img src={fallbackLogo} alt="" className="w-24 h-16 rounded-lg object-contain bg-white border border-gray-200 p-1" />
      ) : (
        <div className="w-24 h-16 rounded-lg bg-gradient-primary flex items-center justify-center">
          <PhotoIcon className="w-5 h-5 text-white/80" />
        </div>
      )}
      <div className="flex-1">
        <input ref={ref} type="file" accept="image/*" onChange={pick}
          className="hidden" aria-label="Upload a header image" />
        <div className="flex items-center gap-2">
          <button type="button" disabled={busy || disabled} onClick={() => ref.current?.click()}
            className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm text-neutral-700 hover:bg-gray-50 disabled:opacity-50">
            {busy ? 'Uploading…' : imageUrl ? 'Change image' : 'Upload header image'}
          </button>
          {imageUrl && (
            <button type="button" onClick={remove} disabled={busy || disabled}
              className="text-xs text-neutral-500 hover:underline disabled:opacity-50">Remove</button>
          )}
        </div>
        <p className="text-xs text-neutral-500 mt-1">
          {imageUrl ? 'Shown across the top of the quest.'
            : fallbackLogo ? 'Your school logo is used unless you upload something else.'
              : isDraft ? 'Optional. Without one, a picture is found from the title when you publish.'
                : 'Optional. Without one, a picture is found from the title.'}
        </p>
      </div>
    </div>
  )
}
