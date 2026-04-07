import React, { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

/**
 * CenterNode - The single top-level node: "The Process Is The Goal".
 * Larger and more prominent than major nodes.
 */
const CenterNode = memo(({ data, selected }) => {
  const { label, summary, color } = data

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
        style={{ width: 280 }}
      >
        <div
          className={`
            rounded-2xl overflow-hidden shadow-xl
            border-2 transition-all duration-300
            bg-gradient-to-br from-optio-purple to-optio-pink
            ${selected ? 'shadow-2xl' : 'hover:shadow-2xl'}
          `}
          style={{
            borderColor: selected ? '#fff' : 'rgba(255,255,255,0.3)',
          }}
        >
          <div className="p-6 text-center">
            <h2
              className="text-lg font-bold text-white leading-tight mb-2"
              style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700 }}
            >
              {label}
            </h2>
            {summary && (
              <p
                className="text-[11px] text-white/70 leading-snug line-clamp-3"
                style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 500 }}
              >
                {summary}
              </p>
            )}

            {/* Expand hint */}
            <div className="flex items-center justify-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <svg className="w-3 h-3 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
              <span className="text-[10px] text-white/50" style={{ fontFamily: 'Poppins, sans-serif' }}>
                Click to explore
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
})

CenterNode.displayName = 'CenterNode'
export default CenterNode
