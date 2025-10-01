import React, { useState } from 'react';
import { motion } from 'framer-motion';

const PillarOrb = ({
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

  // Calculate orb size based on XP (60-140px range)
  const calculateSize = (xp) => {
    const minSize = 60;
    const maxSize = 140;
    const maxXP = 3000; // Sage level
    return Math.min(minSize + (xp / maxXP) * (maxSize - minSize), maxSize);
  };

  // Calculate brightness based on XP (0.4-1.0 range)
  const calculateBrightness = (xp) => {
    const minBrightness = 0.4;
    const maxBrightness = 1.0;
    const maxXP = 3000;
    return Math.min(minBrightness + (xp / maxXP) * (maxBrightness - minBrightness), maxBrightness);
  };

  const size = calculateSize(xp);
  const brightness = calculateBrightness(xp);

  // Pillar-specific colors
  const pillarColors = {
    'stem_logic': {
      primary: '#3b82f6',
      light: '#60a5fa',
      glow: 'rgba(59, 130, 246, 0.6)'
    },
    'society_culture': {
      primary: '#a855f7',
      light: '#c084fc',
      glow: 'rgba(168, 85, 247, 0.6)'
    },
    'arts_creativity': {
      primary: '#ef597b',
      light: '#f8b3c5',
      glow: 'rgba(239, 89, 123, 0.6)'
    },
    'language_communication': {
      primary: '#f59e0b',
      light: '#fbbf24',
      glow: 'rgba(245, 158, 11, 0.6)'
    },
    'life_wellness': {
      primary: '#10b981',
      light: '#34d399',
      glow: 'rgba(16, 185, 129, 0.6)'
    }
  };

  const colors = pillarColors[pillar.id] || {
    primary: '#ffffff',
    light: '#cccccc',
    glow: 'rgba(255, 255, 255, 0.6)'
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    onHover?.(pillar, position);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onLeave?.();
  };

  // Glowing orb using layered radial gradients
  const GlowingOrb = ({ size, brightness, isHovered, isActive }) => {
    const glowIntensity = isHovered ? 1.3 : (isActive ? 1.1 : 1.0);

    return (
      <motion.div
        className="relative"
        style={{ width: size, height: size }}
        animate={isActive ? {
          filter: [`brightness(${brightness})`, `brightness(${brightness * 1.1})`, `brightness(${brightness})`]
        } : {
          filter: `brightness(${brightness})`
        }}
        transition={isActive ? {
          duration: 3,
          repeat: Infinity,
          ease: [0.4, 0.0, 0.6, 1]
        } : {}}
      >
        {/* Outer glow - largest, most transparent */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 30% 30%,
              ${colors.glow},
              transparent 70%)`,
            transform: `scale(${1.5 * glowIntensity})`,
            opacity: 0.3 * glowIntensity,
            transition: 'all 0.3s ease-out'
          }}
        />

        {/* Mid glow - medium size, semi-transparent */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 35% 35%,
              ${colors.light},
              ${colors.primary} 50%,
              transparent 80%)`,
            transform: `scale(${1.2 * glowIntensity})`,
            opacity: 0.6 * glowIntensity,
            transition: 'all 0.3s ease-out'
          }}
        />

        {/* Core orb - solid color with bright center */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 30% 30%,
              white,
              ${colors.light} 30%,
              ${colors.primary} 60%,
              ${colors.primary} 100%)`,
            boxShadow: `
              0 0 ${20 * glowIntensity}px ${colors.glow},
              inset 0 0 ${30 * glowIntensity}px rgba(255,255,255,0.3)
            `,
            transition: 'all 0.3s ease-out'
          }}
        />
      </motion.div>
    );
  };

  return (
    <>
      {/* Orb container - only this scales on hover */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          delay: index * 0.15,
          duration: 0.6,
          ease: [0.34, 1.56, 0.64, 1], // Spring easing
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
        className="constellation-orb"
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
        <GlowingOrb
          size={size}
          brightness={brightness}
          isHovered={isHovered}
          isActive={isActive}
        />
      </motion.div>

      {/* Pillar name label - OUTSIDE scaling container, fixed position */}
      <div
        style={{
          position: 'absolute',
          left: `${position.x}px`,
          top: `${position.y + size/2 + 20}px`,
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
          zIndex: isHovered ? 51 : 11,
        }}
        className="hidden sm:block"
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: isHovered ? 1 : 0.7, y: 0 }}
          className="whitespace-nowrap text-white font-medium text-sm"
          style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
        >
          {pillar.name}
        </motion.div>
      </div>
    </>
  );
};

export default React.memo(PillarOrb);
