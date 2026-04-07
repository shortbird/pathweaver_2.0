import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import DOMPurify from 'dompurify'

/**
 * MobileMindMap - Accordion card list for mobile viewports (<768px).
 * Shows level-1 nodes as expandable cards, children nested inside.
 * Tapping a child opens a bottom sheet with detail content.
 */
const MobileMindMap = ({ nodes, edges }) => {
  const [expandedId, setExpandedId] = useState(null)
  const [detailNode, setDetailNode] = useState(null)

  const level0and1 = nodes
    .filter((n) => n.data.level === 0 || n.data.level === 1)
    .sort((a, b) => (a.data.sortOrder || 0) - (b.data.sortOrder || 0))

  const level2 = nodes.filter((n) => n.data.level === 2)

  // Find cross-cutting connections for a node (connects_to edges to other level-1 nodes)
  const getRelated = (nodeId) => {
    const related = []
    edges.forEach((e) => {
      if (e.data.edgeType !== 'connects_to') return
      if (e.source === nodeId) {
        const target = nodes.find((n) => n.id === e.target && n.data.level === 1)
        if (target) related.push({ label: target.data.label, edgeLabel: e.data.labelText })
      }
      if (e.target === nodeId) {
        const source = nodes.find((n) => n.id === e.source && n.data.level === 1)
        if (source) related.push({ label: source.data.label, edgeLabel: e.data.labelText })
      }
    })
    return related
  }

  return (
    <div className="px-4 py-6 space-y-3">
      {level0and1.map((node) => {
        const children = level2.filter((c) => c.data.parentNodeId === node.id)
        const isExpanded = expandedId === node.id
        const related = getRelated(node.id)

        return (
          <div key={node.id} className="rounded-xl overflow-hidden bg-white shadow-sm border border-gray-100">
            {/* Card header */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : node.id)}
              className="w-full text-left p-4 flex items-start gap-3"
            >
              <div
                className="w-1 self-stretch rounded-full flex-shrink-0"
                style={{ backgroundColor: node.data.color }}
              />
              <div className="flex-1 min-w-0">
                <h3
                  className="text-base font-bold text-gray-900 leading-tight"
                  style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700 }}
                >
                  {node.data.label}
                </h3>
                <p
                  className="text-sm text-gray-500 mt-1 leading-snug"
                  style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 500 }}
                >
                  {node.data.summary}
                </p>
              </div>
              <svg
                className={`w-5 h-5 text-gray-400 flex-shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Expanded content */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-2">
                    {/* Read more about this node */}
                    <button
                      onClick={() => setDetailNode(node.data)}
                      className="w-full text-left text-xs font-medium text-optio-purple hover:underline mb-2"
                      style={{ fontFamily: 'Poppins, sans-serif' }}
                    >
                      Read more about {node.data.label}
                    </button>

                    {/* Child nodes */}
                    {children.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => setDetailNode(child.data)}
                        className="w-full text-left p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: child.data.color }}
                          />
                          <h4
                            className="text-sm font-bold text-gray-800"
                            style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600 }}
                          >
                            {child.data.label}
                          </h4>
                        </div>
                        <p
                          className="text-xs text-gray-500 leading-snug ml-4"
                          style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 500 }}
                        >
                          {child.data.summary}
                        </p>
                      </button>
                    ))}

                    {/* Related connections */}
                    {related.length > 0 && (
                      <div className="pt-2 border-t border-gray-100">
                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1"
                          style={{ fontFamily: 'Poppins, sans-serif' }}
                        >
                          Connected to
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {related.map((r, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-[10px] text-gray-500"
                              style={{ fontFamily: 'Poppins, sans-serif' }}
                            >
                              {r.label}
                              {r.edgeLabel && (
                                <span className="text-gray-400">({r.edgeLabel})</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}

      {/* Bottom sheet detail view */}
      <AnimatePresence>
        {detailNode && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setDetailNode(null)}
            />
            {/* Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[80vh] overflow-y-auto"
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>

              {/* Header */}
              <div className="px-5 pb-3 flex items-center justify-between border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: detailNode.color }}
                  />
                  <h3
                    className="text-lg font-bold text-gray-900"
                    style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700 }}
                  >
                    {detailNode.label}
                  </h3>
                </div>
                <button
                  onClick={() => setDetailNode(null)}
                  className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="px-5 py-5">
                {detailNode.imageUrl && (
                  <img
                    src={detailNode.imageUrl}
                    alt={detailNode.label}
                    className="w-full h-40 object-cover rounded-xl mb-4"
                  />
                )}
                {detailNode.summary && (
                  <p
                    className="text-sm text-gray-600 leading-relaxed mb-4 pb-4 border-b border-gray-100"
                    style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 500 }}
                  >
                    {detailNode.summary}
                  </p>
                )}
                {detailNode.detailContent && (
                  <div
                    className="prose prose-sm max-w-none text-gray-700"
                    style={{ fontFamily: 'Poppins, sans-serif' }}
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(detailNode.detailContent),
                    }}
                  />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export default MobileMindMap
