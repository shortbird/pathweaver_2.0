import React, { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

/**
 * MindMapChildNode - Level 2 child node on the philosophy mind map.
 * Smaller card. Click opens the detail panel.
 */
const MindMapChildNode = memo(({ data, selected }) => {
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
          cursor-pointer transition-all duration-300
          ${selected ? 'scale-105' : 'hover:scale-[1.03]'}
        `}
        style={{ width: 180 }}
      >
        <div
          className={`
            rounded-xl bg-white shadow-md overflow-hidden
            border transition-all duration-300
            ${selected ? 'shadow-lg' : 'hover:shadow-lg'}
          `}
          style={{
            borderColor: selected ? color : `${color}30`,
          }}
        >
          {/* Color dot + label */}
          <div className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <h4
                className="text-xs font-bold text-gray-800 leading-tight"
                style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700 }}
              >
                {label}
              </h4>
            </div>
            {summary && (
              <p
                className="text-[10px] text-gray-500 leading-snug line-clamp-2 ml-[18px]"
                style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 500 }}
              >
                {summary}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  )
})

MindMapChildNode.displayName = 'MindMapChildNode'
export default MindMapChildNode
