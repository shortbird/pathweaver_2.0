import React, { useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import Button from '../../ui/Button';
import { getPillarData, getPillarGradient } from '../../../utils/pillarMappings';
// tierMapping import removed - Phase 2 refactoring (January 2025)
import { CheckCircleIcon, LockClosedIcon } from '@heroicons/react/24/outline';

const QuestCard = ({ quest, onEnroll }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isEnrolling, setIsEnrolling] = useState(false);

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

  // DEBUG: Log pillar data to see what we're receiving
  if (process.env.NODE_ENV === 'development') {
  }

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

  const handleCardClick = () => {
    navigate(`/quests/${quest.id}`);
  };

  return (
    <div
      className="group bg-white rounded-xl overflow-hidden cursor-pointer transition-all duration-300 sm:hover:shadow-xl sm:hover:-translate-y-1 border border-gray-100 touch-manipulation relative"
      onClick={handleCardClick}
    >
      {/* Quest Image Header */}
      {quest.image_url || quest.header_image_url ? (
        <div className="relative h-48 overflow-hidden">
          <img
            src={quest.image_url || quest.header_image_url}
            alt={quest.title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-300 sm:group-hover:scale-105"
          />
          {/* Gradient overlay for better text readability */}
          <div className={`absolute inset-0 bg-gradient-to-t from-black/40 to-transparent`} />
        </div>
      ) : (
        /* Visual Header - Fallback for quests without images */
        <div className={`h-2 bg-gradient-to-r ${dominantPillarGradient}`} />
      )}

      {/* Content Section */}
      <div className="p-4 sm:p-6">
        {/* Title and Description - More prominent */}
        <div className="mb-4">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:group-hover:text-optio-purple transition-colors line-clamp-2 leading-tight">
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
              className="flex-1 !bg-gradient-to-r !from-amber-600 !to-yellow-500 sm:hover:!from-amber-700 sm:hover:!to-yellow-600 !min-h-[44px] touch-manipulation"
              onClick={(e) => {
                e.stopPropagation();
                navigate('/diploma');
              }}
            >
              <CheckCircleIcon className="w-4 h-4 mr-2 flex-shrink-0" />
              <span className="truncate">View on Diploma</span>
            </Button>
          ) : isEnrolled ? (
            // Quest is in progress - show continue button
            <Button
              variant="success"
              size="md"
              className="flex-1 !bg-gradient-to-r !from-indigo-600 !to-blue-500 sm:hover:!from-indigo-700 sm:hover:!to-blue-600 !min-h-[44px] touch-manipulation"
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
            // Quest not started - show start button
            <Button
              variant="primary"
              size="md"
              className="w-full !min-h-[44px] touch-manipulation"
              onClick={handleEnroll}
              loading={isEnrolling}
            >
              <span className="truncate">Start Quest</span>
            </Button>
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