import React from 'react';
import { getPillarData, getPillarGradient } from '../../utils/pillarMappings';

const SkillsBreakdown = ({ skillsXP }) => {
  // Get pillar info for all pillars that have XP
  const getPillarInfoForDisplay = (pillarKey) => {
    const data = getPillarData(pillarKey);
    return {
      ...data,
      gradient: getPillarGradient(pillarKey)
    };
  };

  const totalXP = Object.values(skillsXP || {}).reduce((sum, xp) => sum + xp, 0);

  if (!skillsXP || Object.keys(skillsXP).length === 0) {
    return (
      <div className="bg-white rounded-xl p-8 mb-8" style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.07)' }}>
        <h2 className="text-2xl font-bold mb-4" style={{ color: text-primary }}>Core Competencies</h2>
        <p className="text-gray-600">Complete quests to develop skills across different pillars.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-8 mb-8" style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.07)' }}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold" style={{ color: text-primary }}>Core Competencies</h2>
        <div className="text-right">
          <p className="text-sm text-gray-600">Total XP</p>
          <p className="text-2xl font-bold" style={{ color: '#6D469B' }}>{totalXP.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(skillsXP).map(([pillar, xp]) => {
          const info = getPillarInfoForDisplay(pillar);
          const hasXP = xp > 0;
          
          return (
            <div 
              key={pillar}
              className="group"
            >
              <div className={`relative overflow-hidden rounded-xl border transition-all duration-300 ${
                hasXP 
                  ? 'bg-white border-gray-200 hover:shadow-lg hover:border-purple-200' 
                  : 'bg-gray-50 border-gray-100'
              }`}>
                {/* Gradient accent bar at top */}
                {hasXP && (
                  <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${info.gradient}`} />
                )}
                
                <div className="p-5 pt-6">
                  {/* Header with icon and title */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`p-2 rounded-lg ${
                      hasXP 
                        ? `bg-gradient-to-br ${info.gradient} bg-opacity-10` 
                        : 'bg-gray-100'
                    }`}>
                      <span className="text-2xl">{info.icon}</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 capitalize">
                        {pillar.replace('_', ' ')}
                      </h3>
                      <p className="text-xs text-gray-600 mt-0.5">{info.description}</p>
                    </div>
                  </div>
                  
                  {/* XP Display */}
                  <div className="mt-4">
                    {hasXP ? (
                      <div className="flex items-baseline justify-between">
                        <div>
                          <span className="text-2xl font-bold text-gray-900">{xp.toLocaleString()}</span>
                          <span className="text-sm text-gray-600 ml-1">XP</span>
                        </div>
                        <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                          Validated
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">
                        Not yet demonstrated
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Section */}
      <div className="mt-6 p-5 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-100">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-1">Portfolio Value</h3>
            <p className="text-3xl font-bold bg-gradient-to-r from-optio-purple to-optio-pink bg-clip-text text-transparent">
              {totalXP.toLocaleString()} XP
            </p>
            <p className="text-xs text-gray-600 mt-1">Across {Object.values(skillsXP).filter(xp => xp > 0).length} competencies</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(skillsXP).map(([pillar, xp]) => {
              if (xp === 0) return null;
              const info = pillarInfo[pillar];
              
              return (
                <div 
                  key={pillar}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full border border-purple-200"
                >
                  <span className="text-sm">{info.icon}</span>
                  <span className="text-xs font-medium text-gray-700 capitalize">
                    {pillar.replace('_', ' ')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkillsBreakdown;