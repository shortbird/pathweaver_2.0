import React from 'react';
import { useDemo } from '../../contexts/DemoContext';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

// Pexels images for each quest
const questImages = {
  'build-robot': 'https://images.pexels.com/photos/8566473/pexels-photo-8566473.jpeg?auto=compress&cs=tinysrgb&w=800',
  'compose-music': 'https://images.pexels.com/photos/164821/pexels-photo-164821.jpeg?auto=compress&cs=tinysrgb&w=800',
  'start-business': 'https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg?auto=compress&cs=tinysrgb&w=800',
  'train-5k': 'https://images.pexels.com/photos/2526878/pexels-photo-2526878.jpeg?auto=compress&cs=tinysrgb&w=800',
  'create-film': 'https://images.pexels.com/photos/2873486/pexels-photo-2873486.jpeg?auto=compress&cs=tinysrgb&w=800',
  'design-garden': 'https://images.pexels.com/photos/1105019/pexels-photo-1105019.jpeg?auto=compress&cs=tinysrgb&w=800'
};

const QuestCard = ({ quest, isSelected, onSelect }) => {
  const imageUrl = questImages[quest.id] || 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=800';

  return (
    <button
      onClick={() => onSelect(quest.id)}
      className={`group relative w-full text-left rounded-xl overflow-hidden transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-optio-purple focus:ring-offset-2
        ${isSelected
          ? 'ring-4 ring-optio-purple shadow-xl scale-[1.02]'
          : 'shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-1'
        }`}
      aria-pressed={isSelected}
    >
      {/* Header Image */}
      <div className="relative h-40 overflow-hidden">
        <img
          src={imageUrl}
          alt={quest.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

        {/* Selected indicator */}
        {isSelected && (
          <div className="absolute top-3 right-3">
            <div className="flex items-center gap-1 bg-optio-purple text-white text-xs font-medium px-2 py-1 rounded-full">
              <CheckCircleIcon className="h-4 w-4" />
              <span>Selected</span>
            </div>
          </div>
        )}

        {/* Title overlay at bottom of image */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="text-lg font-semibold text-white line-clamp-2 drop-shadow-md">
            {quest.title}
          </h3>
        </div>
      </div>

      {/* Card Body */}
      <div className="bg-white p-4">
        <p className="text-gray-600 text-sm line-clamp-2">
          {quest.description}
        </p>
      </div>
    </button>
  );
};

const DemoQuestGrid = () => {
  const { demoQuests, demoState, actions } = useDemo();

  return (
    <div className="space-y-6">
      {/* Intro text */}
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-gray-600">
          Choose a quest that matches something you are excited to work on.
          Each quest earns real academic credit across multiple subjects.
        </p>
      </div>

      {/* Quest grid - 2 columns on mobile, 3 on larger screens */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {demoQuests.map((quest) => (
          <QuestCard
            key={quest.id}
            quest={quest}
            isSelected={demoState.selectedQuest?.id === quest.id}
            onSelect={actions.selectQuest}
          />
        ))}
      </div>

      {/* Selection feedback */}
      {demoState.selectedQuest && (
        <div className="mt-4 p-4 bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 rounded-lg border border-optio-purple/20">
          <p className="text-center text-gray-700">
            <span className="font-semibold text-optio-purple">
              {demoState.selectedQuest.title}
            </span>
            {' '}selected. You can earn up to{' '}
            <span className="font-bold">{demoState.selectedQuest.totalXP} XP</span>.
          </p>
        </div>
      )}
    </div>
  );
};

export default DemoQuestGrid;
