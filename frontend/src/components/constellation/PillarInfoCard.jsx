import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const PillarInfoCard = ({ pillar, position, containerDimensions, onClose }) => {
  const navigate = useNavigate();

  if (!pillar || !position) return null;

  // Calculate smart positioning to avoid viewport edges
  const getCardPosition = () => {
    const cardHeight = 320;
    const cardWidth = 300;
    const spacing = 20;

    let top = position.y + 80; // Default: below star
    let left = position.x - cardWidth / 2;

    // If too low, show above
    if (top + cardHeight > containerDimensions.height - 40) {
      top = position.y - 80 - cardHeight;
    }

    // Keep within horizontal bounds
    left = Math.max(20, Math.min(left, containerDimensions.width - cardWidth - 20));

    return { top, left };
  };

  const cardPosition = getCardPosition();

  // Get pillar level based on XP
  const getLevel = (xp) => {
    if (xp === 0) return 'Explorer';
    if (xp < 250) return 'Builder';
    if (xp < 750) return 'Creator';
    if (xp < 1500) return 'Scholar';
    return 'Sage';
  };

  // Calculate progress to next level
  const getProgress = (xp) => {
    const thresholds = [0, 250, 750, 1500, 3000];
    for (let i = 0; i < thresholds.length - 1; i++) {
      if (xp < thresholds[i + 1]) {
        const current = xp - thresholds[i];
        const needed = thresholds[i + 1] - thresholds[i];
        return {
          percent: (current / needed) * 100,
          current: current,
          needed: needed,
          nextLevel: ['Builder', 'Creator', 'Scholar', 'Sage', 'Master'][i]
        };
      }
    }
    return { percent: 100, current: xp, needed: xp, nextLevel: 'Master' };
  };

  const level = getLevel(pillar.xp);
  const progress = getProgress(pillar.xp);

  // Pillar colors
  const pillarColors = {
    'stem_logic': { primary: '#3b82f6', accent: '#60a5fa' },
    'society_culture': { primary: '#a855f7', accent: '#c084fc' },
    'arts_creativity': { primary: '#ef597b', accent: '#f8b3c5' },
    'language_communication': { primary: '#f59e0b', accent: '#fbbf24' },
    'life_wellness': { primary: '#10b981', accent: '#34d399' }
  };

  const colors = pillarColors[pillar.id] || { primary: '#ffffff', accent: '#cccccc' };

  const handleExploreClick = () => {
    navigate(`/quests?pillar=${pillar.id}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{
        position: 'absolute',
        top: `${cardPosition.top}px`,
        left: `${cardPosition.left}px`,
        zIndex: 100,
      }}
      className="w-[300px]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-gray-900/95 backdrop-blur-md border border-white/20
                      rounded-2xl p-6 shadow-2xl">
        {/* Pillar Name with Gradient */}
        <h3
          className="text-2xl font-bold mb-4 bg-gradient-to-r text-transparent bg-clip-text"
          style={{
            backgroundImage: `linear-gradient(90deg, ${colors.primary}, ${colors.accent})`
          }}
        >
          {pillar.name}
        </h3>

        {/* Stats Grid */}
        <div className="space-y-3 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">Total XP</span>
            <span className="text-white font-semibold text-lg">{pillar.xp}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">Current Level</span>
            <span className="text-white font-semibold">{level}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">Quests Completed</span>
            <span className="text-white font-semibold">{pillar.questCount || 0}</span>
          </div>
        </div>

        {/* Progress Section */}
        {progress.percent < 100 && (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-400 text-xs">Progress to {progress.nextLevel}</span>
              <span className="text-gray-400 text-xs">
                {Math.round(progress.current)} / {progress.needed} XP
              </span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{
                  backgroundImage: `linear-gradient(90deg, ${colors.primary}, ${colors.accent})`
                }}
                initial={{ width: 0 }}
                animate={{ width: `${progress.percent}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}

        {/* Motivational Message */}
        <p className="text-gray-300 text-sm mb-4 italic">
          {pillar.xp === 0
            ? `Begin your journey in ${pillar.name}`
            : pillar.xp < 250
            ? `You're discovering ${pillar.name}`
            : pillar.xp < 750
            ? `Your skills in ${pillar.name} are growing`
            : pillar.xp < 1500
            ? `You're excelling in ${pillar.name}`
            : `You've mastered ${pillar.name}`}
        </p>

        {/* CTA Button */}
        <button
          onClick={handleExploreClick}
          className="w-full py-3 rounded-lg text-white font-medium
                     transition-all transform hover:scale-105 hover:shadow-lg"
          style={{
            backgroundImage: `linear-gradient(90deg, ${colors.primary}, ${colors.accent})`
          }}
        >
          Explore Quests
        </button>
      </div>
    </motion.div>
  );
};

export default React.memo(PillarInfoCard);
