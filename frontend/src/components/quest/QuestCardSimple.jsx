import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuestEngagement } from '../../hooks/api/useQuests';
import {
  SparklesIcon,
  ArrowTrendingUpIcon,
  PauseCircleIcon,
  SunIcon,
  PlayCircleIcon
} from '@heroicons/react/24/solid';

// Rhythm state configuration
const rhythmConfig = {
  in_flow: {
    icon: SparklesIcon,
    bgClass: 'bg-gradient-to-r from-optio-purple/10 to-optio-pink/10',
    textClass: 'text-optio-purple'
  },
  building: {
    icon: ArrowTrendingUpIcon,
    bgClass: 'bg-blue-50',
    textClass: 'text-blue-700'
  },
  resting: {
    icon: PauseCircleIcon,
    bgClass: 'bg-green-50',
    textClass: 'text-green-700'
  },
  fresh_return: {
    icon: SunIcon,
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
    <div className="flex gap-1">
      {last7Days.map((day) => (
        <div
          key={day.date}
          className={`w-3 h-3 rounded-sm ${getIntensityClass(day.intensity)}`}
          title={day.date}
        />
      ))}
    </div>
  );
};

const QuestCardSimple = ({ quest }) => {
  const navigate = useNavigate();

  // Fetch engagement data for this quest
  const { data: engagement } = useQuestEngagement(quest.id);

  const handleCardClick = () => {
    navigate(`/quests/${quest.id}`);
  };

  // Determine quest state
  const isCompleted = quest.completed_enrollment || (quest.progress && quest.progress.percentage === 100);
  const isInProgress = quest.user_enrollment && !isCompleted;
  const isNotStarted = !quest.user_enrollment;

  // Get rhythm state and config
  const rhythmState = engagement?.rhythm?.state || 'ready_to_begin';
  const rhythmDisplay = engagement?.rhythm?.state_display || 'Ready to Begin';
  const config = rhythmConfig[rhythmState] || rhythmConfig.finding_rhythm;
  const RhythmIcon = config.icon;

  // Get next incomplete task
  const nextTask = quest.quest_tasks?.find(task => !task.is_completed);
  const nextTaskTitle = nextTask?.title || 'Continue your quest';

  return (
    <div
      className="group bg-white rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border border-gray-100"
      onClick={handleCardClick}
    >
      {/* Image Section with Title Overlay */}
      <div className="relative h-36 overflow-hidden">
        {/* Private Quest Badge - Only visible to creator */}
        {quest.is_public === false && (
          <div className="absolute top-3 left-3 z-10">
            <div className="flex items-center gap-1.5 bg-optio-purple text-white px-2 py-0.5 rounded-full text-xs font-semibold shadow-lg">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              Private
            </div>
          </div>
        )}

        {/* Check if this is an OnFire course quest */}
        {quest.lms_platform === 'spark' ? (
          /* OnFire Quest: White background with logo on the right */
          <div className="w-full h-full bg-white flex items-center justify-between px-4">
            {/* Title on the left */}
            <h3 className="text-gray-900 text-base sm:text-lg font-bold leading-tight line-clamp-3 flex-1 pr-4" style={{ fontFamily: 'Poppins' }}>
              {quest.title}
            </h3>
            {/* OnFire logo on the right */}
            <div className="flex-shrink-0">
              <img
                src="https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/logos/onfire.png"
                alt="OnFire quest designation badge"
                className="h-16 w-auto object-contain"
                onError={(e) => {
                  console.error('Failed to load OnFire logo');
                  e.target.style.display = 'none';
                }}
              />
            </div>
          </div>
        ) : (
          /* Regular Quest: Background image with overlay */
          <>
            {/* Background Image */}
            {quest.image_url || quest.header_image_url ? (
              <img
                src={quest.image_url || quest.header_image_url}
                alt={`Quest: ${quest.title}`}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              /* Fallback gradient if no image */
              <div className="w-full h-full bg-gradient-to-br bg-gradient-primary" />
            )}

            {/* Gradient Overlay for Text Readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />

            {/* Title Overlay */}
            <div className="absolute inset-x-0 bottom-0 p-4">
              <h3 className="text-white text-base sm:text-lg font-bold leading-tight drop-shadow-lg line-clamp-2">
                {quest.title}
              </h3>
            </div>
          </>
        )}
      </div>

      {/* Conditional Section: Three states - Not Started, In Progress, Completed */}
      {/* All states use h-[140px] to match course cards */}
      {isCompleted ? (
        /* Completed: View on Diploma Button */
        <div className="flex flex-col h-[140px]">
          <div className="flex-grow bg-white px-4 py-3">
            <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
              {quest.description || quest.big_idea || 'Quest completed!'}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate('/diploma');
            }}
            className="mt-auto w-full px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold transition-all duration-200 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            View on Diploma
          </button>
        </div>
      ) : isInProgress ? (
        /* In-Progress: Next Task + Rhythm + Continue Button */
        <div className="flex flex-col h-[170px]">
          {/* Content Section */}
          <div className="flex-grow bg-white px-4 py-3 flex flex-col justify-center gap-2">
            {/* Next up */}
            <div className="truncate">
              <span className="text-xs text-gray-400 font-medium">Next up</span>
              <p className="text-sm text-gray-800 font-medium truncate">{nextTaskTitle}</p>
            </div>
            {/* Rhythm indicator with heat map */}
            <div className={`w-full flex items-center justify-between px-3 py-2 rounded-lg ${config.bgClass}`}>
              <div className="flex items-center gap-2">
                <RhythmIcon className={`w-5 h-5 ${config.textClass}`} />
                <span className={`text-sm font-semibold ${config.textClass}`}>
                  {rhythmDisplay}
                </span>
              </div>
              <MiniHeatMap days={engagement?.calendar?.days} />
            </div>
          </div>

          {/* Continue Button - Green for quests, anchored to bottom */}
          <div className="mt-auto px-4 py-3 bg-green-600 hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            <span className="font-bold text-sm text-white">Continue</span>
          </div>
        </div>
      ) : (
        /* Not Started: Description + Start Button */
        <div className="flex flex-col h-[140px]">
          <div className="flex-grow bg-white px-4 py-3">
            <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
              {quest.description || quest.big_idea || 'Explore this quest to learn more.'}
            </p>
          </div>
          {/* Start Quest Button - Optio gradient, anchored to bottom */}
          <div className="mt-auto px-4 py-3 bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            <span className="font-bold text-sm text-white">Start Quest</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(QuestCardSimple);
