import React from 'react';

const DiplomaStats = ({ totalXP, questsCompleted, skillsCount, achievements }) => {
  const stats = [
    {
      value: totalXP || 0,
      label: 'Growth Points',
      sublabel: 'Moments of learning celebrated',
      color: '#ef597b',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      )
    },
    {
      value: questsCompleted || achievements?.length || 0,
      label: 'Adventures Completed',
      sublabel: 'Journeys of discovery and creation',
      color: '#6d469b',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      )
    },
    {
      value: skillsCount || 5,
      label: 'Areas of Growth',
      sublabel: 'Skills nurtured through curiosity',
      color: '#ef597b',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 0l3 3m-3-3l-3 3m0 12v-1m0 0l3-3m-3 3l-3-3m9-1h-1m0 0l-3 3m3-3l3-3m-12 9h1m0 0l3-3m-3 3l-3 3" />
        </svg>
      )
    }
  ];

  return (
    <div className="mb-12">
      {/* Growth Overview Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-3" style={{ color: '#003f5c' }}>Growth Snapshot</h2>
        <p className="text-gray-600 max-w-2xl mx-auto">
          These numbers represent moments of curiosity, creativity, and personal development. Each point reflects genuine engagement with learning.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {stats.map((stat, index) => (
          <div 
            key={index}
            className="relative bg-white rounded-2xl p-8 hover:shadow-2xl transition-all duration-500 group overflow-hidden"
            style={{ 
              boxShadow: '0 8px 25px rgba(109, 70, 155, 0.08)',
              border: '1px solid rgba(109, 70, 155, 0.1)'
            }}
          >
            {/* Background Gradient */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              <div className="absolute inset-0 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5"></div>
            </div>
            
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#ef597b]/10 to-[#6d469b]/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <div style={{ color: stat.color }}>
                    {stat.icon}
                  </div>
                </div>
                <div className="text-right">
                  <h3 className="text-5xl font-bold" style={{ 
                    background: `linear-gradient(135deg, ${index % 2 === 0 ? '#ef597b' : '#6d469b'} 0%, ${index % 2 === 0 ? '#6d469b' : '#ef597b'} 100%)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}>
                    {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                  </h3>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-xl text-gray-800">
                  {stat.label}
                </h4>
                <p className="text-gray-600 leading-relaxed">
                  {stat.sublabel}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DiplomaStats;