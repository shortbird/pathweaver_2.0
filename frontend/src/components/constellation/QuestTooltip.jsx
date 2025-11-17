import React from 'react';
import { motion } from 'framer-motion';

const QuestTooltip = ({ quest, position, containerDimensions }) => {
  if (!quest || !position) return null;

  // Calculate smart positioning
  const getTooltipPosition = () => {
    const tooltipHeight = 160;
    const tooltipWidth = 260;
    const spacing = 15;

    let top = position.y + spacing;
    let left = position.x - tooltipWidth / 2;

    // If too low, show above
    if (top + tooltipHeight > containerDimensions.height - 40) {
      top = position.y - tooltipHeight - spacing;
    }

    // Keep within horizontal bounds
    left = Math.max(20, Math.min(left, containerDimensions.width - tooltipWidth - 20));

    return { top, left };
  };

  const tooltipPosition = getTooltipPosition();

  // Get dominant pillar color
  const getDominantPillar = () => {
    let maxXP = 0;
    let dominantPillar = null;

    Object.entries(quest.xpDistribution).forEach(([pillarId, xp]) => {
      if (xp > maxXP) {
        maxXP = xp;
        dominantPillar = pillarId;
      }
    });

    return dominantPillar;
  };

  const pillarColors = {
    'stem': { primary: '#3b82f6', accent: '#60a5fa' },           // Blue
    'civics': { primary: '#a855f7', accent: '#c084fc' },         // Purple
    'art': { primary: '#EF597B', accent: '#f8b3c5' },            // Pink
    'communication': { primary: '#f59e0b', accent: '#fbbf24' },  // Orange
    'wellness': { primary: '#10b981', accent: '#34d399' }        // Green
  };

  const dominant = getDominantPillar();
  const colors = dominant ? pillarColors[dominant] : { primary: '#ffffff', accent: '#cccccc' };

  const pillarNames = {
    'stem': 'STEM',
    'civics': 'Civics',
    'art': 'Art',
    'communication': 'Communication',
    'wellness': 'Wellness'
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 5, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 5, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      style={{
        position: 'absolute',
        top: `${tooltipPosition.top}px`,
        left: `${tooltipPosition.left}px`,
        zIndex: 100,
      }}
      className="w-[260px] pointer-events-none"
    >
      <div className="bg-gray-900/95 backdrop-blur-md border border-white/20
                      rounded-xl p-4 shadow-2xl">
        {/* Quest Title */}
        <h4 className="text-white font-semibold text-sm mb-3 line-clamp-2">
          {quest.title}
        </h4>

        {/* Status Badge */}
        <div className="mb-3">
          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
            quest.status === 'completed'
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          }`}>
            {quest.status === 'completed' ? 'Completed' : 'In Progress'}
          </span>
        </div>

        {/* XP Breakdown */}
        <div className="space-y-1.5">
          <div className="text-xs text-gray-400 mb-1">XP Distribution:</div>
          {Object.entries(quest.xpDistribution)
            .sort((a, b) => b[1] - a[1])
            .map(([pillarId, xp]) => {
              const pillarColor = pillarColors[pillarId]?.primary || '#888';

              return (
                <div key={pillarId} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: pillarColor }}
                    />
                    <span className="text-gray-300">{pillarNames[pillarId]}</span>
                  </div>
                  <span className="text-white font-medium">{xp} XP</span>
                </div>
              );
            })}
        </div>

        {/* Total XP */}
        <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center">
          <span className="text-gray-400 text-xs">Total XP</span>
          <span className="text-white font-bold text-sm">{quest.totalXP}</span>
        </div>
      </div>
    </motion.div>
  );
};

export default React.memo(QuestTooltip);
