import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import Button from '../../ui/Button';
import { getPillarData, getPillarGradient } from '../../../utils/pillarMappings';
import { hasFeatureAccess } from '../../../utils/tierMapping';
import { CheckCircle, Lock, User, Clock } from 'lucide-react';

const QuestListItem = ({ quest, onEnroll, onTeamUp }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Check if user can start quests (requires paid tier)
  const canStartQuests = hasFeatureAccess(user?.subscription_tier, 'supported');

  // Simplified data extraction
  const totalXP = quest.total_xp || 0;
  const taskCount = quest.task_count || 0;
  const isEnrolled = quest.user_enrollment;
  const isCompleted = quest.completed_enrollment || (quest.progress && quest.progress.percentage === 100);
  const progressPercentage = quest.progress?.percentage || 0;
  const completedTasks = quest.progress?.completed_tasks || 0;

  // Get dominant pillar for visual accent
  const pillarBreakdown = quest.pillar_breakdown || {};
  const dominantPillar = Object.entries(pillarBreakdown).reduce((max, [pillar, xp]) =>
    xp > (max.xp || 0) ? { pillar, xp } : max, {}).pillar || 'arts_creativity';

  const dominantPillarData = getPillarData(dominantPillar);
  const dominantPillarGradient = getPillarGradient(dominantPillar);

  const handleEnroll = async (e) => {
    e.stopPropagation();
    if (!user) {
      navigate('/login');
      return;
    }

    try {
      await onEnroll(quest.id);
      navigate(`/quests/${quest.id}`);
    } catch (error) {
      // Error handling
    }
  };

  const handleTeamUpClick = (e) => {
    e.stopPropagation();
    if (!user) {
      navigate('/login');
      return;
    }
    onTeamUp(quest);
  };

  const handleCardClick = () => {
    navigate(`/quests/${quest.id}`);
  };

  // Solid colors for pillar badges
  const solidColors = {
    'stem_logic': 'bg-blue-500 text-white',
    'arts_creativity': 'bg-purple-500 text-white',
    'language_communication': 'bg-green-500 text-white',
    'society_culture': 'bg-orange-500 text-white',
    'life_wellness': 'bg-red-500 text-white'
  };

  return (
    <div
      className="group bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all duration-200 cursor-pointer"
      onClick={handleCardClick}
    >
      <div className="flex items-center gap-4">
        {/* Visual Accent */}
        <div className={`w-1 h-16 rounded-full bg-gradient-to-b ${dominantPillarGradient} flex-shrink-0`} />

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            {/* Title and Description */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-[#6d469b] transition-colors">
                {quest.title}
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed line-clamp-2 mb-2">
                {quest.big_idea || quest.description}
              </p>

              {/* Meta Info */}
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{taskCount} {taskCount === 1 ? 'Task' : 'Tasks'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${dominantPillarGradient}`} />
                  <span>{totalXP} XP</span>
                </div>
              </div>
            </div>

            {/* Pillars and Actions */}
            <div className="flex items-start gap-4 flex-shrink-0">
              {/* Pillar Badges */}
              <div className="flex flex-wrap gap-1 max-w-xs">
                {Object.entries(pillarBreakdown)
                  .filter(([_, xp]) => xp > 0)
                  .sort(([_, a], [__, b]) => b - a)
                  .slice(0, 3)
                  .map(([pillar, xp]) => {
                    const pillarData = getPillarData(pillar);
                    const solidColor = solidColors[pillar] || 'bg-gray-500 text-white';

                    return (
                      <div
                        key={pillar}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${solidColor}`}
                        title={`${pillarData.name}: +${xp} XP`}
                      >
                        <span className="truncate">{pillarData.name}</span>
                        <span className="font-bold">+{xp}</span>
                      </div>
                    );
                  })}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {isCompleted ? (
                  <Button
                    variant="primary"
                    size="sm"
                    className="!bg-emerald-500 hover:!bg-emerald-600 !min-w-[120px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate('/diploma');
                    }}
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    <span>View Diploma</span>
                  </Button>
                ) : isEnrolled ? (
                  <Button
                    variant="success"
                    size="sm"
                    className="!min-w-[120px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/quests/${quest.id}`);
                    }}
                  >
                    <span>Continue Quest</span>
                  </Button>
                ) : (
                  <>
                    {canStartQuests ? (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          className="!min-w-[100px]"
                          onClick={handleEnroll}
                        >
                          <span>Start Quest</span>
                        </Button>
                        <button
                          onClick={handleTeamUpClick}
                          className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                          title="Team up for bonus XP!"
                        >
                          <User className="w-4 h-4 text-gray-600" />
                        </button>
                      </>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="!bg-gray-100 !text-gray-600 hover:!bg-gray-200 !min-w-[120px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/subscription');
                        }}
                      >
                        <Lock className="w-4 h-4 mr-1" />
                        <span>Upgrade</span>
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          {isCompleted ? (
            <div className="mt-3">
              <div className="flex items-center gap-2 text-xs text-emerald-600 mb-2">
                <CheckCircle className="w-3 h-3" />
                <span className="font-medium">Completed</span>
              </div>
              <div className="w-full bg-emerald-100 rounded-full h-1.5">
                <div className="bg-emerald-500 h-1.5 rounded-full w-full" />
              </div>
            </div>
          ) : isEnrolled && progressPercentage > 0 ? (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                <span className="font-medium">Progress: {completedTasks}/{taskCount} tasks</span>
                <span className="font-bold">{Math.round(progressPercentage)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className={`bg-gradient-to-r ${dominantPillarGradient} h-1.5 rounded-full transition-all duration-300`}
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
          ) : isEnrolled ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-blue-600">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span>Ready to start</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default memo(QuestListItem);