import { useEffect } from 'react'

/**
 * Hook to register keyboard shortcuts. Shortcuts are disabled when
 * the user is typing in an input, textarea, or select element.
 *
 * @param {Object} shortcuts - Map of key -> handler function
 */
const useKeyboardShortcuts = (shortcuts) => {
  useEffect(() => {
    const handler = (e) => {
      // Don't trigger shortcuts when typing in form elements
      const tag = e.target.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (e.target.isContentEditable) return

      // Don't trigger if modifier keys are held (except Shift for ?)
      if (e.ctrlKey || e.altKey || e.metaKey) return

      const key = e.key
      const fn = shortcuts[key]
      if (fn) {
        e.preventDefault()
        fn()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [shortcuts])
}

export default useKeyboardShortcuts
