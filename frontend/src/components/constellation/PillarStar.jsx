import React, { useState } from 'react';
import { motion } from 'framer-motion';

const PillarStar = ({
  pillar,
  position,
  xp,
  isActive,
  onHover,
  onLeave,
  onClick,
  index
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Calculate star size based on XP (60-140px range)
  const calculateSize = (xp) => {
    const minSize = 60;
    const maxSize = 140;
    const maxXP = 3000; // Sage level
    return Math.min(minSize + (xp / maxXP) * (maxSize - minSize), maxSize);
  };

  // Calculate opacity based on XP (0.4-1.0 range)
  const calculateOpacity = (xp) => {
    const minOpacity = 0.4;
    const maxOpacity = 1.0;
    const maxXP = 3000;
    return Math.min(minOpacity + (xp / maxXP) * (maxOpacity - minOpacity), maxOpacity);
  };

  const size = calculateSize(xp);
  const opacity = calculateOpacity(xp);

  // Pillar-specific colors
  const pillarColors = {
    'stem_logic': { primary: '#3b82f6', glow: 'rgba(59, 130, 246, 0.6)' },
    'society_culture': { primary: '#a855f7', glow: 'rgba(168, 85, 247, 0.6)' },
    'arts_creativity': { primary: '#ef597b', glow: 'rgba(239, 89, 123, 0.6)' },
    'language_communication': { primary: '#f59e0b', glow: 'rgba(245, 158, 11, 0.6)' },
    'life_wellness': { primary: '#10b981', glow: 'rgba(16, 185, 129, 0.6)' }
  };

  const colors = pillarColors[pillar.id] || { primary: '#ffffff', glow: 'rgba(255, 255, 255, 0.6)' };

  const handleMouseEnter = () => {
    setIsHovered(true);
    onHover?.(pillar, position);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onLeave?.();
  };

  // Custom star SVG path (5-pointed star)
  const StarSVG = ({ color, size, opacity }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        filter: isHovered || isActive
          ? `drop-shadow(0 0 ${isHovered ? 40 : 20}px ${colors.glow})`
          : `drop-shadow(0 0 10px ${colors.glow})`,
        opacity: opacity
      }}
    >
      {/* Outer glow circle */}
      <circle
        cx="50"
        cy="50"
        r="45"
        fill={colors.glow}
        opacity="0.2"
      />

      {/* Main star shape */}
      <path
        d="M50 10 L61 38 L91 38 L67 56 L77 85 L50 67 L23 85 L33 56 L9 38 L39 38 Z"
        fill={color}
        stroke={color}
        strokeWidth="2"
      />

      {/* Inner highlight */}
      <path
        d="M50 20 L57 38 L73 38 L60 48 L65 65 L50 55 L35 65 L40 48 L27 38 L43 38 Z"
        fill="white"
        opacity="0.3"
      />
    </svg>
  );

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{
        scale: 1,
        opacity: 1,
        ...(isActive && {
          scale: [1, 1.05, 1],
        })
      }}
      transition={{
        delay: index * 0.15,
        duration: 0.6,
        ease: [0.34, 1.56, 0.64, 1], // Spring easing
        ...(isActive && {
          scale: {
            repeat: Infinity,
            duration: 2,
            ease: 'easeInOut'
          }
        })
      }}
      whileHover={{ scale: 1.15 }}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -50%)',
        cursor: 'pointer',
        zIndex: isHovered ? 50 : 10,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => onClick?.(pillar)}
      className="constellation-star"
      role="button"
      tabIndex={0}
      aria-label={`${pillar.name}: ${xp} XP. Click to explore ${pillar.name} quests.`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(pillar);
        }
      }}
    >
      <StarSVG color={colors.primary} size={size} opacity={opacity} />

      {/* Pillar name label (always visible on desktop, hidden on small screens) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: isHovered ? 1 : 0.7, y: 0 }}
        className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap
                   text-white font-medium text-sm pointer-events-none
                   hidden sm:block"
        style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
      >
        {pillar.name}
      </motion.div>
    </motion.div>
  );
};

export default React.memo(PillarStar);
