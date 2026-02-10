import React from 'react';
import { CheckCircleIcon, PlayIcon } from '@heroicons/react/24/solid';

// Topic color mapping
const TOPIC_COLORS = {
  Creative: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  Science: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  Building: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  Nature: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
  Business: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  Personal: { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200' },
  Academic: { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
  Food: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  Games: { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200' }
};

const getTopicColors = (topic) => {
  return TOPIC_COLORS[topic] || { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' };
};

/**
 * QuestCard - Clean, visual quest card for discovery
 * Shows: header image, title, big idea, topics, and status
 */
const QuestCard = ({ quest, onClick }) => {
  const {
    id,
    title,
    big_idea,
    description,
    header_image_url,
    image_url,
    topic_primary,
    topics = [],
    user_enrollment,
    completed_enrollment,
    quest_type
  } = quest;

  // Determine quest status
  const isCompleted = !!completed_enrollment;
  const isInProgress = !!user_enrollment && !isCompleted;
  const isStarted = isCompleted || isInProgress;

  // Get display image (header_image_url or image_url or placeholder)
  const displayImage = header_image_url || image_url || '/images/quest-placeholder.jpg';

  // Get display text (big_idea or description, truncated)
  const displayText = big_idea || description || '';
  const truncatedText = displayText.length > 120
    ? displayText.substring(0, 120) + '...'
    : displayText;

  // Get topics to display (max 2)
  const displayTopics = topic_primary
    ? [topic_primary, ...topics.filter(t => t !== topic_primary)].slice(0, 2)
    : topics.slice(0, 2);

  return (
    <div
      onClick={onClick}
      className="group bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-gray-200 hover:-translate-y-1"
    >
      {/* Header Image */}
      <div className="relative h-40 overflow-hidden">
        <img
          src={displayImage}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={(e) => {
            e.target.src = '/images/quest-placeholder.jpg';
          }}
        />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

        {/* Status badge */}
        {isStarted && (
          <div className="absolute top-3 right-3">
            {isCompleted ? (
              <div className="flex items-center gap-1 bg-green-500 text-white text-xs font-medium px-2 py-1 rounded-full">
                <CheckCircleIcon className="h-3.5 w-3.5" />
                <span>Completed</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 bg-optio-purple text-white text-xs font-medium px-2 py-1 rounded-full">
                <PlayIcon className="h-3.5 w-3.5" />
                <span>In Progress</span>
              </div>
            )}
          </div>
        )}

        {/* Quest type badge - Legacy: will be removed after migration */}
        {/* Keeping badge for quests that have required tasks */}

        {/* Title overlay at bottom of image */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="text-lg font-semibold text-white line-clamp-2 drop-shadow-md">
            {title}
          </h3>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4">
        {/* Big Idea / Description */}
        {truncatedText && (
          <p className="text-gray-600 text-sm mb-3 line-clamp-2">
            {truncatedText}
          </p>
        )}

        {/* Topics */}
        {displayTopics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {displayTopics.map((topic) => {
              const colors = getTopicColors(topic);
              return (
                <span
                  key={topic}
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} ${colors.border} border`}
                >
                  {topic}
                </span>
              );
            })}
          </div>
        )}

        {/* Explore button */}
        <button
          className={`w-full py-2 rounded-lg font-medium text-sm transition-colors ${
            isCompleted
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : isInProgress
              ? 'bg-optio-purple/10 text-optio-purple hover:bg-optio-purple/20'
              : 'bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:opacity-90'
          }`}
        >
          {isCompleted ? 'View Quest' : isInProgress ? 'Continue Quest' : 'Explore Quest'}
        </button>
      </div>
    </div>
  );
};

export default QuestCard;
