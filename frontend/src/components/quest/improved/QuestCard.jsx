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
  const totalXP = quest.total_xp || 0;
  const taskCount = quest.task_count || 0;
  const isEnrolled = quest.user_enrollment;
  const isCompleted = quest.completed_enrollment;

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
      className="group bg-white rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border border-gray-100"
      onClick={handleCardClick}
    >
      {/* Visual Header - Smaller and more subtle */}
      <div className={`h-2 bg-gradient-to-r ${dominantPillarGradient}`} />
      
      {/* Content Section */}
      <div className="p-6">
        {/* Title and Description - More prominent */}
        <div className="mb-4">
          <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-[#6d469b] transition-colors line-clamp-2">
            {quest.title}
          </h3>
          <p className="text-gray-600 text-sm line-clamp-3 leading-relaxed">
            {quest.big_idea || quest.description}
          </p>
        </div>

        {/* Meta Information - Cleaner presentation */}
        <div className="flex items-center gap-4 mb-4 text-sm">
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-gray-600">{taskCount} {taskCount === 1 ? 'Task' : 'Tasks'}</span>
          </div>
        </div>

        {/* Pillars with XP - Show all pillars */}
        <div className="mb-5">
          {/* Total XP Badge */}
          <div className="flex items-center gap-2 mb-3">
            <div className={`px-3 py-1.5 rounded-full bg-gradient-to-r ${dominantPillarGradient} text-white text-sm font-bold shadow-md`}>
              {totalXP} Total XP
            </div>
          </div>
          
          {/* Individual Pillar XP Breakdown */}
          {Object.keys(pillarBreakdown).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(pillarBreakdown)
                .filter(([_, xp]) => xp > 0)
                .sort(([_, a], [__, b]) => b - a)
                .map(([pillar, xp]) => {
                  const pillarData = getPillarData(pillar);
                  return (
                    <div 
                      key={pillar}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md ${pillarData.bg} ${pillarData.text} text-xs font-medium`}
                    >
                      <span>{pillarData.name}</span>
                      <span className="font-bold">+{xp}</span>
                    </div>
                  );
                })}
            </div>
          )}
          
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
                        <span>📚</span>
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

        {/* Action Buttons - Cleaner design */}
        <div className="flex gap-2">
          {isCompleted ? (
            // Quest is completed - show diploma button
            <Button
              variant="primary"
              size="sm"
              className="flex-1 !bg-gradient-to-r !from-emerald-500 !to-green-500 hover:!from-emerald-600 hover:!to-green-600"
              onClick={(e) => {
                e.stopPropagation();
                navigate('/diploma');
              }}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Completed! View Diploma
            </Button>
          ) : isEnrolled ? (
            // Quest is in progress - show continue button
            <Button
              variant="success"
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/quests/${quest.id}`);
              }}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Continue Quest
            </Button>
          ) : (
            // Quest not started - show different buttons based on tier
            <>
              {canStartQuests ? (
                // Paid tier users - show start and team up buttons
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    onClick={handleEnroll}
                    loading={isEnrolling}
                  >
                    Start Quest
                  </Button>
                  
                  <button
                    onClick={handleTeamUpClick}
                    className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors group/team"
                    title="Team up for bonus XP!"
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
                  size="sm"
                  className="flex-1 !bg-gray-100 !text-gray-600 hover:!bg-gray-200"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/subscription');
                  }}
                >
                  <Lock className="w-4 h-4 mr-2" />
                  Upgrade to Start
                </Button>
              )}
            </>
          )}
        </div>

        {/* Enrollment Status Indicator */}
        {isCompleted ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600">
            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
            <span>Completed</span>
          </div>
        ) : isEnrolled && (
          <div className="mt-3 flex items-center gap-2 text-xs text-green-600">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>In Progress</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(QuestCard);