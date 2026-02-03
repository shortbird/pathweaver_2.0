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
  index,
  isFocused = false
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Calculate orb size based on XP (60-140px range)
  const calculateSize = (xp) => {
    const minSize = 60;
    const maxSize = 140;
    const maxXP = 3000;
    return Math.min(minSize + (xp / maxXP) * (maxSize - minSize), maxSize);
  };

  // Calculate brightness based on XP (0.5-1.0 range)
  const calculateBrightness = (xp) => {
    const minBrightness = 0.5;
    const maxBrightness = 1.0;
    const maxXP = 3000;
    return Math.min(minBrightness + (xp / maxXP) * (maxBrightness - minBrightness), maxBrightness);
  };

  const size = calculateSize(xp);
  const brightness = calculateBrightness(xp);

  // Pillar-specific colors (NEW simplified system - January 2025)
  const pillarColors = {
    'stem': '#3b82f6',           // Blue
    'civics': '#a855f7',         // Purple
    'art': '#EF597B',            // Pink
    'communication': '#f59e0b',  // Orange
    'wellness': '#10b981'        // Green
  };

  const color = pillarColors[pillar.id] || '#ffffff';

  const handleMouseEnter = () => {
    setIsHovered(true);
    onHover?.(pillar, position);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onLeave?.();
  };

  // Pure light orb with lens flare effect - like the reference image
  const LightOrb = ({ size, brightness, color, isHovered, isActive }) => {
    const glowIntensity = isHovered ? 1.4 : (isActive ? 1.15 : 1.0);
    const coreSize = size * 0.15; // Small bright core
    const innerGlowSize = size * 0.5;
    const outerGlowSize = size * 1.2;

    return (
      <motion.div
        className="relative"
        style={{ width: size, height: size }}
        animate={isActive ? {
          filter: [
            `brightness(${brightness}) saturate(1.2)`,
            `brightness(${brightness * 1.15}) saturate(1.3)`,
            `brightness(${brightness}) saturate(1.2)`
          ]
        } : {
          filter: `brightness(${brightness}) saturate(1.2)`
        }}
        transition={isActive ? {
          duration: 3,
          repeat: Infinity,
          ease: [0.4, 0.0, 0.6, 1]
        } : {}}
      >
        {/* Outer glow - very soft, large spread */}
        <div
          className="absolute top-1/2 left-1/2 rounded-full blur-3xl"
          style={{
            width: outerGlowSize * glowIntensity,
            height: outerGlowSize * glowIntensity,
            background: `radial-gradient(circle, ${color}40, transparent 70%)`,
            transform: 'translate(-50%, -50%)',
            opacity: 0.6 * glowIntensity,
            transition: 'all 0.3s ease-out'
          }}
        />

        {/* Lens flare cross - horizontal */}
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            width: size * 2 * glowIntensity,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${color}80, white, ${color}80, transparent)`,
            transform: 'translate(-50%, -50%)',
            opacity: 0.7 * glowIntensity,
            boxShadow: `0 0 20px ${color}`,
            transition: 'all 0.3s ease-out'
          }}
        />

        {/* Lens flare cross - vertical */}
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            width: 2,
            height: size * 2 * glowIntensity,
            background: `linear-gradient(180deg, transparent, ${color}80, white, ${color}80, transparent)`,
            transform: 'translate(-50%, -50%)',
            opacity: 0.7 * glowIntensity,
            boxShadow: `0 0 20px ${color}`,
            transition: 'all 0.3s ease-out'
          }}
        />

        {/* Diagonal flares (4-point star effect) */}
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            width: size * 1.5 * glowIntensity,
            height: 1.5,
            background: `linear-gradient(90deg, transparent, ${color}60, white, ${color}60, transparent)`,
            transform: 'translate(-50%, -50%) rotate(45deg)',
            opacity: 0.5 * glowIntensity,
            boxShadow: `0 0 15px ${color}`,
            transition: 'all 0.3s ease-out'
          }}
        />
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            width: size * 1.5 * glowIntensity,
            height: 1.5,
            background: `linear-gradient(90deg, transparent, ${color}60, white, ${color}60, transparent)`,
            transform: 'translate(-50%, -50%) rotate(-45deg)',
            opacity: 0.5 * glowIntensity,
            boxShadow: `0 0 15px ${color}`,
            transition: 'all 0.3s ease-out'
          }}
        />

        {/* Inner glow - soft color tint */}
        <div
          className="absolute top-1/2 left-1/2 rounded-full blur-xl"
          style={{
            width: innerGlowSize * glowIntensity,
            height: innerGlowSize * glowIntensity,
            background: `radial-gradient(circle, ${color}60, ${color}30, transparent 70%)`,
            transform: 'translate(-50%, -50%)',
            opacity: 0.8 * glowIntensity,
            transition: 'all 0.3s ease-out'
          }}
        />

        {/* Bright white core */}
        <div
          className="absolute top-1/2 left-1/2 rounded-full blur-sm"
          style={{
            width: coreSize * glowIntensity,
            height: coreSize * glowIntensity,
            background: 'radial-gradient(circle, white, white 40%, transparent)',
            transform: 'translate(-50%, -50%)',
            opacity: 1,
            boxShadow: `0 0 ${20 * glowIntensity}px white, 0 0 ${40 * glowIntensity}px ${color}`,
            transition: 'all 0.3s ease-out'
          }}
        />
      </motion.div>
    );
  };

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{
        delay: index * 0.15,
        duration: 0.6,
        ease: [0.34, 1.56, 0.64, 1],
      }}
      style={{
        position: 'absolute',
        left: `${position.x - size / 2}px`,
        top: `${position.y - size / 2}px`,
        cursor: 'pointer',
        zIndex: isHovered ? 50 : 10,
        // Hitbox matches visual size to avoid covering quest orbs
        width: `${size}px`,
        height: `${size}px`,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => onClick?.(pillar)}
      className="constellation-orb"
      role="button"
      tabIndex={0}
      aria-label={`${pillar.name}: ${xp} XP.`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(pillar);
        }
      }}
    >
      {/* Keyboard Focus Indicator Ring */}
      {isFocused && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{
            scale: [1, 1.05, 1],
            opacity: [0.8, 1, 0.8]
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          style={{
            position: 'absolute',
            width: size * 1.4,
            height: size * 1.4,
            left: (size - size * 1.4) / 2,
            top: (size - size * 1.4) / 2,
            borderRadius: '50%',
            border: `3px solid ${color}`,
            boxShadow: `0 0 20px ${color}, 0 0 40px ${color}, inset 0 0 20px ${color}40`,
            pointerEvents: 'none'
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) scale(${isHovered ? 1.15 : 1})`,
          transition: 'transform 0.3s ease-out',
          pointerEvents: 'none',
        }}
      >
        <LightOrb
          size={size}
          brightness={brightness}
          color={color}
          isHovered={isHovered}
          isActive={isActive}
        />
      </div>
    </motion.div>
  );
};

export default React.memo(PillarOrb);
