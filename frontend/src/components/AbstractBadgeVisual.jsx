import React from 'react';

/**
 * AbstractBadgeVisual
 *
 * Renders growing abstract shapes based on badge progress (5 stages).
 * Shapes evolve from simple circle to complex mandala as quests are completed.
 *
 * Uses pillar colors for visual identity.
 */
const AbstractBadgeVisual = ({ stage = 1, pillar = 'stem', size = 100 }) => {
  const pillarColors = {
    stem: { primary: '#6D469B', secondary: '#8B5BAD' },       // Purple
    wellness: { primary: '#10B981', secondary: '#34D399' },    // Green
    communication: { primary: '#3B82F6', secondary: '#60A5FA' }, // Blue
    civics: { primary: '#F97316', secondary: '#FB923C' },      // Orange
    art: { primary: '#EF597B', secondary: '#F687A1' }          // Pink
  };

  const colors = pillarColors[pillar] || pillarColors.stem;

  // Stage SVG paths - from simple to complex
  const getStagePath = () => {
    switch (stage) {
      case 1:
        // Simple circle
        return (
          <circle
            cx="50"
            cy="50"
            r="30"
            fill={colors.primary}
            opacity="0.6"
          />
        );

      case 2:
        // Circle with square layer
        return (
          <>
            <circle cx="50" cy="50" r="30" fill={colors.primary} opacity="0.5" />
            <rect x="35" y="35" width="30" height="30" fill={colors.secondary} opacity="0.7" />
          </>
        );

      case 3:
        // Two intersecting shapes
        return (
          <>
            <path
              d="M50,20 L80,50 L50,80 L20,50 Z"
              fill={colors.primary}
              opacity="0.6"
            />
            <circle cx="35" cy="35" r="15" fill={colors.secondary} opacity="0.8" />
          </>
        );

      case 4:
        // Complex pattern emerging
        return (
          <>
            <circle cx="50" cy="50" r="35" fill={colors.primary} opacity="0.4" />
            <path
              d="M50,20 L65,40 L80,50 L65,60 L50,80 L35,60 L20,50 L35,40 Z"
              fill={colors.secondary}
              opacity="0.8"
            />
          </>
        );

      case 5:
        // Complete mandala
        return (
          <>
            <circle cx="50" cy="50" r="40" fill={colors.primary} opacity="0.3" />
            <path
              d="M50,15 L55,35 L65,30 L60,45 L75,50 L60,55 L65,70 L55,65 L50,85 L45,65 L35,70 L40,55 L25,50 L40,45 L35,30 L45,35 Z"
              fill={colors.secondary}
              opacity="0.9"
            />
            <circle cx="35" cy="35" r="8" fill={colors.primary} opacity="0.8" />
            <circle cx="65" cy="35" r="8" fill={colors.primary} opacity="0.8" />
            <circle cx="35" cy="65" r="8" fill={colors.primary} opacity="0.8" />
            <circle cx="65" cy="65" r="8" fill={colors.primary} opacity="0.8" />
          </>
        );

      default:
        return <circle cx="50" cy="50" r="30" fill={colors.primary} opacity="0.6" />;
    }
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className="transition-all duration-500"
    >
      <defs>
        <linearGradient id={`gradient-${pillar}-${stage}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={colors.primary} />
          <stop offset="100%" stopColor={colors.secondary} />
        </linearGradient>
      </defs>

      <g style={{ fill: `url(#gradient-${pillar}-${stage})` }}>
        {getStagePath()}
      </g>

      {/* Stage indicator */}
      <text
        x="50"
        y="95"
        textAnchor="middle"
        fontSize="8"
        fill="#666"
        fontWeight="600"
      >
        Stage {stage}/5
      </text>
    </svg>
  );
};

export default AbstractBadgeVisual;
