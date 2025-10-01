import React from 'react';
import { motion } from 'framer-motion';

const ConstellationLines = ({ stars, hoveredStar }) => {
  if (!stars || stars.length === 0) return null;

  // Generate pentagon connections (each star connects to its two neighbors)
  const generateLines = () => {
    const lines = [];
    const numStars = stars.length;

    for (let i = 0; i < numStars; i++) {
      const nextIndex = (i + 1) % numStars;
      const star1 = stars[i];
      const star2 = stars[nextIndex];

      if (star1?.position && star2?.position) {
        const isHighlighted =
          hoveredStar &&
          (hoveredStar.id === star1.id || hoveredStar.id === star2.id);

        lines.push({
          id: `${star1.id}-${star2.id}`,
          x1: star1.position.x,
          y1: star1.position.y,
          x2: star2.position.x,
          y2: star2.position.y,
          isHighlighted,
        });
      }
    }

    return lines;
  };

  const lines = generateLines();

  const lineVariants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: {
      pathLength: 1,
      opacity: 0.4,
      transition: {
        delay: 0.8,
        duration: 1.2,
        ease: 'easeInOut',
      },
    },
  };

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Gradient for lines */}
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ef597b" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#9b6dc2" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#6d469b" stopOpacity="0.6" />
        </linearGradient>

        {/* Shimmer animation filter */}
        <filter id="shimmer">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
        </filter>
      </defs>

      {lines.map((line) => (
        <motion.line
          key={line.id}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="url(#lineGradient)"
          strokeWidth={line.isHighlighted ? 3 : 2}
          strokeLinecap="round"
          initial="hidden"
          animate="visible"
          variants={lineVariants}
          style={{
            opacity: line.isHighlighted ? 0.8 : 0.4,
            filter: line.isHighlighted ? 'url(#shimmer)' : 'none',
            transition: 'all 0.3s ease',
          }}
        />
      ))}

      {/* Add shimmer animation using CSS */}
      <style>
        {`
          @keyframes shimmer {
            0%, 100% {
              stroke-opacity: 0.2;
            }
            50% {
              stroke-opacity: 0.6;
            }
          }

          svg line {
            animation: shimmer 3s ease-in-out infinite;
          }

          @media (prefers-reduced-motion: reduce) {
            svg line {
              animation: none;
            }
          }
        `}
      </style>
    </svg>
  );
};

export default React.memo(ConstellationLines);
