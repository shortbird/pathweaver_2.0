import React from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/outline';

// Pillar colors for task badges
const pillarColors = {
  stem: 'bg-blue-100 text-blue-700',
  wellness: 'bg-green-100 text-green-700',
  communication: 'bg-amber-100 text-amber-700',
  civics: 'bg-indigo-100 text-indigo-700',
  art: 'bg-pink-100 text-pink-700'
};

/**
 * ApproachExampleCard - Displays a starter path with task previews
 *
 * Shows the approach label, description, and a list of tasks that will be
 * created when the student selects this path.
 */
const ApproachExampleCard = ({
  label,
  description,
  tasks = [],
  onSelect,
  isSelecting = false,
  isEnrolled = false,
  accentColor = 'purple-50'
}) => {
  const colorClasses = {
    'purple-50': 'border-purple-200 hover:border-optio-purple',
    'pink-50': 'border-pink-200 hover:border-pink-400',
    'blue-50': 'border-blue-200 hover:border-blue-400',
    'teal-50': 'border-teal-200 hover:border-teal-400'
  };

  const borderClass = colorClasses[accentColor] || 'border-purple-200 hover:border-optio-purple';

  // Calculate total XP for this path
  const totalXP = tasks.reduce((sum, task) => sum + (task.xp_value || 0), 0);

  return (
    <div
      className={`bg-white border-2 ${borderClass} rounded-xl p-4 sm:p-5 transition-all duration-200 hover:shadow-md flex flex-col`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <h3
          className="text-lg font-bold text-gray-900"
          style={{ fontFamily: 'Poppins' }}
        >
          {label}
        </h3>
        {totalXP > 0 && (
          <span className="text-xs font-semibold text-optio-purple bg-optio-purple/10 px-2 py-0.5 rounded-full">
            {totalXP} XP
          </span>
        )}
      </div>

      {/* Description */}
      {description && (
        <p
          className="text-sm text-gray-600 mb-3"
          style={{ fontFamily: 'Poppins' }}
        >
          {description}
        </p>
      )}

      {/* Task List */}
      {tasks.length > 0 && (
        <div className="flex-1 mb-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Starter Tasks
          </div>
          <ul className="space-y-2">
            {tasks.map((task, index) => (
              <li key={index} className="flex items-start gap-2">
                <CheckCircleIcon className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-700 block">{task.title}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${pillarColors[task.pillar] || 'bg-gray-100 text-gray-600'}`}>
                      {task.pillar}
                    </span>
                    <span className="text-xs text-gray-400">{task.xp_value} XP</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Select Button - only show if not enrolled */}
      {!isEnrolled && onSelect && (
        <button
          onClick={onSelect}
          disabled={isSelecting}
          className="w-full mt-auto px-4 py-2.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold text-sm hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily: 'Poppins' }}
        >
          {isSelecting ? 'Starting...' : 'Choose This Path'}
        </button>
      )}
    </div>
  );
};

export default ApproachExampleCard;
