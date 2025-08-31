import React from 'react';

const DiplomaStats = ({ totalXP, questsCompleted, skillsCount, achievements }) => {
  const stats = [
    {
      value: totalXP || 0,
      label: 'Experience Points',
      sublabel: 'Validated competency achievements',
      color: '#ef597b',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    },
    {
      value: questsCompleted || achievements?.length || 0,
      label: 'Learning Modules',
      sublabel: 'Completed with evidence',
      color: '#6d469b',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      )
    },
    {
      value: skillsCount || 5,
      label: 'Core Competencies',
      sublabel: 'Academic pillars mastered',
      color: '#ef597b',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      )
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {stats.map((stat, index) => (
        <div 
          key={index}
          className="bg-white rounded-xl p-6 hover:shadow-lg transition-all duration-300 group"
          style={{ 
            boxShadow: '0 4px 6px rgba(0,0,0,0.07)', 
            borderLeft: `4px solid ${stat.color}` 
          }}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 group-hover:scale-110 transition-transform">
              <div style={{ color: stat.color }}>
                {stat.icon}
              </div>
            </div>
            <div className="text-right">
              <h3 className="text-4xl font-bold" style={{ color: index % 2 === 0 ? '#6d469b' : '#ef597b' }}>
                {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
              </h3>
            </div>
          </div>
          <p className="font-semibold text-gray-800">
            {stat.label}
          </p>
          <p className="text-sm mt-1 text-gray-600">
            {stat.sublabel}
          </p>
        </div>
      ))}
    </div>
  );
};

export default DiplomaStats;