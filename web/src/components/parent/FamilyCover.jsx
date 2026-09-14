import React, { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { CameraIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useFamilyCover, useRemoveFamilyCover, useUploadFamilyCover } from '../../hooks/api/useFamilyCover'
import { useConfirm } from '../../contexts/ConfirmContext'

/**
 * The family photo across the top of the family dashboard.
 *
 * A landscape banner the parent sets: with none, a quiet placeholder that
 * says a photo can go here; with one, the photo, and Change / Remove on
 * hover. The children's pictures sit on their cards below; this is the one
 * of everyone together (2026-09-15).
 */

const MAX_BYTES = 10 * 1024 * 1024

export default function FamilyCover({ className = '' }) {
  const { data: url, isLoading } = useFamilyCover()
  const upload = useUploadFamilyCover()
  const remove = useRemoveFamilyCover()
  const confirm = useConfirm()
  const inputRef = useRef(null)
  const [preview, setPreview] = useState(null)
  // FileReader answers after the upload can: the preview must not land on a
  // photo that has already been saved (or refused).
  const readingRef = useRef(false)

  const shown = preview || url
  const busy = upload.isPending || remove.isPending

  const onFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error('Image must be less than 10MB')
      return
    }
    readingRef.current = true
    const reader = new FileReader()
    reader.onload = (ev) => { if (readingRef.current) setPreview(ev.target.result) }
    reader.readAsDataURL(file)
    upload.mutate(file, {
      onSuccess: () => { readingRef.current = false; setPreview(null); toast.success('Family photo updated') },
      onError: (err) => { readingRef.current = false; setPreview(null); toast.error(err.response?.data?.error || 'Failed to upload the photo') },
    })
  }

  const onRemove = async () => {
    if (!(await confirm('Remove the family photo?'))) return
    remove.mutate(undefined, {
      onSuccess: () => toast.success('Family photo removed'),
      onError: (err) => toast.error(err.response?.data?.error || 'Could not remove the photo'),
    })
  }

  if (isLoading) return <div className={`h-40 sm:h-56 rounded-xl bg-gray-100 ${className}`} aria-hidden="true" />

  return (
    <div className={`relative group rounded-xl overflow-hidden ${className}`}>
      {shown ? (
        <img src={shown} alt="Our family" className="w-full h-40 sm:h-56 md:h-64 object-cover" />
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full h-32 sm:h-40 rounded-xl border-2 border-dashed border-gray-300 bg-white hover:border-optio-purple hover:bg-optio-purple/5 transition-colors flex flex-col items-center justify-center gap-1.5 text-gray-500 hover:text-optio-purple"
        >
          <CameraIcon className="w-7 h-7" />
          <span className="text-sm font-medium">Add a family photo</span>
          <span className="text-xs text-gray-400">A wide picture works best</span>
        </button>
      )}

      {shown && (
        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 p-3 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity bg-gradient-to-t from-black/40 to-transparent">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="btn-inverse px-3 py-1.5 text-sm"
          >
            <CameraIcon className="w-4 h-4" />
            {busy ? 'Saving...' : 'Change photo'}
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="btn-ghost-inverse px-3 py-1.5 text-sm"
            aria-label="Remove the family photo"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
    </div>
  )
}
