import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import Button from '../../ui/Button';

const QuestCard = ({ quest, onEnroll, onTeamUp }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isEnrolling, setIsEnrolling] = useState(false);

  // Simplified data extraction
  const totalXP = quest.total_xp || 0;
  const taskCount = quest.task_count || 0;
  const isEnrolled = quest.user_enrollment;
  const estimatedTime = quest.estimated_time || '2-3 hours';
  const difficulty = quest.difficulty || 'intermediate';

  // Get dominant pillar for visual accent
  const pillarBreakdown = quest.pillar_breakdown || {};
  const dominantPillar = Object.entries(pillarBreakdown).reduce((max, [pillar, xp]) => 
    xp > (max.xp || 0) ? { pillar, xp } : max, {}).pillar || 'creativity';

  const pillarColors = {
    creativity: { gradient: 'from-purple-500 to-pink-500', bg: 'bg-purple-100', text: 'text-purple-700' },
    critical_thinking: { gradient: 'from-blue-500 to-cyan-500', bg: 'bg-blue-100', text: 'text-blue-700' },
    practical_skills: { gradient: 'from-green-500 to-emerald-500', bg: 'bg-green-100', text: 'text-green-700' },
    communication: { gradient: 'from-orange-500 to-yellow-500', bg: 'bg-orange-100', text: 'text-orange-700' },
    cultural_literacy: { gradient: 'from-red-500 to-rose-500', bg: 'bg-red-100', text: 'text-red-700' }
  };

  const difficultyColors = {
    beginner: { bg: 'bg-green-100', text: 'text-green-700', label: 'Beginner' },
    intermediate: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Intermediate' },
    advanced: { bg: 'bg-red-100', text: 'text-red-700', label: 'Advanced' }
  };

  const handleEnroll = async (e) => {
    e.stopPropagation();
    if (!user) {
      navigate('/login');
      return;
    }
    
    setIsEnrolling(true);
    try {
      await onEnroll(quest.id);
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
      <div className={`h-2 bg-gradient-to-r ${pillarColors[dominantPillar].gradient}`} />
      
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-gray-600">{estimatedTime}</span>
          </div>
          
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-gray-600">{taskCount} {taskCount === 1 ? 'Task' : 'Tasks'}</span>
          </div>
        </div>

        {/* Tags Row - Simplified */}
        <div className="flex items-center gap-2 mb-5">
          {/* XP Badge - More prominent */}
          <div className={`px-3 py-1 rounded-full bg-gradient-to-r ${pillarColors[dominantPillar].gradient} text-white text-sm font-semibold`}>
            {totalXP} XP
          </div>
          
          {/* Difficulty Badge */}
          <div className={`px-3 py-1 rounded-full ${difficultyColors[difficulty].bg} ${difficultyColors[difficulty].text} text-xs font-medium`}>
            {difficultyColors[difficulty].label}
          </div>

          {/* Main Pillar Badge */}
          <div className={`px-3 py-1 rounded-full ${pillarColors[dominantPillar].bg} ${pillarColors[dominantPillar].text} text-xs font-medium capitalize`}>
            {dominantPillar.replace('_', ' ')}
          </div>
        </div>

        {/* Action Buttons - Cleaner design */}
        <div className="flex gap-2">
          {!isEnrolled ? (
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
          )}
        </div>

        {/* Enrollment Status Indicator */}
        {isEnrolled && (
          <div className="mt-3 flex items-center gap-2 text-xs text-green-600">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>In Progress</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuestCard;