import React, { useState, useEffect } from 'react';
import { DEMO_DATA } from '../../utils/demoData';

const DemoQuestBrowser = ({ questOrder = 'difficulty', onQuestClick, onStartQuest }) => {
  const [selectedPillar, setSelectedPillar] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [hoveredQuest, setHoveredQuest] = useState(null);
  const [quests, setQuests] = useState(DEMO_DATA.sampleQuests);

  useEffect(() => {
    // Sort quests based on order preference
    const sortedQuests = [...DEMO_DATA.sampleQuests].sort((a, b) => {
      if (questOrder === 'difficulty') {
        const difficultyOrder = { beginner: 1, intermediate: 2, advanced: 3 };
        return difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty];
      } else if (questOrder === 'popularity') {
        return b.xpReward - a.xpReward;
      }
      return 0;
    });
    setQuests(sortedQuests);
  }, [questOrder]);

  const filteredQuests = quests.filter(quest => {
    const matchesPillar = selectedPillar === 'all' || quest.pillar === selectedPillar;
    const matchesSearch = quest.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          quest.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          quest.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesPillar && matchesSearch;
  });

  const getPillarColor = (pillar) => {
    const colors = {
      creativity: 'border-purple-500 bg-purple-50',
      critical_thinking: 'border-blue-500 bg-blue-50',
      practical_skills: 'border-green-500 bg-green-50',
      communication: 'border-orange-500 bg-orange-50',
      cultural_literacy: 'border-red-500 bg-red-50'
    };
    return colors[pillar] || 'border-gray-500 bg-gray-50';
  };

  const getPillarBadgeColor = (pillar) => {
    const colors = {
      creativity: 'bg-purple-100 text-purple-700',
      critical_thinking: 'bg-blue-100 text-blue-700',
      practical_skills: 'bg-green-100 text-green-700',
      communication: 'bg-orange-100 text-orange-700',
      cultural_literacy: 'bg-red-100 text-red-700'
    };
    return colors[pillar] || 'bg-gray-100 text-gray-700';
  };

  const getDifficultyColor = (difficulty) => {
    const colors = {
      beginner: 'text-green-600',
      intermediate: 'text-yellow-600',
      advanced: 'text-red-600'
    };
    return colors[difficulty] || 'text-gray-600';
  };

  const handleQuestCardClick = (quest) => {
    setSelectedQuest(quest);
    setShowModal(true);
    if (onQuestClick) {
      onQuestClick(quest.id);
    }
  };

  const handleStartQuest = (questId) => {
    setShowModal(false);
    if (onStartQuest) {
      onStartQuest(questId);
    }
  };

  const pillars = [
    { id: 'all', name: 'All Skills', icon: '✨' },
    { id: 'creativity', name: 'Creativity', icon: '🎨' },
    { id: 'critical_thinking', name: 'Critical Thinking', icon: '🧠' },
    { id: 'practical_skills', name: 'Practical Skills', icon: '🔧' },
    { id: 'communication', name: 'Communication', icon: '💬' },
    { id: 'cultural_literacy', name: 'Cultural Literacy', icon: '🌍' }
  ];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Search and Filters */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          {/* Search Bar */}
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              placeholder="Search quests by title, description, or tags..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {/* Sort Indicator */}
          <div className="flex items-center px-4 py-3 bg-gray-100 rounded-lg">
            <span className="mr-2 text-gray-600">🏁</span>
            <span className="text-gray-700">
              Sorted by: <span className="font-medium capitalize">{questOrder}</span>
            </span>
          </div>
        </div>

        {/* Pillar Filter Pills */}
        <div className="flex flex-wrap gap-2">
          {pillars.map(pillar => (
            <button
              key={pillar.id}
              onClick={() => setSelectedPillar(pillar.id)}
              className={`px-4 py-2 rounded-full font-medium transition-all ${
                selectedPillar === pillar.id
                  ? 'bg-purple-600 text-white shadow-lg transform scale-105'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              <span className="mr-2">{pillar.icon}</span>
              {pillar.name}
            </button>
          ))}
        </div>
      </div>

      {/* Quest Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredQuests.map((quest) => (
          <div
            key={quest.id}
            className={`relative border-2 rounded-xl overflow-hidden hover:shadow-xl transition-all transform hover:-translate-y-1 cursor-pointer ${getPillarColor(quest.pillar)}`}
            onMouseEnter={() => setHoveredQuest(quest.id)}
            onMouseLeave={() => setHoveredQuest(null)}
            onClick={() => handleQuestCardClick(quest)}
          >
            {/* Quest Image Placeholder */}
            <div className="h-40 bg-gradient-to-br from-gray-200 to-gray-300 relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-6xl text-white/50">✨</span>
              </div>
              
              {/* Team Up Badge */}
              {quest.teamUpEligible && (
                <div className="absolute top-2 right-2 bg-purple-600 text-white px-2 py-1 rounded-full text-xs font-medium flex items-center">
                  <span className="mr-1">👥</span>
                  Team Up
                </div>
              )}
              
              {/* Source Badge */}
              {quest.source !== 'custom' && (
                <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium">
                  {quest.source.replace('_', ' ')}
                </div>
              )}
            </div>

            {/* Quest Content */}
            <div className="p-4">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg text-gray-900 flex-1">
                  {quest.title}
                </h3>
                <div className="text-2xl font-bold text-purple-600 ml-2">
                  {quest.xpReward}
                  <span className="text-xs text-gray-600 block">XP</span>
                </div>
              </div>

              <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                {quest.description}
              </p>

              {/* Quest Metadata */}
              <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                <div className="flex items-center">
                  <span className="mr-1">🕒</span>
                  {quest.estimatedHours}h
                </div>
                <div className="flex items-center">
                  <span className="mr-1">✅</span>
                  {quest.tasks} tasks
                </div>
                <div className={`font-medium ${getDifficultyColor(quest.difficulty)}`}>
                  {quest.difficulty}
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1 mb-3">
                {quest.tags.slice(0, 3).map(tag => (
                  <span 
                    key={tag}
                    className="px-2 py-1 bg-white/70 rounded text-xs text-gray-700"
                  >
                    #{tag}
                  </span>
                ))}
              </div>

              {/* Completion Rate Bar */}
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>Completion Rate</span>
                  <span>{quest.completionRate}%</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-500"
                    style={{ width: hoveredQuest === quest.id ? `${quest.completionRate}%` : '0%' }}
                  />
                </div>
              </div>

              {/* Pillar Badge */}
              <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getPillarBadgeColor(quest.pillar)}`}>
                {DEMO_DATA.pillarDescriptions[quest.pillar].icon}
                <span className="ml-1">
                  {DEMO_DATA.pillarDescriptions[quest.pillar].name}
                </span>
              </div>
            </div>

            {/* Hover Overlay */}
            {hoveredQuest === quest.id && (
              <div className="absolute inset-0 bg-purple-600/10 backdrop-blur-sm flex items-center justify-center">
                <button className="bg-purple-600 text-white px-6 py-3 rounded-lg font-bold flex items-center transform hover:scale-105 transition-transform">
                  View Quest
                  <span className="ml-2">→</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Quest Detail Modal */}
      {showModal && selectedQuest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold text-gray-900">
                  {selectedQuest.title}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="mb-6">
                <p className="text-gray-600 mb-4">{selectedQuest.description}</p>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-sm text-gray-600">XP Reward</div>
                    <div className="text-2xl font-bold text-purple-600">{selectedQuest.xpReward}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-sm text-gray-600">Time Required</div>
                    <div className="text-2xl font-bold text-gray-900">{selectedQuest.estimatedHours}h</div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="font-semibold text-gray-900 mb-3">What You'll Do:</h3>
                <ul className="space-y-2 mb-6">
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2 flex-shrink-0 mt-0.5">✅</span>
                    <span className="text-gray-700">Complete {selectedQuest.tasks} engaging tasks</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2 flex-shrink-0 mt-0.5">✅</span>
                    <span className="text-gray-700">Upload evidence of your learning</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2 flex-shrink-0 mt-0.5">✅</span>
                    <span className="text-gray-700">Build your portfolio with real achievements</span>
                  </li>
                  {selectedQuest.teamUpEligible && (
                    <li className="flex items-start">
                      <span className="text-green-500 mr-2 flex-shrink-0 mt-0.5">✅</span>
                      <span className="text-gray-700">Option to team up with friends</span>
                    </li>
                  )}
                </ul>

                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
                  <p className="text-purple-900 text-sm">
                    <span className="font-semibold">Demo Note:</span> This is a preview of how quests work. 
                    Sign up to start completing real quests and building your portfolio!
                  </p>
                </div>

                <button
                  onClick={() => handleStartQuest(selectedQuest.id)}
                  className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 transition-colors"
                >
                  Start Your Journey →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results Count */}
      {searchTerm || selectedPillar !== 'all' ? (
        <div className="mt-6 text-center text-gray-600">
          Showing {filteredQuests.length} of {quests.length} quests
        </div>
      ) : null}
    </div>
  );
};

export default DemoQuestBrowser;