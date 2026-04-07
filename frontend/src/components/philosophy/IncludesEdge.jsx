import React from 'react'
import { BaseEdge, getSmoothStepPath } from '@xyflow/react'

/**
 * IncludesEdge - Solid curved line for parent-child relationships.
 */
const IncludesEdge = ({
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
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 20,
  })

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: '#d1d5db',
        strokeWidth: 2,
        ...style,
      }}
    />
  )
}

export default IncludesEdge
