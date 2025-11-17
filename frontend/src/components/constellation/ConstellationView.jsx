import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import PillarOrb from './PillarOrb';
import QuestOrb from './QuestOrb';
import StarField from './StarField';
import ConstellationLines from './ConstellationLines';
import QuestPillarLines from './QuestPillarLines';
import ParticleTrail from './ParticleTrail';
import PillarInfoCard from './PillarInfoCard';
import QuestTooltip from './QuestTooltip';
import ConstellationExit from './ConstellationExit';
import TimeTravelSlider from './TimeTravelSlider';
import ZoomPanControls from './ZoomPanControls';

const ConstellationView = ({ pillarsData, questOrbs, badgeOrbs = [], onExit }) => {
  const navigate = useNavigate();
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [hoveredPillar, setHoveredPillar] = useState(null);
  const [hoveredPosition, setHoveredPosition] = useState(null);
  const [hoveredQuest, setHoveredQuest] = useState(null);
  const [hoveredQuestPosition, setHoveredQuestPosition] = useState(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [showTimeTravel, setShowTimeTravel] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

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

  // Create pillar positions map for quest positioning
  const pillarPositions = {};
  stars.forEach(star => {
    pillarPositions[star.id] = star.position;
  });

  // Calculate gravitational position for quest orbs with collision detection
  const calculateQuestPosition = useCallback((quest, pillarPositions, existingOrbs = []) => {
    const MIN_DISTANCE_FROM_PILLAR = 80; // Minimum 80px from any pillar
    const MIN_DISTANCE_BETWEEN_ORBS = 25; // Minimum 25px between quest orbs
    let x = 0, y = 0;
    let totalWeight = 0;

    // Weighted average based on XP distribution
    Object.entries(quest.xpDistribution).forEach(([pillarId, xp]) => {
      const pillarPos = pillarPositions[pillarId];
      if (pillarPos) {
        const weight = xp / quest.totalXP;
        x += pillarPos.x * weight;
        y += pillarPos.y * weight;
        totalWeight += weight;
      }
    });

    // Fallback: If no valid pillar positions found, place at center
    if (totalWeight === 0) {
      x = dimensions.width / 2;
      y = dimensions.height / 2;
      totalWeight = 1;
    }

    // Add deterministic orbit offset based on quest ID
    const hash = quest.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    let orbitRadius = 30 + (hash % 40); // 30-70px orbit
    let angle = (hash % 360) * (Math.PI / 180);

    let finalX = x + Math.cos(angle) * orbitRadius;
    let finalY = y + Math.sin(angle) * orbitRadius;

    // Check distance from all pillars and other quest orbs, push away if too close
    let attempts = 0;
    const maxAttempts = 30; // Increased attempts for collision resolution
    while (attempts < maxAttempts) {
      let tooClose = false;

      // Check distance from pillars
      for (const pillarPos of Object.values(pillarPositions)) {
        const dx = finalX - pillarPos.x;
        const dy = finalY - pillarPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < MIN_DISTANCE_FROM_PILLAR) {
          // Push away from pillar
          const pushAngle = Math.atan2(dy, dx);
          const pushDistance = MIN_DISTANCE_FROM_PILLAR - distance;
          finalX += Math.cos(pushAngle) * pushDistance;
          finalY += Math.sin(pushAngle) * pushDistance;
          tooClose = true;
        }
      }

      // Check distance from other quest orbs
      for (const existingOrb of existingOrbs) {
        const dx = finalX - existingOrb.x;
        const dy = finalY - existingOrb.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < MIN_DISTANCE_BETWEEN_ORBS) {
          // Push away from other orb with slight randomization to prevent clustering
          const pushAngle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.3;
          const pushDistance = MIN_DISTANCE_BETWEEN_ORBS - distance;
          finalX += Math.cos(pushAngle) * pushDistance;
          finalY += Math.sin(pushAngle) * pushDistance;
          tooClose = true;
        }
      }

      if (!tooClose) break;
      attempts++;
    }

    return { x: finalX, y: finalY };
  }, [dimensions]);

  // Calculate time range from quest data
  const { minTime, maxTime } = useMemo(() => {
    if (!questOrbs || questOrbs.length === 0) {
      const now = Date.now();
      return { minTime: now - 365 * 24 * 60 * 60 * 1000, maxTime: now }; // Default to 1 year range
    }

    const timestamps = questOrbs.map(q => {
      const timestamp = q.completedAt || q.startedAt;
      return timestamp ? new Date(timestamp).getTime() : Date.now();
    });

    return {
      minTime: Math.min(...timestamps),
      maxTime: Date.now()
    };
  }, [questOrbs]);

  // Initialize currentTime to maxTime (show all quests by default, "Now" view)
  const [currentTime, setCurrentTime] = useState(maxTime);

  // Update currentTime when maxTime changes (when data loads)
  useEffect(() => {
    if (maxTime) {
      setCurrentTime(maxTime);
    }
  }, [maxTime]);

  // Filter quests based on current time
  const filteredQuestOrbs = useMemo(() => {
    return (questOrbs || []).filter(quest => {
      const questTime = quest.completedAt || quest.startedAt;
      if (!questTime) return true;
      const timestamp = new Date(questTime).getTime();
      return timestamp <= currentTime;
    });
  }, [questOrbs, currentTime]);

  // Prepare quest orbs with positions (with collision detection)
  const questOrbsWithPositions = useMemo(() => {
    const orbsWithPositions = [];
    const existingPositions = [];

    filteredQuestOrbs.forEach((quest, index) => {
      // Calculate position, avoiding collisions with already-placed orbs
      const position = calculateQuestPosition(quest, pillarPositions, existingPositions);

      const orbWithPosition = {
        ...quest,
        position,
        index
      };

      orbsWithPositions.push(orbWithPosition);
      existingPositions.push(position); // Track this position for next orb
    });

    return orbsWithPositions;
  }, [filteredQuestOrbs, pillarPositions, calculateQuestPosition]);

  // Handle orb hover - clear quest hover when entering pillar
  const handleOrbHover = (pillar, position) => {
    setHoveredQuest(null);
    setHoveredQuestPosition(null);
    setHoveredPillar(pillar);
    setHoveredPosition(position);
  };

  const handleOrbLeave = () => {
    setHoveredPillar(null);
    setHoveredPosition(null);
  };

  const handleQuestHover = (quest, position) => {
    setHoveredPillar(null);
    setHoveredPosition(null);
    setHoveredQuest(quest);
    setHoveredQuestPosition(position);
  };

  const handleQuestLeave = () => {
    setHoveredQuest(null);
    setHoveredQuestPosition(null);
  };

  const handleQuestClick = (quest) => {
    // Don't navigate - just show the tooltip (already visible on hover)
    // Future: could open a detailed modal here
  };

  // Handle star click - don't navigate, info shown in hover card
  const handleStarClick = (pillar) => {
    // Don't navigate - info shown in hover card
    // Future: could open a detailed modal here
  };

  // Handle time travel
  const handleTimeChange = useCallback((newTime) => {
    setCurrentTime(newTime);
  }, []);

  const handleToggleTimeTravel = useCallback(() => {
    setShowTimeTravel(prev => !prev);
  }, []);

  // Zoom and pan handlers
  const handleZoomChange = useCallback((newZoom) => {
    setZoom(newZoom);
  }, []);

  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.button === 0 && e.shiftKey) { // Shift + Left click for panning
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e) => {
    // Update mouse position for parallax effect
    setMousePos({ x: e.clientX, y: e.clientY });

    // Handle panning
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(prev => Math.max(0.5, Math.min(3, prev + delta)));
    }
  }, []);

  // Calculate parallax offset based on mouse position
  const parallaxOffset = useMemo(() => {
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const offsetX = (mousePos.x - centerX) / centerX; // -1 to 1
    const offsetY = (mousePos.y - centerY) / centerY; // -1 to 1

    return {
      // Barely noticeable parallax effect
      background: { x: offsetX * 0.5, y: offsetY * 0.5 },  // Extremely subtle
      lines: { x: offsetX * 0.25, y: offsetY * 0.25 },     // Almost imperceptible
      orbs: { x: offsetX * 0.1, y: offsetY * 0.1 }         // Practically none
    };
  }, [mousePos, dimensions]);

  // Add mouse event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

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
      ref={containerRef}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 z-[9999] overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0f0c29 0%, #1a1042 25%, #302b63 50%, #24243e 100%)',
        cursor: isPanning ? 'grabbing' : 'default'
      }}
      role="region"
      aria-label="Learning Constellation Visualization"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Zoomable/Pannable Container */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: isPanning ? 'none' : 'transform 0.2s ease-out',
          width: '100%',
          height: '100%',
          position: 'relative'
        }}
      >
      {/* Background Starfield - Static */}
      <StarField starCount={200} />

      {/* Constellation Lines */}
      <ConstellationLines stars={stars} hoveredStar={hoveredPillar} />

      {/* Quest-to-Pillar Connecting Lines */}
      <QuestPillarLines questOrbs={questOrbsWithPositions} pillarPositions={pillarPositions} />

      {/* Particle Trails */}
      <ParticleTrail questOrbs={questOrbsWithPositions} pillarPositions={pillarPositions} />

      {/* Quest Orbs - Render first so they're behind pillars */}
      {questOrbsWithPositions.map((quest) => (
        <QuestOrb
          key={quest.id}
          quest={quest}
          position={quest.position}
          pillarPositions={pillarPositions}
          onHover={handleQuestHover}
          onLeave={handleQuestLeave}
          onClick={handleQuestClick}
          index={quest.index}
        />
      ))}

      {/* Pillar Orbs */}
      {stars.map((pillar, index) => (
        <PillarOrb
          key={pillar.id}
          pillar={pillar}
          position={pillar.position}
          xp={pillar.xp}
          isActive={pillar.isActive}
          onHover={handleOrbHover}
          onLeave={handleOrbLeave}
          onClick={handleStarClick}
          index={index}
        />
      ))}

      {/* Pillar Info Card on Hover */}
      <AnimatePresence>
        {hoveredPillar && hoveredPosition && (
          <PillarInfoCard
            pillar={hoveredPillar}
            position={hoveredPosition}
            containerDimensions={dimensions}
          />
        )}
      </AnimatePresence>

      {/* Quest Tooltip on Hover */}
      <AnimatePresence>
        {hoveredQuest && hoveredQuestPosition && (
          <QuestTooltip
            quest={hoveredQuest}
            position={hoveredQuestPosition}
            containerDimensions={dimensions}
          />
        )}
      </AnimatePresence>
      </div>

      {/* UI Controls (outside zoomable container) */}
      {/* Exit Button */}
      <ConstellationExit onExit={onExit} />

      {/* Zoom and Pan Controls */}
      <ZoomPanControls
        zoom={zoom}
        onZoomChange={handleZoomChange}
        onResetView={handleResetView}
        showTimeTravel={showTimeTravel}
        onToggleTimeTravel={handleToggleTimeTravel}
        hasMultipleQuests={(questOrbs && questOrbs.length > 1)}
      />

      {/* Time Travel Slider */}
      {showTimeTravel && questOrbs && questOrbs.length > 0 && (
        <TimeTravelSlider
          currentTime={currentTime}
          minTime={minTime}
          maxTime={maxTime}
          onTimeChange={handleTimeChange}
        />
      )}

      {/* Screen Reader Instructions */}
      <div className="sr-only">
        <p>
          Use Tab or Arrow keys to navigate between learning pillars.
          Press Enter or Space to explore quests for the selected pillar.
          Use the Time Travel button in the controls panel to view your constellation over time.
          Hold Shift and drag to pan. Use Ctrl/Cmd + scroll to zoom.
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
