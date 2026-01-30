import React, { useState, useMemo, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import ConstellationView from '../constellation/ConstellationView';
import PillarOrb from '../constellation/PillarOrb';

// Simplified starfield background
const PreviewStarfield = () => {
  const stars = useMemo(() => {
    return Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 1,
      opacity: Math.random() * 0.5 + 0.2
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {stars.map(star => (
        <div
          key={star.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
            opacity: star.opacity
          }}
        />
      ))}
    </div>
  );
};

// Pentagon connection lines
const PreviewLines = ({ positions }) => {
  if (positions.length < 2) return null;

  const pathD = positions
    .map((pos, i) => `${i === 0 ? 'M' : 'L'} ${pos.x} ${pos.y}`)
    .join(' ') + ' Z';

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none">
      <path
        d={pathD}
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="1"
        strokeDasharray="4,4"
      />
    </svg>
  );
};

// Full-screen modal for expanded constellation
const FullScreenConstellation = ({ isOpen, onClose, pillarsData, questOrbs, badgeOrbs }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-gradient-to-br from-gray-900 to-black"
      >
        <ConstellationView
          pillarsData={pillarsData}
          questOrbs={questOrbs}
          badgeOrbs={badgeOrbs}
          onExit={onClose}
        />
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

const ConstellationPreview = ({
  pillarsData = [],
  questOrbs = [],
  badgeOrbs = [],
  hideHeader = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Update dimensions on mount and resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Calculate star positions in pentagon formation for preview
  const starPositions = useMemo(() => {
    if (!dimensions.width || !dimensions.height) return [];

    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const radius = Math.min(dimensions.width, dimensions.height) * 0.35;

    return pillarsData.map((pillar, index) => {
      const angle = (index * (2 * Math.PI / pillarsData.length)) - (Math.PI / 2);
      return {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        delay: index * 0.1
      };
    });
  }, [pillarsData, dimensions]);

  const totalXp = pillarsData.reduce((sum, p) => sum + (p.xp || 0), 0);

  const handleExpand = () => {
    setIsExpanded(true);
  };

  const handleClose = () => {
    setIsExpanded(false);
  };

  // Empty state when no XP
  if (totalXp === 0) {
    const emptyContent = (
      <div className="bg-gradient-to-br from-gray-900 to-black rounded-2xl overflow-hidden p-6 text-center">
        <div className="py-12">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
            className="text-6xl mb-4"
          >
            ✨
          </motion.div>
          <h3 className="text-xl font-bold text-white mb-2">Your constellation awaits</h3>
          <p className="text-gray-400 text-sm max-w-xs mx-auto">
            Start exploring quests to light up your first stars and watch your learning universe take shape
          </p>
        </div>
      </div>
    );

    if (hideHeader) {
      return emptyContent;
    }

    return (
      <section className="bg-white rounded-2xl shadow-lg overflow-hidden">
        {emptyContent}
      </section>
    );
  }

  const previewContent = (
    <div
      ref={containerRef}
      className="bg-gradient-to-br from-gray-900 to-black rounded-2xl overflow-hidden relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* XP indicator in corner */}
      <div className="absolute top-4 right-4 z-10 text-white/60 text-sm">
        {totalXp.toLocaleString()} XP
      </div>

      {/* Preview Canvas */}
      <div className="h-[400px] relative">
        {/* Starfield background */}
        <PreviewStarfield />

        {/* Pentagon lines */}
        <PreviewLines positions={starPositions} />

        {/* Pillar stars - using actual PillarOrb component */}
        <div style={{ transform: 'scale(0.6)', transformOrigin: 'center center' }}>
          {pillarsData.map((pillar, index) => {
            const pos = starPositions[index] || { x: 0, y: 0 };
            // Adjust position for the scale transform
            const adjustedPos = {
              x: pos.x / 0.6,
              y: pos.y / 0.6
            };
            return (
              <PillarOrb
                key={pillar.id}
                pillar={pillar}
                position={adjustedPos}
                xp={pillar.xp || 0}
                isActive={pillar.isActive}
                index={index}
              />
            );
          })}
        </div>

        {/* Parallax hover effect overlay */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{
            background: isHovered
              ? 'radial-gradient(circle at 50% 50%, rgba(109, 70, 155, 0.1) 0%, transparent 60%)'
              : 'transparent'
          }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Expand Button */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <button
          onClick={handleExpand}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg text-white font-medium transition-all min-h-[44px]"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          Explore Full Constellation
        </button>
      </div>
    </div>
  );

  return (
    <>
      {hideHeader ? (
        previewContent
      ) : (
        <section className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6 text-optio-purple" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Constellation
              </h2>
            </div>
          </div>
          <div className="p-6">
            {previewContent}
          </div>
        </section>
      )}

      {/* Full-screen modal */}
      <FullScreenConstellation
        isOpen={isExpanded}
        onClose={handleClose}
        pillarsData={pillarsData}
        questOrbs={questOrbs}
        badgeOrbs={badgeOrbs}
      />
    </>
  );
};

ConstellationPreview.propTypes = {
  pillarsData: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    xp: PropTypes.number
  })),
  questOrbs: PropTypes.array,
  badgeOrbs: PropTypes.array
};

export default ConstellationPreview;
