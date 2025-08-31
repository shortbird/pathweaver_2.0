import React from 'react';

const SkillsBreakdown = ({ skillsXP }) => {
  const pillarInfo = {
    creativity: {
      gradient: 'from-[#ef597b] to-[#ff8fa3]',
      icon: '🎨',
      description: 'Innovation and artistic expression'
    },
    critical_thinking: {
      gradient: 'from-[#6d469b] to-[#8b5cf6]',
      icon: '🧠',
      description: 'Analysis and problem solving'
    },
    practical_skills: {
      gradient: 'from-[#ef597b] to-[#f97316]',
      icon: '🛠️',
      description: 'Hands-on technical abilities'
    },
    communication: {
      gradient: 'from-[#6d469b] to-[#3b82f6]',
      icon: '💬',
      description: 'Expression and collaboration'
    },
    cultural_literacy: {
      gradient: 'from-[#ef597b] to-[#ec4899]',
      icon: '🌍',
      description: 'Global awareness and understanding'
    }
  };

  const totalXP = Object.values(skillsXP || {}).reduce((sum, xp) => sum + xp, 0);

  if (!skillsXP || Object.keys(skillsXP).length === 0) {
    return (
      <div className="bg-white rounded-xl p-8 mb-8" style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.07)' }}>
        <h2 className="text-2xl font-bold mb-4" style={{ color: '#003f5c' }}>Skills Development</h2>
        <p className="text-gray-600">Complete quests to develop skills across different pillars.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-8 mb-8" style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.07)' }}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold" style={{ color: '#003f5c' }}>Skills Development</h2>
        <div className="text-right">
          <p className="text-sm text-gray-600">Total XP</p>
          <p className="text-2xl font-bold" style={{ color: '#6d469b' }}>{totalXP.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(pillarInfo).map(([pillar, info]) => {
          const xp = skillsXP[pillar] || 0;
          const percentage = totalXP > 0 ? (xp / totalXP) * 100 : 0;
          
          return (
            <div 
              key={pillar}
              className="group hover:scale-105 transition-transform duration-300"
            >
              <div className="bg-gradient-to-br from-gray-50 to-white rounded-lg p-4 border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{info.icon}</span>
                    <div>
                      <h3 className="font-semibold capitalize text-gray-800">
                        {pillar.replace('_', ' ')}
                      </h3>
                      <p className="text-xs text-gray-500">{info.description}</p>
                    </div>
                  </div>
                </div>
                
                <div className="mt-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-700">{xp.toLocaleString()} XP</span>
                    <span className="text-xs text-gray-500">{percentage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className={`h-full bg-gradient-to-r ${info.gradient} transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Visual Chart Alternative */}
      <div className="mt-6 p-4 bg-gradient-to-br from-gray-50 to-white rounded-lg">
        <div className="flex justify-center items-center gap-2 flex-wrap">
          {Object.entries(skillsXP).map(([pillar, xp]) => {
            const percentage = totalXP > 0 ? (xp / totalXP) * 100 : 0;
            const info = pillarInfo[pillar];
            
            if (xp === 0) return null;
            
            return (
              <div 
                key={pillar}
                className={`px-3 py-1 rounded-full text-white text-xs font-semibold bg-gradient-to-r ${info.gradient}`}
                style={{ 
                  minWidth: `${Math.max(percentage, 15)}%`,
                  opacity: Math.max(0.7, percentage / 100)
                }}
              >
                {pillar.replace('_', ' ')} • {percentage.toFixed(0)}%
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SkillsBreakdown;