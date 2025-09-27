import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getPillarData, getPillarGradient } from '../../utils/pillarMappings';
import { CheckCircleIcon, PlayIcon } from '@heroicons/react/24/solid';

const CompactQuestCard = ({ quest }) => {
  const navigate = useNavigate();

  // Extract quest data
  const questData = quest.quests || quest;
  const questId = quest.quest_id || quest.id;
  const tasksCompleted = quest.tasks_completed || quest.completed_tasks || 0;
  const totalTasks = questData.task_count || questData.total_tasks || 1;
  const progressPercent = totalTasks > 0 ? Math.round((tasksCompleted / totalTasks) * 100) : 0;

  // Determine quest status
  const isCompleted = progressPercent === 100 || quest.status === 'completed' || quest.completed_at;
  const isEnded = quest.status === 'ended' || quest.ended_at;
  const isActive = !isCompleted && !isEnded;

  // Get pillar for styling
  const pillarBreakdown = questData.pillar_breakdown || {};
  const dominantPillar = Object.entries(pillarBreakdown).reduce((max, [pillar, xp]) =>
    xp > (max.xp || 0) ? { pillar, xp } : max, {}).pillar || 'arts_creativity';
  const dominantPillarGradient = getPillarGradient(dominantPillar);

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
      className="group bg-white rounded-lg border border-gray-200 p-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-purple-300 hover:-translate-y-0.5"
    >
      {/* Header with title and status */}
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 flex-1 pr-2 group-hover:text-purple-600 transition-colors">
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

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
          <span>{tasksCompleted}/{totalTasks} tasks</span>
          <span className="font-medium">{progressPercent}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className={`h-1.5 bg-gradient-to-r ${dominantPillarGradient} rounded-full transition-all duration-300`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Action button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleClick();
        }}
        className={`w-full px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
          isCompleted
            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            : 'bg-green-500 text-white hover:bg-green-600 hover:shadow-md'
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
};

export default CompactQuestCard;