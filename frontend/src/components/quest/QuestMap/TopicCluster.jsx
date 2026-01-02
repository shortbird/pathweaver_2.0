import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

/**
 * TopicCluster - A node representing a topic category on the quest map
 * Shows topic name and quest count, expands on click to reveal quests
 */
const TopicCluster = memo(({ data }) => {
  const { label, count, color, isSelected, isExpanded, onClick } = data;

  // Calculate size based on count (min 80, max 140)
  const baseSize = Math.min(140, Math.max(80, 60 + count * 2));
  const size = isExpanded ? baseSize * 1.2 : baseSize;

  return (
    <>
      {/* Hidden handles for edges */}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

      <div
        onClick={onClick}
        className={`
          flex flex-col items-center justify-center rounded-full cursor-pointer
          transition-all duration-300 ease-out
          ${isSelected || isExpanded ? 'ring-4 ring-offset-2' : 'hover:scale-110'}
        `}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: color,
          boxShadow: isExpanded
            ? `0 0 30px ${color}40, 0 10px 40px rgba(0,0,0,0.15)`
            : '0 4px 20px rgba(0,0,0,0.1)',
          ringColor: color
        }}
      >
        {/* Topic name */}
        <span
          className="font-bold text-white text-center px-2 drop-shadow-md"
          style={{ fontSize: isExpanded ? '1rem' : '0.875rem' }}
        >
          {label}
        </span>

        {/* Quest count */}
        <span
          className="text-white/80 font-medium"
          style={{ fontSize: isExpanded ? '0.875rem' : '0.75rem' }}
        >
          {count} quests
        </span>

        {/* Expand indicator */}
        {!isExpanded && (
          <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2">
            <div className="w-2 h-2 rounded-full bg-white/60 animate-pulse" />
          </div>
        )}
      </div>

      {/* Glow effect when expanded */}
      {isExpanded && (
        <div
          className="absolute inset-0 rounded-full animate-pulse"
          style={{
            background: `radial-gradient(circle, ${color}20 0%, transparent 70%)`,
            transform: 'scale(1.5)'
          }}
        />
      )}
    </>
  );
});

TopicCluster.displayName = 'TopicCluster';

export default TopicCluster;
