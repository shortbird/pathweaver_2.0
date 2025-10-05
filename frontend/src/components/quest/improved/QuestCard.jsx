import React, { useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import Button from '../../ui/Button';
import { getPillarData, getPillarGradient } from '../../../utils/pillarMappings';
import { hasFeatureAccess } from '../../../utils/tierMapping';
import { CheckCircle, Lock } from 'lucide-react';

const QuestCard = ({ quest, onEnroll, onTeamUp }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isEnrolling, setIsEnrolling] = useState(false);
  
  // Check if user can start quests (requires paid tier)
  const canStartQuests = hasFeatureAccess(user?.subscription_tier, 'supported');

  // Simplified data extraction
  // Note: In personalized quest system, XP and task count are user-specific
  // Don't show these on quest cards since they vary per student
  const isEnrolled = quest.user_enrollment;
  const isCompleted = quest.completed_enrollment || (quest.progress && quest.progress.percentage === 100);
  const progressPercentage = quest.progress?.percentage || 0;
  const completedTasks = quest.progress?.completed_tasks || 0;
  const totalTasks = quest.progress?.total_tasks || 0;

  // Get dominant pillar for visual accent
  const pillarBreakdown = quest.pillar_breakdown || {};
  const dominantPillar = Object.entries(pillarBreakdown).reduce((max, [pillar, xp]) => 
    xp > (max.xp || 0) ? { pillar, xp } : max, {}).pillar || 'arts_creativity';

  // Get pillar data safely - handles both old and new pillar keys
  const dominantPillarData = getPillarData(dominantPillar);
  const dominantPillarGradient = getPillarGradient(dominantPillar);


  const handleEnroll = async (e) => {
    e.stopPropagation();
    if (!user) {
      navigate('/login');
      return;
    }
    
    setIsEnrolling(true);
    try {
      await onEnroll(quest.id);
      // Navigate to quest page after successful enrollment
      navigate(`/quests/${quest.id}`);
    } finally {
      setIsEnrolling(false);
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

  return (
    <div
      className="group bg-white rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border border-gray-100 touch-manipulation relative"
      onClick={handleCardClick}
    >
      {/* Visual Header - Smaller and more subtle */}
      <div className={`h-2 bg-gradient-to-r ${dominantPillarGradient}`} />
      
      {/* Content Section */}
      <div className="p-4 sm:p-6">
        {/* Title and Description - More prominent */}
        <div className="mb-4">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 group-hover:text-[#6d469b] transition-colors line-clamp-2 leading-tight">
            {quest.title}
          </h3>
          <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
            {quest.big_idea || quest.description}
          </p>
        </div>

        {/* School Subjects Section */}
        <div className="mb-5">
          {/* School Subjects Display */}
          {(() => {
            // Extract unique school subjects from all tasks
            const schoolSubjects = new Set();
            quest.quest_tasks?.forEach(task => {
              if (task.school_subjects && Array.isArray(task.school_subjects)) {
                task.school_subjects.forEach(subject => schoolSubjects.add(subject));
              }
            });
            
            if (schoolSubjects.size > 0) {
              const subjectNames = {
                'language_arts': 'Language Arts',
                'math': 'Math',
                'science': 'Science',
                'social_studies': 'Social Studies',
                'financial_literacy': 'Financial Literacy',
                'health': 'Health',
                'pe': 'PE',
                'fine_arts': 'Fine Arts',
                'cte': 'CTE',
                'digital_literacy': 'Digital Literacy',
                'electives': 'Electives'
              };
              
              const sortedSubjects = Array.from(schoolSubjects).sort();
              const displaySubjects = sortedSubjects.slice(0, 4); // Show max 4 subjects
              
              return (
                <div className="mt-3">
                  <div className="flex items-center gap-1 mb-2">
                    <span className="text-xs text-gray-500 font-medium">Diploma Credit:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {displaySubjects.map(subject => (
                      <div 
                        key={subject}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100"
                      >
                        <span>{subjectNames[subject] || subject}</span>
                      </div>
                    ))}
                    {sortedSubjects.length > 4 && (
                      <div className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
                        +{sortedSubjects.length - 4} more
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* Action Buttons - Clearer differentiation */}
        <div className="flex gap-2 sm:gap-3">
          {isCompleted ? (
            // Quest is completed - show diploma button with gold accent
            <Button
              variant="primary"
              size="md"
              className="flex-1 !bg-gradient-to-r !from-amber-600 !to-yellow-500 hover:!from-amber-700 hover:!to-yellow-600 !min-h-[48px] touch-manipulation"
              onClick={(e) => {
                e.stopPropagation();
                navigate('/diploma');
              }}
            >
              <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0" />
              <span className="truncate">View on Diploma</span>
            </Button>
          ) : isEnrolled ? (
            // Quest is in progress - show continue button
            <Button
              variant="success"
              size="md"
              className="flex-1 !bg-gradient-to-r !from-indigo-600 !to-blue-500 hover:!from-indigo-700 hover:!to-blue-600 !min-h-[48px] touch-manipulation"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/quests/${quest.id}`);
              }}
            >
              <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              <span className="truncate">Continue</span>
            </Button>
          ) : (
            // Quest not started - show different buttons based on tier
            <>
              {canStartQuests ? (
                // Paid tier users - show start and team up buttons
                <>
                  <Button
                    variant="primary"
                    size="md"
                    className="flex-1 !min-h-[48px] touch-manipulation"
                    onClick={handleEnroll}
                    loading={isEnrolling}
                  >
                    <span className="truncate">Start Quest</span>
                  </Button>
                  
                  <button
                    onClick={handleTeamUpClick}
                    className="p-3 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors group/team min-h-[48px] min-w-[48px] flex items-center justify-center touch-manipulation"
                    title="Team up for bonus XP!"
                    aria-label="Team up for bonus XP"
                  >
                    <svg className="w-5 h-5 text-gray-600 group-hover/team:text-[#6d469b]" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                    </svg>
                  </button>
                </>
              ) : (
                // Free tier users - show upgrade button
                <Button
                  variant="secondary"
                  size="md"
                  className="flex-1 !bg-gray-100 !text-gray-600 hover:!bg-gray-200 !min-h-[48px] touch-manipulation"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/subscription');
                  }}
                >
                  <Lock className="w-4 h-4 mr-2 flex-shrink-0" />
                  <span className="truncate">Upgrade to Start</span>
                </Button>
              )}
            </>
          )}
        </div>

        {/* Progress Bar and Status - Only for in-progress quests */}
        {!isCompleted && isEnrolled && progressPercentage > 0 && totalTasks > 0 ? (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
              <span className="font-medium">Progress: {completedTasks}/{totalTasks} tasks</span>
              <span className="font-bold">{Math.round(progressPercentage)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`bg-gradient-to-r ${dominantPillarGradient} h-2 rounded-full transition-all duration-300`}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        ) : !isCompleted && isEnrolled ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-blue-600">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span>Ready to start</span>
          </div>
        ) : null}
      </div>

    </div>
  );
};

export default memo(QuestCard);