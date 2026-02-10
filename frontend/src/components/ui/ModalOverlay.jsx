import React from 'react'
import { createPortal } from 'react-dom'

/**
 * ModalOverlay - Simple portal wrapper for custom modal layouts
 *
 * USE THIS when you need a custom modal layout that doesn't fit the standard Modal component.
 * This ensures the modal renders at document.body level, preventing issues with
 * parent elements that have CSS transforms (which break fixed positioning).
 *
 * IMPORTANT: Always use either Modal or ModalOverlay for modals - never use
 * raw "fixed inset-0" without a portal, as it will break in containers with transforms.
 */
export default function ModalOverlay({
  children,
  onClose,
  closeOnOverlayClick = true,
  className = '',
}) {
  // Use mouseDown instead of click for more reliable overlay closing
  // This prevents issues with click events from form elements
  const handleOverlayMouseDown = (e) => {
    // Only close if clicking directly on the overlay backdrop, not on children
    if (closeOnOverlayClick && e.target === e.currentTarget && onClose) {
      onClose()
    }
  }

  const handleKeyDown = React.useCallback(
    (e) => {
      if (e.key === 'Escape' && onClose) {
        onClose()
      }
    },
    [onClose]
  )

  React.useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    // Prevent body scroll when modal is open
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [handleKeyDown])

  return createPortal(
    <div
      className={`fixed top-0 left-0 right-0 bottom-0 w-full h-full bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto ${className}`}
      onMouseDown={handleOverlayMouseDown}
    >
      {children}
    </div>,
    document.body
  )
}
