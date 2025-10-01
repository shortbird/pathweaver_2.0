import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import PillarStar from './PillarStar';
import StarField from './StarField';
import ConstellationLines from './ConstellationLines';
import PillarInfoCard from './PillarInfoCard';
import ConstellationExit from './ConstellationExit';

const ConstellationView = ({ pillarsData, onExit }) => {
  const navigate = useNavigate();
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [hoveredPillar, setHoveredPillar] = useState(null);
  const [hoveredPosition, setHoveredPosition] = useState(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Update dimensions on resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Calculate star positions in pentagon formation
  const getStarPosition = useCallback((index, total) => {
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    // Responsive radius based on viewport
    const baseRadius = Math.min(dimensions.width, dimensions.height) * 0.3;
    const radius = Math.max(150, Math.min(baseRadius, 400));

    // Pentagon formation, starting from top
    const angle = (index * (2 * Math.PI / total)) - (Math.PI / 2);

    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  }, [dimensions]);

  // Prepare stars data with positions
  const stars = pillarsData.map((pillar, index) => ({
    ...pillar,
    position: getStarPosition(index, pillarsData.length),
  }));

  // Handle star hover
  const handleStarHover = (pillar, position) => {
    setHoveredPillar(pillar);
    setHoveredPosition(position);
  };

  const handleStarLeave = () => {
    setHoveredPillar(null);
    setHoveredPosition(null);
  };

  // Handle star click - navigate to quests filtered by pillar
  const handleStarClick = (pillar) => {
    navigate(`/quests?pillar=${pillar.id}`);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      switch (e.key) {
        case 'Escape':
          onExit?.();
          break;
        case 'Tab':
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % pillarsData.length);
          break;
        case 'ArrowRight':
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % pillarsData.length);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setFocusedIndex((prev) => (prev - 1 + pillarsData.length) % pillarsData.length);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          handleStarClick(pillarsData[focusedIndex]);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedIndex, pillarsData, onExit]);

  // Container animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 0.8, ease: 'easeOut' },
    },
    exit: {
      opacity: 0,
      transition: { duration: 0.4, ease: 'easeIn' },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 z-[9999] overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0f0c29 0%, #1a1042 25%, #302b63 50%, #24243e 100%)',
      }}
      role="region"
      aria-label="Learning Constellation Visualization"
    >
      {/* Background Starfield */}
      <StarField starCount={200} />

      {/* Constellation Lines */}
      <ConstellationLines stars={stars} hoveredStar={hoveredPillar} />

      {/* Pillar Stars */}
      {stars.map((pillar, index) => (
        <PillarStar
          key={pillar.id}
          pillar={pillar}
          position={pillar.position}
          xp={pillar.xp}
          isActive={pillar.isActive}
          onHover={handleStarHover}
          onLeave={handleStarLeave}
          onClick={handleStarClick}
          index={index}
        />
      ))}

      {/* Info Card on Hover */}
      <AnimatePresence>
        {hoveredPillar && hoveredPosition && (
          <PillarInfoCard
            pillar={hoveredPillar}
            position={hoveredPosition}
            containerDimensions={dimensions}
            onClose={handleStarLeave}
          />
        )}
      </AnimatePresence>

      {/* Exit Button */}
      <ConstellationExit onExit={onExit} />

      {/* Screen Reader Instructions */}
      <div className="sr-only">
        <p>
          Use Tab or Arrow keys to navigate between learning pillars.
          Press Enter or Space to explore quests for the selected pillar.
          Press Escape to exit the constellation view.
        </p>
      </div>

      {/* Reduced Motion Styles */}
      <style>
        {`
          .constellation-star {
            will-change: transform, opacity;
            transform: translateZ(0);
          }

          @media (prefers-reduced-motion: reduce) {
            .constellation-star,
            .constellation-star * {
              animation: none !important;
              transition: none !important;
            }
          }

          /* GPU acceleration for smooth performance */
          .constellation-star,
          svg line {
            backface-visibility: hidden;
            perspective: 1000px;
          }
        `}
      </style>
    </motion.div>
  );
};

export default React.memo(ConstellationView);
