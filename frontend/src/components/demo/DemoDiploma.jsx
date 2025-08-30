import React, { useState, useEffect, useRef } from 'react';
import { DEMO_DATA } from '../../utils/demoData';

const DemoDiploma = ({ demoState, onEvidenceClick, standalone = false }) => {
  const [expandedQuest, setExpandedQuest] = useState(null);
  const [animatedPillars, setAnimatedPillars] = useState({});
  const [showShareModal, setShowShareModal] = useState(false);
  const skillBarsRef = useRef(null);
  
  const userData = demoState?.demoUser || DEMO_DATA.user;
  const completedQuests = demoState?.completedQuests || [];
  const pillars = userData.pillars;

  useEffect(() => {
    // Animate skill bars when they come into view
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            // Trigger animation for all pillars
            Object.keys(pillars).forEach((pillar, index) => {
              setTimeout(() => {
                setAnimatedPillars(prev => ({
                  ...prev,
                  [pillar]: true
                }));
              }, index * 100);
            });
          }
        });
      },
      { threshold: 0.3 }
    );

    if (skillBarsRef.current) {
      observer.observe(skillBarsRef.current);
    }

    return () => observer.disconnect();
  }, [pillars]);

  const getPillarColor = (pillar) => {
    const colors = {
      creativity: 'bg-purple-500',
      critical_thinking: 'bg-blue-500',
      practical_skills: 'bg-green-500',
      communication: 'bg-orange-500',
      cultural_literacy: 'bg-red-500'
    };
    return colors[pillar] || 'bg-gray-500';
  };

  const getPillarIcon = (pillar) => {
    const icons = {
      creativity: '🎨',
      critical_thinking: '🧠',
      practical_skills: '🔧',
      communication: '💬',
      cultural_literacy: '🌍'
    };
    return icons[pillar] || '⭐';
  };

  const formatPillarName = (pillar) => {
    return pillar.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const getEvidenceIcon = (type) => {
    switch(type) {
      case 'text': return <span className="text-lg">📝</span>;
      case 'image': return <span className="text-lg">🖼️</span>;
      case 'video': return <span className="text-lg">▶️</span>;
      case 'link': return <span className="text-lg">🔗</span>;
      case 'document': return <span className="text-lg">📄</span>;
      default: return <span className="text-lg">📝</span>;
    }
  };

  const handleQuestClick = (questId) => {
    setExpandedQuest(expandedQuest === questId ? null : questId);
    if (onEvidenceClick) {
      onEvidenceClick(questId);
    }
  };

  const handleShare = () => {
    setShowShareModal(true);
    setTimeout(() => setShowShareModal(false), 3000);
  };

  const maxXP = Math.max(...Object.values(pillars));

  return (
    <div className={`${standalone ? 'min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 py-12' : ''}`}>
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-8 text-white">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
            <div className="mb-4 md:mb-0">
              <div className="flex items-center mb-2">
                <span className="text-3xl mr-3">🎓</span>
                <h1 className="text-3xl font-bold">Learning Portfolio</h1>
              </div>
              <h2 className="text-2xl">{userData.name}</h2>
              <p className="text-purple-200 mt-1">
                {userData.grade} • {userData.location} • Member since {userData.joinDate}
              </p>
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={handleShare}
                className="px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-all flex items-center"
              >
                <span className="mr-2">📤</span>
                Share
              </button>
              
              {showShareModal && (
                <div className="absolute top-20 right-8 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg animate-bounce">
                  <span className="inline mr-2">✅</span>
                  Link copied to clipboard!
                </div>
              )}
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-purple-400/30">
            <div>
              <div className="text-3xl font-bold">{userData.totalXP}</div>
              <div className="text-purple-200 text-sm">Total XP</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{userData.questsCompleted}</div>
              <div className="text-purple-200 text-sm">Quests</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{userData.currentStreak}</div>
              <div className="text-purple-200 text-sm">Day Streak</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{userData.hoursLearning}</div>
              <div className="text-purple-200 text-sm">Hours</div>
            </div>
          </div>
        </div>

        {/* Skills Section */}
        <div className="p-8 bg-gradient-to-b from-gray-50 to-white" ref={skillBarsRef}>
          <h3 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
            <span className="text-xl mr-2">📊</span>
            Skill Development
          </h3>
          
          <div className="space-y-4">
            {Object.entries(pillars).map(([pillar, xp]) => (
              <div key={pillar} className="group">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center">
                    <span className="text-2xl mr-2">{getPillarIcon(pillar)}</span>
                    <span className="font-medium text-gray-700">
                      {formatPillarName(pillar)}
                    </span>
                  </div>
                  <span className="font-bold text-gray-900">{xp} XP</span>
                </div>
                
                <div className="relative h-8 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`absolute inset-y-0 left-0 ${getPillarColor(pillar)} transition-all duration-1000 ease-out flex items-center justify-end pr-3`}
                    style={{
                      width: animatedPillars[pillar] ? `${(xp / maxXP) * 100}%` : '0%'
                    }}
                  >
                    <span className="text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      {Math.round((xp / userData.totalXP) * 100)}% of total
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Skill Radar Chart Placeholder */}
          <div className="mt-8 p-6 bg-white rounded-lg border-2 border-dashed border-gray-300">
            <div className="text-center text-gray-500">
              <ChartBarIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">Interactive skill radar chart</p>
              <p className="text-xs text-gray-400 mt-1">Hover to see skill breakdown</p>
            </div>
          </div>
        </div>

        {/* Completed Quests */}
        <div className="p-8">
          <h3 className="text-2xl font-bold text-gray-800 mb-6">
            Completed Quests
          </h3>
          
          <div className="space-y-4">
            {completedQuests.map((quest) => (
              <div 
                key={quest.id}
                className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-all"
              >
                <button
                  onClick={() => handleQuestClick(quest.id)}
                  className="w-full p-4 bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center">
                      <span className="text-2xl mr-3">{getPillarIcon(quest.pillar)}</span>
                      <div className="text-left">
                        <h4 className="font-semibold text-gray-900">{quest.title}</h4>
                        <p className="text-sm text-gray-600">
                          Completed {new Date(quest.completedAt).toLocaleDateString()} • {quest.xpEarned} XP
                        </p>
                      </div>
                    </div>
                    {expandedQuest === quest.id ? 
                      <span className="text-gray-500">⌃</span> : 
                      <span className="text-gray-500">⌄</span>
                    }
                  </div>
                </button>
                
                {expandedQuest === quest.id && (
                  <div className="border-t border-gray-200 p-4 bg-gray-50">
                    <h5 className="font-semibold text-gray-800 mb-3">Evidence & Tasks</h5>
                    <div className="space-y-3">
                      {quest.tasks.map((task, index) => (
                        <div key={index} className="bg-white p-3 rounded-lg">
                          <div className="flex items-start">
                            <div className="flex-shrink-0 mr-3 mt-1">
                              {getEvidenceIcon(task.evidence.type)}
                            </div>
                            <div className="flex-1">
                              <h6 className="font-medium text-gray-800 mb-1">
                                {task.title}
                              </h6>
                              <div className="text-sm text-gray-600">
                                {task.evidence.type === 'text' && (
                                  <p className="italic">{task.evidence.content}</p>
                                )}
                                {task.evidence.type === 'image' && (
                                  <div>
                                    <div className="bg-gray-200 rounded-lg h-32 w-48 flex items-center justify-center">
                                      <span className="text-3xl text-gray-400">🖼️</span>
                                    </div>
                                    <p className="mt-1">{task.evidence.caption}</p>
                                  </div>
                                )}
                                {task.evidence.type === 'video' && (
                                  <div>
                                    <div className="bg-gray-900 rounded-lg h-32 w-48 flex items-center justify-center">
                                      <span className="text-4xl text-white">▶️</span>
                                    </div>
                                    <p className="mt-1">{task.evidence.caption}</p>
                                  </div>
                                )}
                                {task.evidence.type === 'link' && (
                                  <a 
                                    href="#" 
                                    className="text-blue-600 hover:underline flex items-center"
                                    onClick={(e) => e.preventDefault()}
                                  >
                                    <span className="mr-1">🔗</span>
                                    {task.evidence.caption}
                                  </a>
                                )}
                                {task.evidence.type === 'document' && (
                                  <div className="flex items-center text-blue-600">
                                    <span className="mr-1">📄</span>
                                    {task.evidence.caption}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* View More */}
          {completedQuests.length > 5 && (
            <div className="text-center mt-6">
              <button className="text-purple-600 hover:text-purple-700 font-medium">
                View all {userData.questsCompleted} completed quests →
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-8 py-6 border-t border-gray-200">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-600 text-sm mb-2 md:mb-0">
              This diploma is publicly viewable and shows verified learning achievements
            </p>
            <div className="flex items-center text-sm text-gray-500">
              <span className="mr-1 text-green-500">✅</span>
              Verified by Optio Quest Platform
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip/Helper Text */}
      {!standalone && (
        <div className="mt-6 text-center">
          <p className="text-gray-600 text-sm">
            💡 <span className="font-medium">Tip:</span> Click on any quest to see the evidence submitted
          </p>
        </div>
      )}
    </div>
  );
};

export default DemoDiploma;