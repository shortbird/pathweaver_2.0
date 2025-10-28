import React, { useState, useEffect } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import {
  BookOpen, Code, Camera, Heart, Palette, Calculator,
  ChefHat, Briefcase, Globe, Plus, Check, Info, Search
} from 'lucide-react';
import InfoModal from './InfoModal';

const QuestSelector = () => {
  const { demoState, demoQuests, actions } = useDemo();
  const { selectedQuests } = demoState;
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [hoveredQuest, setHoveredQuest] = useState(null);

  // Pre-select family recipe quest on mount
  useEffect(() => {
    if (selectedQuests.length === 0) {
      actions.toggleQuestSelection('family-recipes');
    }
  }, []);

  const questIcons = {
    'family-recipes': <ChefHat className="w-6 h-6" />,
    'music-composition': <Palette className="w-6 h-6" />,
    'small-business': <Briefcase className="w-6 h-6" />,
    'volunteer-impact': <Heart className="w-6 h-6" />
  };

  const pillars = {
    stem: { color: 'bg-blue-500', name: 'STEM', icon: '🔬' },
    wellness: { color: 'bg-green-500', name: 'Wellness', icon: '💚' },
    communication: { color: 'bg-orange-500', name: 'Communication', icon: '💬' },
    civics: { color: 'bg-purple-500', name: 'Civics', icon: '🏛️' },
    art: { color: 'bg-pink-500', name: 'Art', icon: '🎨' }
  };

  const isQuestSelected = (questId) => {
    return selectedQuests.some(q => q.id === questId);
  };

  const additionalQuests = [
    { title: "Build a Weather App", xp: 300, pillar: "stem" },
    { title: "Create a Podcast Series", xp: 350, pillar: "communication" },
    { title: "Design a Board Game", xp: 400, pillar: "art" },
    { title: "Local History Documentary", xp: 350, pillar: "civics" },
    { title: "Learn Sign Language", xp: 300, pillar: "communication" },
    { title: "Community Garden Project", xp: 400, pillar: "wellness" },
    { title: "Write a Children's Book", xp: 350, pillar: "art" },
    { title: "Solar Power Experiment", xp: 300, pillar: "stem" },
    { title: "Cultural Exchange Blog", xp: 300, pillar: "civics" },
    { title: "3D Printing Workshop", xp: 350, pillar: "stem" },
    // Add more to reach 100+
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-text-primary">
          Choose Your Next Adventure
        </h2>
        <p className="text-gray-600">
          What are you curious about today?
        </p>
      </div>

      {/* Pillar Visualization */}
      <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-6">
        <p className="text-sm font-semibold text-gray-700 mb-3 text-center">
          Every quest helps you explore these learning pillars:
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {Object.entries(pillars).map(([key, pillar]) => (
            <div
              key={key}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-white font-medium text-sm ${pillar.color} shadow-sm`}
            >
              <span>{pillar.icon}</span>
              <span>{pillar.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Selection Status */}
      <div className="text-center">
        <p className="text-sm text-optio-purple font-semibold">
          {selectedQuests.length}/4 quests selected
        </p>
      </div>

      {/* Main Quest Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {demoQuests.map((quest) => {
          const selected = isQuestSelected(quest.id);
          const disabled = !selected && selectedQuests.length >= 4;
          
          return (
            <div
              key={quest.id}
              className={`relative group cursor-pointer transition-all duration-300 ${
                disabled ? 'opacity-50' : ''
              }`}
              onMouseEnter={() => setHoveredQuest(quest.id)}
              onMouseLeave={() => setHoveredQuest(null)}
              onClick={() => !disabled && actions.toggleQuestSelection(quest.id)}
            >
              {/* Selection Indicator */}
              {selected && (
                <div className="absolute -top-2 -right-2 z-10">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                    <Check className="w-5 h-5 text-white" />
                  </div>
                </div>
              )}
              
              <div className={`p-6 rounded-xl border-2 transition-all ${
                selected 
                  ? 'border-green-500 bg-green-50 shadow-lg transform scale-[1.02]' 
                  : hoveredQuest === quest.id
                    ? 'border-optio-purple bg-optio-purple/5 shadow-md'
                    : 'border-gray-200 bg-white'
              }`}>
                {/* Quest Header */}
                <div className="flex items-start gap-4 mb-4">
                  <div className={`p-3 rounded-lg ${
                    selected 
                      ? 'bg-gradient-primary text-white' 
                      : 'bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 text-optio-purple'
                  }`}>
                    {questIcons[quest.id]}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg text-text-primary mb-1">
                      {quest.title}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {quest.description}
                    </p>
                  </div>
                </div>

                {/* Tasks Preview */}
                <div className="space-y-2 mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Tasks:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {quest.tasks.slice(0, 4).map((task, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${pillars[task.pillar].color}`} />
                        <span className="text-xs text-gray-600 truncate">{task.title}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* You'll Explore Section */}
                <div className="mb-3 pb-3 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-2">You'll explore:</p>
                  <div className="flex flex-wrap gap-2">
                    {quest.pillars && quest.pillars.map((pillarKey) => (
                      <span
                        key={pillarKey}
                        className={`px-2 py-1 rounded-full text-xs font-medium text-white ${pillars[pillarKey]?.color}`}
                      >
                        {pillars[pillarKey]?.icon} {pillars[pillarKey]?.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-optio-purple">
                      {quest.totalXP} XP
                    </span>
                  </div>
                  <div className={`text-sm font-medium ${
                    selected ? 'text-green-600' : 'text-gray-500'
                  }`}>
                    {selected ? 'Selected' : disabled ? 'Max reached' : 'Click to select'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Browse More Button */}
      <div className="text-center pt-4">
        <button
          onClick={() => setShowLibraryModal(true)}
          className="inline-flex items-center gap-2 px-6 py-3 bg-white border-2 border-optio-purple text-optio-purple rounded-lg font-semibold hover:bg-optio-purple/10 transition-all"
        >
          <Search className="w-5 h-5" />
          Browse 100+ More Quests
        </button>
      </div>

      {/* Info Box */}
      <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-optio-purple mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              Every quest is an adventure. Pick what sparks your curiosity—there's no wrong choice.
              Start multiple quests, work at your own pace, and explore what interests you.
            </p>
            <p className="text-sm text-gray-600 italic">
              "The Process Is The Goal" - Learning happens through the journey.
            </p>
          </div>
        </div>
      </div>

      {/* Quest Library Modal */}
      <InfoModal
        isOpen={showLibraryModal}
        onClose={() => setShowLibraryModal(false)}
        title="Quest Library - 100+ Learning Paths"
        actionText="Close"
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            Explore our full library of quests across all five pillars:
          </p>
          
          {/* Pillar Filters */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(pillars).map(([key, pillar]) => (
              <span key={key} className={`px-3 py-1 rounded-full text-xs font-medium text-white ${pillar.color}`}>
                {pillar.name}
              </span>
            ))}
          </div>

          {/* Quest List */}
          <div className="max-h-96 overflow-y-auto space-y-2 border rounded-lg p-3">
            {additionalQuests.map((quest, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${pillars[quest.pillar].color}`} />
                  <span className="text-sm font-medium">{quest.title}</span>
                </div>
                <span className="text-xs text-gray-500">{quest.xp} XP</span>
              </div>
            ))}
            <div className="text-center py-4 text-gray-500">
              <p className="text-sm">+ 85 more quests available</p>
              <p className="text-xs mt-1">New quests added weekly!</p>
            </div>
          </div>

          <p className="text-sm text-gray-600 italic">
            In the full version, you can browse, filter, and start any quest that interests you.
          </p>
        </div>
      </InfoModal>
    </div>
  );
};

export default QuestSelector;