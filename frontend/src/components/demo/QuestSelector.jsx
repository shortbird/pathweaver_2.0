import React, { useState } from 'react';
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

  const questIcons = {
    'family-recipes': <ChefHat className="w-6 h-6" />,
    'music-composition': <Palette className="w-6 h-6" />,
    'small-business': <Briefcase className="w-6 h-6" />,
    'volunteer-impact': <Heart className="w-6 h-6" />
  };

  const pillars = {
    creativity: { color: 'bg-purple-500', name: 'Creativity' },
    critical_thinking: { color: 'bg-blue-500', name: 'Critical Thinking' },
    practical_skills: { color: 'bg-green-500', name: 'Practical Skills' },
    communication: { color: 'bg-orange-500', name: 'Communication' },
    cultural_literacy: { color: 'bg-pink-500', name: 'Cultural Literacy' }
  };

  const isQuestSelected = (questId) => {
    return selectedQuests.some(q => q.id === questId);
  };

  const additionalQuests = [
    { title: "Build a Weather App", xp: 300, pillar: "practical_skills" },
    { title: "Create a Podcast Series", xp: 350, pillar: "communication" },
    { title: "Design a Board Game", xp: 400, pillar: "creativity" },
    { title: "Local History Documentary", xp: 350, pillar: "cultural_literacy" },
    { title: "Learn Sign Language", xp: 300, pillar: "communication" },
    { title: "Community Garden Project", xp: 400, pillar: "practical_skills" },
    { title: "Write a Children's Book", xp: 350, pillar: "creativity" },
    { title: "Solar Power Experiment", xp: 300, pillar: "critical_thinking" },
    { title: "Cultural Exchange Blog", xp: 300, pillar: "cultural_literacy" },
    { title: "3D Printing Workshop", xp: 350, pillar: "practical_skills" },
    // Add more to reach 100+
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-[#003f5c]">
          Start Multiple Quests
        </h2>
        <p className="text-gray-600">
          Choose up to 4 quests to begin your learning journey
        </p>
        <p className="text-sm text-[#6d469b]">
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
                    ? 'border-[#6d469b] bg-[#6d469b]/5 shadow-md'
                    : 'border-gray-200 bg-white'
              }`}>
                {/* Quest Header */}
                <div className="flex items-start gap-4 mb-4">
                  <div className={`p-3 rounded-lg ${
                    selected 
                      ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white' 
                      : 'bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 text-[#6d469b]'
                  }`}>
                    {questIcons[quest.id]}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg text-[#003f5c] mb-1">
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

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#6d469b]">
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
          className="inline-flex items-center gap-2 px-6 py-3 bg-white border-2 border-[#6d469b] text-[#6d469b] rounded-lg font-semibold hover:bg-[#6d469b]/10 transition-all"
        >
          <Search className="w-5 h-5" />
          Browse 100+ More Quests
        </button>
      </div>

      {/* Info Box */}
      <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-[#6d469b] mt-0.5" />
          <div className="space-y-2">
            <h4 className="font-semibold text-[#003f5c]">Open-Ended Learning</h4>
            <p className="text-sm text-gray-700">
              Start multiple quests simultaneously - just like real life! Complete tasks at your own pace, 
              switch between projects, and build a diverse portfolio that reflects your interests.
            </p>
            <p className="text-sm text-gray-600 italic">
              There's no "failing" a quest - only choosing to focus elsewhere.
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