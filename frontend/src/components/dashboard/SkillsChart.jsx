import React, { useState } from 'react';
import { 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  Radar, 
  ResponsiveContainer,
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  Cell
} from 'recharts';

const SkillsChart = ({ skillData }) => {
  const [chartType, setChartType] = useState('radar');
  
  // Define colors for each skill
  const skillColors = {
    'Creativity': '#EF597B',
    'Critical Thinking': '#6D469B',
    'Practical Skills': '#22c55e',
    'Communication': '#f97316',
    'Cultural Literacy': '#ec4899'
  };

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload[0]) {
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="font-semibold text-gray-900">{label}</p>
          <p className="text-sm text-gray-600">
            XP: <span className="font-bold text-optio-purple">{payload[0].value}</span>
          </p>
          <div className="mt-1 text-xs text-gray-500">
            {payload[0].value > 100 ? '🌟 Well developed!' : 'Keep practicing!'}
          </div>
        </div>
      );
    }
    return null;
  };

  // Calculate max value for better scaling
  const maxValue = Math.max(...skillData.map(d => d.xp), 100);
  const chartMax = Math.ceil(maxValue / 50) * 50;

  if (!skillData || skillData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-gray-50 rounded-xl">
        <svg className="w-24 h-24 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
        </svg>
        <p className="text-gray-600 font-semibold">No skill data yet</p>
        <p className="text-sm text-gray-500 mt-1">Complete quests to see your progress!</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
      {/* Header with chart type toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">Skill Development</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setChartType('radar')}
            className={`min-h-[44px] px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              chartType === 'radar'
                ? 'bg-purple-100 text-purple-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Radar
          </button>
          <button
            onClick={() => setChartType('bar')}
            className={`min-h-[44px] px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              chartType === 'bar'
                ? 'bg-purple-100 text-purple-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Bars
          </button>
        </div>
      </div>

      {/* Chart */}
      {chartType === 'radar' ? (
        <ResponsiveContainer width="100%" height={350}>
          <RadarChart data={skillData}>
            <PolarGrid 
              stroke="#e5e7eb"
              strokeWidth={1}
              radialLines={false}
            />
            <PolarAngleAxis 
              dataKey="category" 
              tick={{ fontSize: 12, fill: '#6b7280' }}
              className="font-medium"
            />
            <PolarRadiusAxis 
              angle={90} 
              domain={[0, chartMax]}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickCount={5}
            />
            <Radar 
              name="XP" 
              dataKey="xp" 
              stroke="#6d469b" 
              fill="#6d469b" 
              fillOpacity={0.6}
              strokeWidth={2}
            />
            <Tooltip content={<CustomTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={350}>
          <BarChart 
            data={skillData} 
            margin={{ top: 20, right: 30, bottom: 60, left: 40 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="category" 
              tick={{ fontSize: 11, fill: '#6b7280' }}
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis 
              tick={{ fontSize: 12, fill: '#6b7280' }}
              domain={[0, chartMax]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="xp" radius={[8, 8, 0, 0]}>
              {skillData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={skillColors[entry.category] || '#6D469B'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Skill Summary */}
      <div className="mt-4 sm:mt-6 grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
        {skillData.map((skill, index) => (
          <div
            key={index}
            className="text-center p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div
              className="w-8 sm:w-10 h-8 sm:h-10 rounded-full mx-auto mb-1 flex items-center justify-center text-white text-xs sm:text-sm font-bold"
              style={{ backgroundColor: skillColors[skill.category] || '#6D469B' }}
            >
              {skill.xp > 0 ? skill.xp : '-'}
            </div>
            <p className="text-xs text-gray-600 font-medium truncate">
              {skill.category.split(' ')[0]}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SkillsChart;