import React, { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

/**
 * MindMapNode - Level 1 major node on the philosophy mind map.
 * Rounded card with colored accent, label + summary.
 * Click triggers zoom-in to children.
 */
const MindMapNode = memo(({ data, selected }) => {
  const { label, summary, color, imageUrl } = data

  return (
    <>
      <Handle type="source" position={Position.Top} id="top-src" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Top} id="top-tgt" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="bottom-src" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Bottom} id="bottom-tgt" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Left} id="left-src" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} id="left-tgt" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} id="right-src" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Right} id="right-tgt" style={{ opacity: 0 }} />

      <div
        className={`
          group cursor-pointer transition-all duration-300
          ${selected ? 'scale-105' : 'hover:scale-[1.03]'}
        `}
        style={{ width: 220 }}
      >
        <div
          className={`
            rounded-2xl bg-white shadow-lg overflow-hidden
            border-2 transition-all duration-300
            ${selected ? 'shadow-xl' : 'hover:shadow-xl'}
          `}
          style={{
            borderColor: selected ? color : `${color}40`,
          }}
        >
          {/* Color accent bar */}
          <div className="h-1.5" style={{ backgroundColor: color }} />

          <div className="p-4">
            {/* Optional image */}
            {imageUrl && (
              <div className="w-full h-20 rounded-lg overflow-hidden mb-3">
                <img
                  src={imageUrl}
                  alt={label}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <h3
              className="text-sm font-bold text-gray-900 leading-tight mb-1"
              style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700 }}
            >
              {label}
            </h3>
            {summary && (
              <p
                className="text-[11px] text-gray-500 leading-snug line-clamp-3"
                style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 500 }}
              >
                {summary}
              </p>
            )}

            {/* Expand hint */}
            <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
              <span className="text-[10px] text-gray-400" style={{ fontFamily: 'Poppins, sans-serif' }}>
                Click to explore
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
})

MindMapNode.displayName = 'MindMapNode'
export default MindMapNode
