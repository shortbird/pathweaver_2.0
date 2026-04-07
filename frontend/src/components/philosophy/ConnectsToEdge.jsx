import React from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react'

/**
 * ConnectsToEdge - Dashed curved line with label for cross-cutting connections.
 * Uses edge ID to generate a consistent curvature offset so parallel edges don't overlap.
 */
const ConnectsToEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
}) => {
  // Generate a stable offset from the edge ID so parallel edges curve differently
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const curvatureOffset = ((hash % 5) - 2) * 30

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.25 + curvatureOffset * 0.005,
  })

  const labelText = data?.labelText

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: '#9ca3af',
          strokeWidth: 1.5,
          strokeDasharray: '6 4',
          ...style,
        }}
      />
      {labelText && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + curvatureOffset * 0.3}px)`,
              pointerEvents: 'all',
            }}
          >
            <span
              className="px-2 py-0.5 rounded-full bg-white/90 text-[10px] text-gray-500 font-medium whitespace-nowrap border border-gray-200 shadow-sm"
              style={{ fontFamily: 'Poppins, sans-serif' }}
            >
              {labelText}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export default ConnectsToEdge
