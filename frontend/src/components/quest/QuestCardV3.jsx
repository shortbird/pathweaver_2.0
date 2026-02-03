import React, { useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const QuestCardV3 = memo(({ quest, onEnroll }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isEnrolling, setIsEnrolling] = useState(false);

  // Calculate total XP and pillar breakdown
  const totalXP = quest.total_xp || 0;
  const taskCount = quest.task_count || 0;
  const pillarBreakdown = quest.pillar_breakdown || {};

  // Get dominant pillar for color scheme
  const dominantPillar = Object.entries(pillarBreakdown).reduce((max, [pillar, xp]) => 
    xp > (max.xp || 0) ? { pillar, xp } : max, {}).pillar || 'creativity';

  // Pillar colors
  const pillarColors = {
    creativity: 'from-purple-500 to-pink-500',
    critical_thinking: 'from-blue-500 to-cyan-500',
    practical_skills: 'from-green-500 to-emerald-500',
    communication: 'from-orange-500 to-yellow-500',
    cultural_literacy: 'from-red-500 to-rose-500'
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
    } catch (error) {
      console.error('Failed to enroll:', error);
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleCardClick = () => {
    navigate(`/quests/${quest.id}`);
  };

  return (
    <div 
      className="bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-md hover:-translate-y-1 relative before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-1 before:bg-gradient-primary"
      onClick={handleCardClick}
    >
      {/* Header Image Section */}
      <div className="relative h-48 overflow-hidden">
        {quest.header_image_url ? (
          <img 
            src={quest.header_image_url} 
            alt={quest.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div 
          className={`absolute inset-0 bg-gradient-to-br ${pillarColors[dominantPillar]} ${quest.header_image_url ? 'hidden' : 'flex'} items-center justify-center`}
          style={{ display: quest.header_image_url ? 'none' : 'flex' }}
        >
          <div className="text-white text-center px-4">
            <div className="text-4xl mb-2">
              {dominantPillar === 'creativity' && '🎨'}
              {dominantPillar === 'critical_thinking' && '🧠'}
              {dominantPillar === 'practical_skills' && '🔧'}
              {dominantPillar === 'communication' && '💬'}
              {dominantPillar === 'cultural_literacy' && '🌍'}
            </div>
            <div className="text-sm font-medium opacity-90">Quest</div>
          </div>
        </div>
        
        {/* XP Badge */}
        <div className="absolute top-2 right-2 bg-gradient-primary text-white px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider shadow-lg">
          {totalXP} XP
        </div>
      </div>

      {/* Content Section */}
      <div className="p-4">
        <h3 className="text-lg font-bold text-text-primary mb-2 line-clamp-2">
          {quest.title}
        </h3>
        
        <p className="text-text-secondary text-sm mb-4 line-clamp-2">
          {quest.big_idea}
        </p>

        {/* Quest Stats */}
        <div className="flex items-center justify-between text-sm text-text-muted mb-4">
          <div className="flex items-center">
            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 1 1 0 000 2H6a2 2 0 100 4h2a2 2 0 100-4h-.5a1 1 0 000-2H8a2 2 0 012-2z" clipRule="evenodd" />
            </svg>
            <span>{taskCount} {taskCount === 1 ? 'Task' : 'Tasks'}</span>
          </div>
          
          {quest.user_enrollment && (
            <div className="flex items-center text-green-600">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Enrolled</span>
            </div>
          )}
        </div>

        {/* Pillar Breakdown */}
        <div className="mb-4">
          <div className="flex flex-wrap gap-1">
            {Object.entries(pillarBreakdown).map(([pillar, xp]) => (
              <span 
                key={pillar}
                className={`text-xs px-3 py-1 rounded-full bg-purple-100 text-primary font-semibold uppercase tracking-wider`}
              >
                {pillar.replace('_', ' ')}: {xp} XP
              </span>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {!quest.user_enrollment ? (
            <>
              <button
                onClick={handleEnroll}
                disabled={isEnrolling}
                className="w-full bg-gradient-primary text-white py-2 px-4 rounded-[20px] hover:shadow-[0_4px_15px_rgba(239,89,123,0.2)] hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold"
              >
                {isEnrolling ? 'Enrolling...' : 'Start Quest'}
              </button>
            </>
          ) : (
            (() => {
              // Calculate completion status
              const completedTasks = quest.quest_tasks?.filter(task => task.is_completed).length || 0;
              const totalTasks = quest.quest_tasks?.length || 1;
              const isCompleted = completedTasks === totalTasks && totalTasks > 0;
              
              if (isCompleted) {
                return (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate('/diploma');
                    }}
                    className="flex-1 bg-gradient-to-r from-emerald-500 to-green-500 text-white py-2 px-4 rounded-[20px] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 text-sm font-semibold"
                  >
                    ✓ Completed - View Diploma
                  </button>
                );
              } else {
                return (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/quests/${quest.id}`);
                    }}
                    className="flex-1 bg-emerald-500 text-white py-2 px-4 rounded-[20px] hover:bg-emerald-600 hover:-translate-y-0.5 transition-all duration-300 text-sm font-semibold"
                  >
                    Continue Quest →
                  </button>
                );
              }
            })()
          )}
        </div>
      </div>
    </div>
  );
});

export default QuestCardV3;