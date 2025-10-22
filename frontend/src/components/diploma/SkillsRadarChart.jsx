import React, { memo } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

const SkillsRadarChart = ({ skillsXP }) => {
  // Reordered for better visual balance - alternating between high and low values
  const competencyOrder = [
    'art',
    'wellness',
    'stem',
    'civics',
    'communication'
  ];

  const competencyInfo = {
    art: {
      label: 'Art',
      color: '#AF56E5',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M7 14c-1.66 0-3 1.34-3 3 0 1.31.84 2.41 2 2.83V22h2v-2.17c1.16-.41 2-1.51 2-2.83 0-1.66-1.34-3-3-3zM20.71 4.63l-1.34-1.34c-.39-.39-1.02-.39-1.41 0L9 12.25 11.75 15l8.96-8.96c.39-.39.39-1.02 0-1.41z"/>
        </svg>
      ),
      description: 'Creative problem-solving and innovation'
    },
    stem: {
      label: 'STEM',
      color: '#2469D1',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9.8 2L8.4 3.4c-.3.3-.3.8 0 1.1L12 8.1l3.6-3.6c.3-.3.3-.8 0-1.1L14.2 2H9.8zM6 9v11c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V9H6zm2 2h8v7H8v-7z"/>
        </svg>
      ),
      description: 'Analytical reasoning and evaluation'
    },
    wellness: {
      label: 'Wellness',
      color: '#E65C5C',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      ),
      description: 'Applied knowledge and technical skills'
    },
    communication: {
      label: 'Communication',
      color: '#3DA24A',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
        </svg>
      ),
      description: 'Effective communication and teamwork'
    },
    civics: {
      label: 'Civics',
      color: '#FF9028',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
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

export default memo(SkillsRadarChart);