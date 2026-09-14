import React, { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { CameraIcon } from '@heroicons/react/24/solid'
import { useUploadChildAvatar } from '../../hooks/api/useFamilyChildren'

/**
 * A child's picture, and the way to set it: click the circle, pick an
 * image, done. Used on the child's card on the family dashboard and in
 * their Family Settings tab, so the upload rule (image, under 5MB, the
 * guardian avatar route) is written once.
 *
 * A child with no picture shows their initial with a small camera badge --
 * the hint that a picture can be added, which the plain initial never gave
 * (2026-09-15). The preview swaps in as soon as a file is chosen and falls
 * back if the upload fails.
 */

const SIZES = {
  md: { ring: 'w-16 h-16', text: 'text-xl', badge: 'w-6 h-6', badgeIcon: 'w-3.5 h-3.5', overlayIcon: 'w-5 h-5' },
  lg: { ring: 'w-24 h-24', text: 'text-2xl', badge: 'w-8 h-8', badgeIcon: 'w-4 h-4', overlayIcon: 'w-6 h-6' },
}

export default function ChildAvatarUpload({ childId, name, avatarUrl, size = 'md', onUploaded, className = '' }) {
  const upload = useUploadChildAvatar()
  const inputRef = useRef(null)
  const [preview, setPreview] = useState(avatarUrl || null)
  useEffect(() => { setPreview(avatarUrl || null) }, [avatarUrl])
  // FileReader answers after the upload can: the preview must not land on a
  // picture that has already been saved (or refused).
  const readingRef = useRef(false)

  const s = SIZES[size] || SIZES.md
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  const busy = upload.isPending

  const onFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB')
      return
    }
    readingRef.current = true
    const reader = new FileReader()
    reader.onload = (ev) => { if (readingRef.current) setPreview(ev.target.result) }
    reader.readAsDataURL(file)
    upload.mutate({ childId, file }, {
      onSuccess: (url) => {
        readingRef.current = false
        if (url) setPreview(url)
        toast.success('Profile picture updated')
        onUploaded?.(url)
      },
      onError: (err) => {
        readingRef.current = false
        toast.error(err.response?.data?.error || 'Failed to upload image')
        setPreview(avatarUrl || null)
      },
    })
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={busy}
      className={`relative group flex-shrink-0 rounded-full ${s.ring} ${className}`}
      aria-label={preview ? `Change ${name}'s picture` : `Add a picture for ${name}`}
      title={preview ? 'Change picture' : 'Add a picture'}
    >
      <span className={`block ${s.ring} rounded-full overflow-hidden bg-optio-purple/10 text-optio-purple flex items-center justify-center ${s.text} font-semibold`}>
        {preview ? (
          <img src={preview} alt="" className="w-full h-full object-cover" />
        ) : (
          initial
        )}
      </span>
      {/* No picture yet: a standing badge, not just a hover hint. */}
      {!preview && !busy && (
        <span
          aria-hidden="true"
          className={`absolute -bottom-0.5 -right-0.5 ${s.badge} rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-optio-purple`}
        >
          <CameraIcon className={s.badgeIcon} />
        </span>
      )}
      <span className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
        {busy ? (
          <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
        ) : (
          <CameraIcon className={`${s.overlayIcon} text-white`} />
        )}
      </span>
      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
    </button>
  )
}
