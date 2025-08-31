import React from 'react';

const AchievementCard = ({ achievement, onClick }) => {
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getPillarGradient = (achievement) => {
    // Try to get the dominant pillar from task evidence
    const pillars = Object.values(achievement.task_evidence || {})
      .map(e => e.pillar)
      .filter(Boolean);
    
    const pillarGradients = {
      creativity: 'from-[#ef597b] to-[#ff8fa3]',
      critical_thinking: 'from-[#6d469b] to-[#8b5cf6]',
      practical_skills: 'from-[#ef597b] to-[#f97316]',
      communication: 'from-[#6d469b] to-[#3b82f6]',
      cultural_literacy: 'from-[#ef597b] to-[#ec4899]'
    };
    
    return pillars[0] ? pillarGradients[pillars[0]] : 'from-[#ef597b] to-[#6d469b]';
  };

  return (
    <div 
      className="bg-white rounded-xl overflow-hidden transition-all cursor-pointer hover:transform hover:-translate-y-1 hover:shadow-xl group"
      style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.07)' }}
      onClick={() => onClick(achievement)}
    >
      {/* Quest Header Image or Gradient */}
      {achievement.quest.header_image_url ? (
        <div className="relative h-32 overflow-hidden">
          <img 
            src={achievement.quest.header_image_url}
            alt={achievement.quest.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        </div>
      ) : (
        <div className={`h-32 flex items-center justify-center bg-gradient-to-br ${getPillarGradient(achievement)}`}>
          <div className="text-white">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
        </div>
      )}

      <div className="p-5">
        <h3 className="font-bold text-lg mb-2 text-gray-800 group-hover:text-[#6d469b] transition-colors">
          {achievement.quest.title}
        </h3>
        
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
          {achievement.quest.big_idea || achievement.quest.description}
        </p>
        
        {/* Achievement Stats */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4 text-[#6d469b]" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-sm font-bold text-[#6d469b]">
                {achievement.total_xp_earned} XP
              </span>
            </div>
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span className="text-sm text-gray-600">
                {Object.keys(achievement.task_evidence || {}).length} tasks
              </span>
            </div>
          </div>
        </div>

        {/* Completion Date */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Completed {formatDate(achievement.completed_at)}
          </span>
          <span className="text-xs font-semibold text-[#6d469b] group-hover:underline">
            View Details →
          </span>
        </div>
      </div>
    </div>
  );
};

export default AchievementCard;