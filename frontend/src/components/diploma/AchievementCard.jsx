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
    
    return pillars[0] ? pillarGradients[pillars[0]] : 'bg-gradient-primary';
  };

  const getPillarName = (pillar) => {
    const pillarNames = {
      creativity: 'Arts & Creativity',
      critical_thinking: 'STEM & Logic',
      practical_skills: 'Life & Wellness',
      communication: 'Language & Communication',
      cultural_literacy: 'Society & Culture'
    };
    return pillarNames[pillar] || pillar?.replace('_', ' ');
  };

  const getDominantPillar = (achievement) => {
    const pillars = Object.values(achievement.task_evidence || {})
      .map(e => e.pillar)
      .filter(Boolean);
    return pillars[0];
  };

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden transition-all cursor-pointer sm:hover:transform sm:hover:-translate-y-2 sm:hover:shadow-2xl group border border-gray-100 min-h-[44px]"
      style={{ boxShadow: '0 8px 25px rgba(109, 70, 155, 0.08)' }}
      onClick={() => onClick(achievement)}
    >
      {/* Enhanced Quest Header */}
      <div className={`relative h-40 bg-gradient-to-br ${getPillarGradient(achievement)} flex items-center justify-center overflow-hidden`}>
        {achievement.quest.header_image_url ? (
          <>
            <img
              src={achievement.quest.header_image_url}
              alt={`Quest: ${achievement.quest.title}`}
              className="absolute inset-0 w-full h-full object-cover sm:group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent" />
          </>
        ) : (
          <div className="text-white relative z-10">
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mb-3">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <p className="text-xs font-semibold tracking-wider opacity-90">
              {getPillarName(getDominantPillar(achievement)) || 'Learning Quest'}
            </p>
          </div>
        )}
        
        {/* Achievement Badge */}
        <div className="absolute top-3 right-3 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span className="text-xs font-bold text-white">
              {achievement.total_xp_earned}
            </span>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="mb-3">
          <h3 className="font-bold text-xl mb-2 text-gray-800 sm:group-hover:text-optio-purple transition-colors leading-tight">
            {achievement.quest.title}
          </h3>
          
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">
            {achievement.quest.big_idea || achievement.quest.description}
          </p>
        </div>
        
        {/* Growth Indicators */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-gradient-primary"></div>
            <span className="text-sm font-medium text-gray-700">
              {Object.keys(achievement.task_evidence || {}).length} Skills Developed
            </span>
          </div>
        </div>

        {/* Journey Timeline */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs text-gray-600 font-medium">
              Completed {formatDate(achievement.completed_at)}
            </span>
          </div>
          <div className="flex items-center gap-1 text-optio-purple font-semibold text-sm sm:group-hover:gap-2 transition-all">
            <span>Explore Journey</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AchievementCard;