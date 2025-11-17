import React from 'react';
import { motion } from 'framer-motion';

const PillarInfoCard = ({ pillar, position, containerDimensions }) => {
  if (!pillar || !position) return null;

  // Calculate smart positioning to avoid viewport edges
  const getCardPosition = () => {
    const cardHeight = 140; // Reduced height without button
    const cardWidth = 280;
    const spacing = 20;

    let top = position.y + 80; // Default: below orb
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

  // Pillar colors (NEW simplified system - January 2025)
  const pillarColors = {
    'stem': { primary: '#3b82f6', accent: '#60a5fa' },           // Blue
    'civics': { primary: '#a855f7', accent: '#c084fc' },         // Purple
    'art': { primary: '#EF597B', accent: '#f8b3c5' },            // Pink
    'communication': { primary: '#f59e0b', accent: '#fbbf24' },  // Orange
    'wellness': { primary: '#10b981', accent: '#34d399' }        // Green
  };

  const colors = pillarColors[pillar.id] || { primary: '#ffffff', accent: '#cccccc' };

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
      className="w-[280px] pointer-events-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-gray-900/95 backdrop-blur-md border border-white/20
                      rounded-2xl p-5 shadow-2xl">
        {/* Pillar Name with Gradient */}
        <h3
          className="text-2xl font-bold mb-4 bg-gradient-to-r text-transparent bg-clip-text"
          style={{
            backgroundImage: `linear-gradient(90deg, ${colors.primary}, ${colors.accent})`
          }}
        >
          {pillar.name}
        </h3>

        {/* Total XP */}
        <div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-base">Total XP</span>
            <span className="text-white font-bold text-2xl">{pillar.xp}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default React.memo(PillarInfoCard);
