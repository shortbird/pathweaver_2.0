import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import DOMPurify from 'dompurify'

/**
 * NodeDetailPanel - Slide-out panel from the right showing node detail content.
 */
const NodeDetailPanel = ({ node, onClose }) => {
  const panelRef = useRef(null)

  // Close on click outside
  useEffect(() => {
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose()
      }
    }
    if (node) {
      // Delay adding listener so the click that opened it doesn't immediately close
      const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClick)
      }, 100)
      return () => {
        clearTimeout(timer)
        document.removeEventListener('mousedown', handleClick)
      }
    }
  }, [node, onClose])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          ref={panelRef}
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="absolute top-0 right-0 h-full w-full sm:w-[400px] bg-white shadow-2xl z-50 overflow-y-auto border-l border-gray-200"
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: node.color }}
              />
              <h2
                className="text-lg font-bold text-gray-900"
                style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700 }}
              >
                {node.label}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
              aria-label="Close panel"
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-6">
            {/* Image */}
            {node.imageUrl && (
              <div className="w-full rounded-xl overflow-hidden mb-6">
                <img
                  src={node.imageUrl}
                  alt={node.label}
                  className="w-full h-48 object-cover"
                />
              </div>
            )}

            {/* Summary */}
            {node.summary && (
              <p
                className="text-sm text-gray-600 leading-relaxed mb-6 pb-6 border-b border-gray-100"
                style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 500 }}
              >
                {node.summary}
              </p>
            )}

            {/* Rich text detail */}
            {node.detailContent && (
              <div
                className="prose prose-sm max-w-none text-gray-700 philosophy-detail-content"
                style={{ fontFamily: 'Poppins, sans-serif' }}
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(node.detailContent),
                }}
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default NodeDetailPanel
