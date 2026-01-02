import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuestEngagement } from '../../hooks/api/useQuests';
import {
  CheckCircleIcon,
  PlayIcon,
  BoltIcon,
  ArrowTrendingUpIcon,
  MoonIcon,
  ArrowPathIcon,
  PlayCircleIcon
} from '@heroicons/react/24/solid';

// Rhythm state configuration for icons and colors
const rhythmConfig = {
  in_flow: {
    icon: BoltIcon,
    bgClass: 'bg-gradient-to-r from-optio-purple/10 to-optio-pink/10',
    textClass: 'text-optio-purple'
  },
  building: {
    icon: ArrowTrendingUpIcon,
    bgClass: 'bg-blue-50',
    textClass: 'text-blue-700'
  },
  resting: {
    icon: MoonIcon,
    bgClass: 'bg-green-50',
    textClass: 'text-green-700'
  },
  fresh_return: {
    icon: ArrowPathIcon,
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-700'
  },
  ready_to_begin: {
    icon: PlayCircleIcon,
    bgClass: 'bg-gray-50',
    textClass: 'text-gray-600'
  },
  ready_when_you_are: {
    icon: PlayCircleIcon,
    bgClass: 'bg-gray-50',
    textClass: 'text-gray-600'
  },
  finding_rhythm: {
    icon: ArrowTrendingUpIcon,
    bgClass: 'bg-blue-50',
    textClass: 'text-blue-700'
  }
};

// Mini heat map component for 7-day activity
const MiniHeatMap = ({ days }) => {
  // Get last 7 days of data
  const today = new Date();
  const last7Days = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayData = days?.find(d => d.date === dateStr);
    last7Days.push({
      date: dateStr,
      intensity: dayData?.intensity || 0
    });
  }

  const getIntensityClass = (intensity) => {
    switch (intensity) {
      case 0: return 'bg-gray-200';
      case 1: return 'bg-purple-200';
      case 2: return 'bg-purple-400';
      case 3: return 'bg-purple-600';
      case 4: return 'bg-gradient-to-r from-optio-purple to-optio-pink';
      default: return 'bg-gray-200';
    }
  };

  return (
    <div className="flex gap-0.5">
      {last7Days.map((day, idx) => (
        <div
          key={day.date}
          className={`w-2.5 h-2.5 rounded-sm ${getIntensityClass(day.intensity)}`}
          title={day.date}
        />
      ))}
    </div>
  );
};

const CompactQuestCard = memo(({ quest }) => {
  const navigate = useNavigate();

  // Extract quest data
  const questData = quest.quests || quest;
  const questId = quest.quest_id || quest.id;

  // Fetch engagement data for this quest
  const { data: engagement } = useQuestEngagement(questId);

  // Determine quest status
  const isCompleted = quest.status === 'completed' || quest.completed_at;

  // Get rhythm state and config
  const rhythmState = engagement?.rhythm?.state || 'ready_to_begin';
  const rhythmDisplay = engagement?.rhythm?.state_display || 'Ready to Begin';
  const config = rhythmConfig[rhythmState] || rhythmConfig.finding_rhythm;
  const RhythmIcon = config.icon;

  const handleClick = () => {
    if (isCompleted) {
      navigate('/diploma');
    } else {
      navigate(`/quests/${questId}`);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="group bg-white rounded-lg border border-gray-200 p-4 cursor-pointer transition-all duration-200 sm:hover:shadow-md sm:hover:border-purple-300 sm:hover:-translate-y-0.5"
    >
      {/* Header with title and status */}
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 flex-1 pr-2 sm:group-hover:text-optio-purple transition-colors">
          {questData.title || 'Untitled Quest'}
        </h3>

        {/* Status indicator */}
        <div className="flex-shrink-0">
          {isCompleted ? (
            <CheckCircleIcon className="w-5 h-5 text-emerald-500" />
          ) : (
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          )}
        </div>
      </div>

      {/* Rhythm indicator with mini heat map */}
      <div className={`flex items-center justify-between mb-3 px-2 py-1.5 rounded-md ${config.bgClass}`}>
        <div className="flex items-center gap-1.5">
          <RhythmIcon className={`w-4 h-4 ${config.textClass}`} />
          <span className={`text-xs font-medium ${config.textClass}`}>
            {rhythmDisplay}
          </span>
        </div>
        <MiniHeatMap days={engagement?.calendar?.days} />
      </div>

      {/* Action button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleClick();
        }}
        className={`w-full px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 min-h-[44px] ${
          isCompleted
            ? 'bg-emerald-50 text-emerald-700 sm:hover:bg-emerald-100'
            : 'bg-green-500 text-white sm:hover:bg-green-600 sm:hover:shadow-md'
        }`}
      >
        {isCompleted ? (
          <>
            <CheckCircleIcon className="w-4 h-4" />
            View Diploma
          </>
        ) : (
          <>
            <PlayIcon className="w-4 h-4" />
            Continue
          </>
        )}
      </button>
    </div>
  );
});

CompactQuestCard.displayName = 'CompactQuestCard';

export default CompactQuestCard;