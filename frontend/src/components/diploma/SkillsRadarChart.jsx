import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

const SkillsRadarChart = ({ skillsXP }) => {
  // Reordered for better visual balance - alternating between high and low values
  const competencyOrder = [
    'arts_creativity',
    'life_wellness', 
    'stem_logic',
    'society_culture',
    'language_communication'
  ];
  
  const competencyInfo = {
    arts_creativity: {
      label: 'Arts & Creativity',
      color: '#ef597b',
      icon: '🎨',
      description: 'Creative problem-solving and innovation'
    },
    stem_logic: {
      label: 'STEM & Logic',
      color: '#6d469b',
      icon: '🧠',
      description: 'Analytical reasoning and evaluation'
    },
    life_wellness: {
      label: 'Life & Wellness',
      color: '#f97316',
      icon: '🛠️',
      description: 'Applied knowledge and technical skills'
    },
    language_communication: {
      label: 'Language & Communication',
      color: '#3b82f6',
      icon: '💬',
      description: 'Effective communication and teamwork'
    },
    society_culture: {
      label: 'Society & Culture',
      color: '#ec4899',
      icon: '🌍',
      description: 'Cultural awareness and global perspective'
    }
  };

  const totalXP = Object.values(skillsXP || {}).reduce((sum, xp) => sum + xp, 0);
  // Scale to highest XP + 250 buffer for better visualization
  const highestXP = Math.max(...Object.values(skillsXP || {}), 0);
  const maxXP = highestXP > 0 ? highestXP + 250 : 1000;

  // Prepare data for radar chart using the reordered sequence
  const radarData = competencyOrder.map(key => ({
    competency: competencyInfo[key].label,
    value: skillsXP[key] || 0,
    fullMark: maxXP
  }));

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload[0]) {
      const competencyKey = Object.keys(competencyInfo).find(
        key => competencyInfo[key].label === payload[0].payload.competency
      );
      const info = competencyInfo[competencyKey];
      
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-purple-100">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{info.icon}</span>
            <span className="font-semibold text-gray-800">{info.label}</span>
          </div>
          <p className="text-xs text-gray-600 mb-2">{info.description}</p>
          <p className="text-lg font-bold" style={{ color: info.color }}>
            {payload[0].value.toLocaleString()} XP
          </p>
        </div>
      );
    }
    return null;
  };

  if (!skillsXP || Object.keys(skillsXP).length === 0) {
    return (
      <div className="bg-white rounded-xl p-8 mb-8" style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.07)' }}>
        <h2 className="text-2xl font-bold mb-4" style={{ color: '#003f5c' }}>Skill Mastery Profile</h2>
        <div className="text-center py-12">
          <div className="w-64 h-64 mx-auto rounded-full bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center">
            <p className="text-gray-600">Complete quests to develop your skill profile</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-8 mb-8" style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.07)' }}>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: '#003f5c' }}>Skill Mastery Profile</h2>
          <p className="text-sm text-gray-600 mt-1">Your validated competencies visualized</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-600">Total XP</p>
          <p className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            {totalXP.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Radar Chart */}
        <div className="flex items-center justify-center">
          <ResponsiveContainer width="100%" height={400}>
            <RadarChart data={radarData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
              <PolarGrid 
                stroke="#e5e7eb"
                strokeDasharray="3 3"
                radialLines={true}
              />
              <PolarAngleAxis 
                dataKey="competency" 
                tick={{ fill: '#374151', fontSize: 14, fontWeight: 600, dy: 5 }}
                className="font-semibold"
              />
              <PolarRadiusAxis 
                angle={90}
                domain={[0, maxXP]}
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickFormatter={(value) => value >= 1000 ? `${value/1000}k` : value}
                tickCount={6}
              />
              <Radar 
                name="XP" 
                dataKey="value" 
                stroke="#6d469b"
                strokeWidth={2}
                fill="url(#colorGradient)"
                fillOpacity={0.6}
              />
              <Tooltip content={<CustomTooltip />} />
              <defs>
                <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef597b" stopOpacity={0.8}/>
                  <stop offset="100%" stopColor="#6d469b" stopOpacity={0.8}/>
                </linearGradient>
              </defs>
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Competency Details */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-4">
            Competency Breakdown
          </h3>
          {competencyOrder.map(key => {
            const info = competencyInfo[key];
            const xp = skillsXP[key] || 0;
            const percentage = maxXP > 0 ? (xp / maxXP) * 100 : 0;
            
            return (
              <div 
                key={key}
                className="group p-4 rounded-lg border border-gray-200 hover:border-purple-200 hover:shadow-md transition-all duration-300"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{info.icon}</span>
                    <div>
                      <h4 className="font-semibold text-gray-900">{info.label}</h4>
                      <p className="text-xs text-gray-600">{info.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-bold" style={{ color: info.color }}>
                      {xp.toLocaleString()}
                    </span>
                    <span className="text-sm text-gray-600 ml-1">XP</span>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{ 
                      width: `${percentage}%`,
                      background: `linear-gradient(90deg, ${info.color}CC, ${info.color})`
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};

export default SkillsRadarChart;