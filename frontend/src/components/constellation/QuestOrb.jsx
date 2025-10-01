import React, { useState } from 'react';
import { motion } from 'framer-motion';

const QuestOrb = ({
  quest,
  position,
  pillarPositions,
  onHover,
  onLeave,
  onClick,
  index
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Calculate orb size based on total quest XP (8-20px range)
  const calculateSize = (totalXP) => {
    const minSize = 8;
    const maxSize = 20;
    const maxXP = 500; // Typical large quest
    return Math.min(minSize + (totalXP / maxXP) * (maxSize - minSize), maxSize);
  };

  const size = calculateSize(quest.totalXP);

  // Calculate blended color from contributing pillars
  const getBlendedColor = () => {
    const pillarColors = {
      'stem_logic': { r: 59, g: 130, b: 246 },
      'society_culture': { r: 168, g: 85, b: 247 },
      'arts_creativity': { r: 239, g: 89, b: 123 },
      'language_communication': { r: 245, g: 158, b: 11 },
      'life_wellness': { r: 16, g: 185, b: 129 }
    };

    let r = 255, g = 255, b = 255; // Start with white
    let totalWeight = 0;

    Object.entries(quest.xpDistribution).forEach(([pillarId, xp]) => {
      const weight = xp / quest.totalXP;
      const color = pillarColors[pillarId];
      if (color) {
        r += color.r * weight;
        g += color.g * weight;
        b += color.b * weight;
        totalWeight += weight;
      }
    });

    if (totalWeight > 0) {
      r = Math.round(r / (1 + totalWeight));
      g = Math.round(g / (1 + totalWeight));
      b = Math.round(b / (1 + totalWeight));
    }

    return `rgb(${r}, ${g}, ${b})`;
  };

  const color = getBlendedColor();
  const opacity = quest.status === 'completed' ? 1.0 : 0.7;

  const handleMouseEnter = () => {
    setIsHovered(true);
    onHover?.(quest, position);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onLeave?.();
  };

  // Small light ball for quest orb
  const QuestLight = ({ size, color, opacity, isHovered }) => {
    const glowIntensity = isHovered ? 1.5 : 1.0;

    return (
      <motion.div
        className="relative"
        style={{ width: size, height: size }}
      >
        {/* Outer glow */}
        <div
          className="absolute top-1/2 left-1/2 rounded-full blur-md"
          style={{
            width: size * 2.5 * glowIntensity,
            height: size * 2.5 * glowIntensity,
            background: `radial-gradient(circle, ${color}60, transparent 70%)`,
            transform: 'translate(-50%, -50%)',
            opacity: opacity * 0.5 * glowIntensity,
            transition: 'all 0.2s ease-out'
          }}
        />

        {/* Core */}
        <div
          className="absolute top-1/2 left-1/2 rounded-full"
          style={{
            width: size,
            height: size,
            background: `radial-gradient(circle, white, ${color})`,
            transform: 'translate(-50%, -50%)',
            opacity: opacity,
            boxShadow: `0 0 ${10 * glowIntensity}px ${color}`,
            transition: 'all 0.2s ease-out'
          }}
        />
      </motion.div>
    );
  };

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{
        scale: 1,
        opacity: 1,
        y: [0, -3, 0] // Gentle bobbing
      }}
      transition={{
        scale: { delay: 1 + index * 0.02, duration: 0.3 },
        y: {
          duration: 3 + (index % 3),
          repeat: Infinity,
          ease: 'easeInOut'
        }
      }}
      whileHover={{ scale: 1.3 }}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -50%)',
        cursor: 'pointer',
        zIndex: isHovered ? 45 : 5,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => onClick?.(quest)}
      role="button"
      tabIndex={0}
      aria-label={`${quest.title}: ${quest.totalXP} XP`}
    >
      <QuestLight
        size={size}
        color={color}
        opacity={opacity}
        isHovered={isHovered}
      />
    </motion.div>
  );
};

export default React.memo(QuestOrb);
