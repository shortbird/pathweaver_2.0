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
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.5 6L12 10.5 8.5 8 12 5.5 15.5 8zM7.5 9l4.5 2.5V15l-4.5-2.5V9zm9 0v3.5L12 15v-3.5L16.5 9z" />
        </svg>
      ),
      description: 'Creative problem-solving and innovation'
    },
    stem_logic: {
      label: 'STEM & Logic',
      color: '#6d469b',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19.5 3A2.5 2.5 0 0 0 17 5.5c0 .357.078.696.214 1.005L16.5 7.5l-3.259-2.005A2.5 2.5 0 1 0 8.5 7.5c0 .357.078.696.214 1.005L8 9.5l-3.741-2.255A2.5 2.5 0 1 0 2.5 9.5c0 .982.571 1.834 1.407 2.231L5.5 12.5l-1.593.769A2.5 2.5 0 1 0 2.5 15.5c0 .982.571 1.834 1.407 2.231L5.5 18.5l3.241-1.755A2.5 2.5 0 1 0 13.5 18.5c0-.357-.078-.696-.214-1.005L14 16.5l3.259 2.005A2.5 2.5 0 1 0 21.5 16.5c0-.357-.078-.696-.214-1.005L22 14.5l-3.241-1.755A2.5 2.5 0 1 0 19.5 3z" />
        </svg>
      ),
      description: 'Analytical reasoning and evaluation'
    },
    life_wellness: {
      label: 'Life & Wellness',
      color: '#f97316',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      ),
      description: 'Applied knowledge and technical skills'
    },
    language_communication: {
      label: 'Language & Communication',
      color: '#3b82f6',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
        </svg>
      ),
      description: 'Effective communication and teamwork'
    },
    society_culture: {
      label: 'Society & Culture',
      color: '#ec4899',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4.64 6.64c.23-.5.7-.99 1.28-1.28l.55-.29.29.55c.2.38.36.78.47 1.21l.12.45-.45-.12c-.43-.11-.83-.27-1.21-.47l-.55-.29-.5.24zm7.72 5.98c.49.39.98.86 1.32 1.41l.5.8-.8-.5c-.55-.34-1.02-.83-1.41-1.32l-.19-.24.24.19zm1.74-1.34l-.38-.38 6.68-6.68c.39.39.68.89.84 1.42l-.08.08-6.68 6.68-.38-.12zm-3.02 3.02l-.24-.19c.2-.49.36-.99.41-1.51l.05-.52.52.05c.52.05 1.02.21 1.51.41l.19.24-.19-.24zm-2.34-2.34l.38.38-6.68 6.68c-.39-.39-.68-.89-.84-1.42l.08-.08 6.68-6.68.38.12z" />
        </svg>
      ),
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
              <div className="mb-2 flex justify-center" style={{ color: info.color }}>
                {info.icon}
              </div>
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