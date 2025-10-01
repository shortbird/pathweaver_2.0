import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const ConstellationView = ({ badges, userBadges }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [hoveredBadge, setHoveredBadge] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        const height = Math.max(600, width * 0.75); // Maintain aspect ratio
        setDimensions({ width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Map badges to positions in a circular constellation pattern
  const badgePositions = badges.map((badge, index) => {
    const angle = (index / badges.length) * 2 * Math.PI;
    const radius = Math.min(dimensions.width, dimensions.height) * 0.35;
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    return {
      ...badge,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      isEarned: userBadges?.some((ub) => ub.badge_id === badge.id && ub.is_earned),
      progress: userBadges?.find((ub) => ub.badge_id === badge.id)?.completed_quests || 0,
    };
  });

  // Draw constellation connections
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    // Draw connections between earned badges
    const earnedBadges = badgePositions.filter((b) => b.isEarned);
    ctx.strokeStyle = 'rgba(111, 70, 155, 0.3)'; // Purple from brand gradient
    ctx.lineWidth = 2;

    for (let i = 0; i < earnedBadges.length; i++) {
      for (let j = i + 1; j < earnedBadges.length; j++) {
        const badge1 = earnedBadges[i];
        const badge2 = earnedBadges[j];

        // Only connect badges in the same pillar
        if (badge1.pillar === badge2.pillar) {
          ctx.beginPath();
          ctx.moveTo(badge1.x, badge1.y);
          ctx.lineTo(badge2.x, badge2.y);
          ctx.stroke();
        }
      }
    }

    // Draw faint connections for in-progress badges
    const inProgressBadges = badgePositions.filter((b) => !b.isEarned && b.progress > 0);
    ctx.strokeStyle = 'rgba(239, 89, 123, 0.2)'; // Pink from brand gradient
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    inProgressBadges.forEach((badge) => {
      const nearestEarned = earnedBadges
        .filter((eb) => eb.pillar === badge.pillar)
        .sort((a, b) => {
          const distA = Math.hypot(a.x - badge.x, a.y - badge.y);
          const distB = Math.hypot(b.x - badge.x, b.y - badge.y);
          return distA - distB;
        })[0];

      if (nearestEarned) {
        ctx.beginPath();
        ctx.moveTo(badge.x, badge.y);
        ctx.lineTo(nearestEarned.x, nearestEarned.y);
        ctx.stroke();
      }
    });

    ctx.setLineDash([]);
  }, [badgePositions, dimensions]);

  const pillarColors = {
    'STEM & Logic': 'bg-blue-500',
    'Life & Wellness': 'bg-green-500',
    'Language & Communication': 'bg-amber-500',
    'Society & Culture': 'bg-purple-500',
    'Arts & Creativity': 'bg-pink-500',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Badge Constellation</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Your learning journey visualized as a constellation. Earned badges connect to form your unique pattern.
      </p>

      <div ref={containerRef} className="relative" style={{ height: `${dimensions.height}px` }}>
        {/* Canvas for connections */}
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          className="absolute inset-0"
        />

        {/* Badge nodes */}
        {badgePositions.map((badge) => (
          <motion.div
            key={badge.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: Math.random() * 0.3 }}
            style={{
              position: 'absolute',
              left: `${badge.x}px`,
              top: `${badge.y}px`,
              transform: 'translate(-50%, -50%)',
            }}
            onMouseEnter={() => setHoveredBadge(badge)}
            onMouseLeave={() => setHoveredBadge(null)}
            className="cursor-pointer"
          >
            <motion.div
              whileHover={{ scale: 1.2 }}
              className={`relative w-16 h-16 rounded-full flex items-center justify-center ${
                badge.isEarned
                  ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] ring-4 ring-green-400'
                  : badge.progress > 0
                  ? 'bg-gradient-to-r from-gray-300 to-gray-400 ring-2 ring-blue-400'
                  : 'bg-gray-200 dark:bg-gray-700'
              } shadow-lg`}
            >
              <div className="text-2xl">{badge.icon || '🎯'}</div>

              {/* Progress ring */}
              {badge.progress > 0 && !badge.isEarned && (
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle
                    cx="50%"
                    cy="50%"
                    r="30"
                    fill="none"
                    stroke="rgba(59, 130, 246, 0.5)"
                    strokeWidth="3"
                    strokeDasharray={`${(badge.progress / badge.required_quest_count) * 188.4} 188.4`}
                  />
                </svg>
              )}

              {/* Earned checkmark */}
              {badge.isEarned && (
                <div className="absolute -top-1 -right-1 bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                  ✓
                </div>
              )}
            </motion.div>
          </motion.div>
        ))}

        {/* Tooltip */}
        {hoveredBadge && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bg-gray-900 text-white p-3 rounded-lg shadow-xl max-w-xs z-50"
            style={{
              left: `${hoveredBadge.x}px`,
              top: `${hoveredBadge.y - 80}px`,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="font-bold mb-1">{hoveredBadge.name}</div>
            <div className="text-xs text-gray-300 mb-2">{hoveredBadge.pillar}</div>
            {hoveredBadge.isEarned ? (
              <div className="text-xs text-green-400 font-medium">Earned!</div>
            ) : hoveredBadge.progress > 0 ? (
              <div className="text-xs text-blue-400">
                {hoveredBadge.progress}/{hoveredBadge.required_quest_count} quests completed
              </div>
            ) : (
              <div className="text-xs text-gray-400">Not started</div>
            )}
          </motion.div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-4 justify-center text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] ring-2 ring-green-400"></div>
          <span className="text-gray-600 dark:text-gray-400">Earned</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-gradient-to-r from-gray-300 to-gray-400 ring-2 ring-blue-400"></div>
          <span className="text-gray-600 dark:text-gray-400">In Progress</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700"></div>
          <span className="text-gray-600 dark:text-gray-400">Not Started</span>
        </div>
      </div>
    </div>
  );
};

export default ConstellationView;
