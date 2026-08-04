import React, { useState } from 'react'
import ModalOverlay from '../ui/ModalOverlay'

/**
 * A person's photo, enlarged on click.
 *
 * iCreate filed this twice on 2026-08-04, from /people and from a class roster:
 * "It'd be really helpful if we could click on the image of the person and make
 * it bigger so we could actually see what they look like" — and, for the class
 * roster, "this would help teachers remember who is in their class." A 36px
 * circle is an identicon, not a face.
 *
 * Rendered as a span, not a button: every call site sits inside a clickable row
 * or card, and a nested <button> is invalid HTML. Clicks are stopped here so
 * opening the photo never also opens the row's modal.
 *
 * Only a real photo zooms — initials have nothing to enlarge, so those stay
 * inert and keep the parent row's own click behaviour.
 */

const initialsOf = (name) =>
  (name || '?').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('')

export const PhotoLightbox = ({ src, name, onClose }) => (
  <ModalOverlay onClose={onClose}>
    <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
      <img
        src={src}
        alt={name || 'Photo'}
        className="max-h-[75vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl bg-white"
      />
      {name && <p className="text-white text-lg font-semibold drop-shadow">{name}</p>}
      <button
        type="button"
        onClick={onClose}
        className="text-white/80 hover:text-white text-sm underline"
      >
        Close
      </button>
    </div>
  </ModalOverlay>
)

const PersonPhoto = ({
  src,
  name,
  size = 'w-9 h-9',
  textSize = 'text-xs',
  className = '',
}) => {
  const [zoomed, setZoomed] = useState(false)

  const shared = `${size} rounded-full object-cover flex-shrink-0 ${className}`

  if (!src) {
    return (
      <div
        className={`${size} ${textSize} rounded-full bg-gradient-to-br from-optio-purple to-optio-pink text-white flex items-center justify-center font-semibold flex-shrink-0 ${className}`}
        aria-hidden="true"
      >
        {initialsOf(name)}
      </div>
    )
  }

  const open = (e) => {
    e.stopPropagation()
    e.preventDefault()
    setZoomed(true)
  }

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        // aria-label, not title: the thumbnail is decorative (alt=""), so the
        // control needs its own name, and the label says what clicking does.
        aria-label={name ? `See ${name}'s photo` : 'See the photo'}
        title={name ? `See ${name}'s photo` : 'See the photo'}
        onClick={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open(e) }}
        className="flex-shrink-0 rounded-full cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-optio-purple"
      >
        <img src={src} alt="" className={shared} />
      </span>
      {zoomed && (
        <PhotoLightbox src={src} name={name} onClose={() => setZoomed(false)} />
      )}
    </>
  )
}

export default PersonPhoto
