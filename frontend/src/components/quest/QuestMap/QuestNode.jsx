import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { CheckCircleIcon, PlayIcon } from '@heroicons/react/24/solid';

/**
 * QuestNode - A node representing a single quest on the map
 * Shows quest title and status indicator
 */
const QuestNode = memo(({ data }) => {
  const { quest, color, onClick } = data;
  const { title, header_image_url, image_url, user_enrollment, completed_enrollment } = quest;

  const isCompleted = !!completed_enrollment;
  const isInProgress = !!user_enrollment && !isCompleted;

  // Get display image
  const displayImage = header_image_url || image_url;

  // Truncate title
  const truncatedTitle = title.length > 30 ? title.substring(0, 27) + '...' : title;

  return (
    <>
      {/* Hidden handles for edges */}
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      <div
        onClick={onClick}
        className="group cursor-pointer"
      >
        {/* Quest card */}
        <div
          className="relative bg-white rounded-xl shadow-lg overflow-hidden transition-all duration-200 hover:scale-105 hover:shadow-xl"
          style={{
            width: '140px',
            borderLeft: `3px solid ${color}`
          }}
        >
          {/* Image */}
          {displayImage ? (
            <div className="h-16 overflow-hidden">
              <img
                src={displayImage}
                alt={title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>
          ) : (
            <div
              className="h-16 opacity-20"
              style={{ backgroundColor: color }}
            />
          )}

          {/* Status badge */}
          {(isCompleted || isInProgress) && (
            <div className="absolute top-1 right-1">
              {isCompleted ? (
                <CheckCircleIcon className="h-5 w-5 text-green-500 drop-shadow" />
              ) : (
                <PlayIcon className="h-5 w-5 text-optio-purple drop-shadow" />
              )}
            </div>
          )}

          {/* Title */}
          <div className="p-2">
            <p className="text-xs font-medium text-gray-800 line-clamp-2 leading-tight">
              {truncatedTitle}
            </p>
          </div>

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
        </div>

        {/* Connection dot */}
        <div
          className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </>
  );
});

QuestNode.displayName = 'QuestNode';

export default QuestNode;
