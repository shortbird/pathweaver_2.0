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
        <h2 className="text-2xl font-bold mb-4" style={{ color: '#003f5c' }}>Growth Dimensions</h2>
        <div className="text-center py-12">
          <div className="w-64 h-64 mx-auto rounded-full bg-gradient-to-br from-[#ef597b]/10 to-[#6d469b]/10 flex items-center justify-center">
            <p className="text-gray-600">Complete quests to develop your growth dimensions</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-8 mb-8" style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.07)' }}>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: '#003f5c' }}>Growth Dimensions</h2>
          <p className="text-sm text-gray-600 mt-1">Your learning validated across five key areas</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-600">Total Growth Points</p>
          <p className="text-2xl font-bold bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent">
            {totalXP.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Full-width Radar Chart */}
      <div className="flex items-center justify-center mb-8">
        <ResponsiveContainer width="100%" height={500}>
          <RadarChart data={radarData} margin={{ top: 60, right: 80, bottom: 60, left: 80 }}>
            <PolarGrid 
              stroke="#e5e7eb"
              strokeDasharray="3 3"
              radialLines={true}
            />
            <PolarAngleAxis 
              dataKey="competency" 
              tick={{ 
                fill: '#374151', 
                fontSize: 13, 
                fontWeight: 600,
                textAnchor: 'middle'
              }}
              className="font-semibold"
            />
            <PolarRadiusAxis 
              angle={90}
              domain={[0, maxXP]}
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              tickFormatter={(value) => value >= 1000 ? `${value/1000}k` : value}
              tickCount={5}
            />
            <Radar 
              name="Growth Points" 
              dataKey="value" 
              stroke="#6d469b"
              strokeWidth={3}
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

      {/* Summary Stats Below Chart */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {competencyOrder.map(key => {
          const info = competencyInfo[key];
          const xp = skillsXP[key] || 0;
          
          return (
            <div 
              key={key}
              className="text-center p-4 rounded-lg" 
              style={{ background: 'linear-gradient(135deg, rgba(239,89,123,0.03) 0%, rgba(109,70,155,0.03) 100%)', border: '1px solid rgba(109,70,155,0.08)' }}
            >
              <div className="text-2xl mb-2">{info.icon}</div>
              <h4 className="font-semibold text-gray-900 text-sm mb-1">{info.label}</h4>
              <div className="text-lg font-bold" style={{ color: info.color }}>
                {xp.toLocaleString()}
              </div>
              <div className="text-xs text-gray-600">Growth Points</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SkillsRadarChart;