import React from 'react';

const QuestPillarLines = ({ questOrbs, pillarPositions }) => {
  if (!questOrbs || !pillarPositions) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 3 }}
    >
      {questOrbs.map((quest) => {
        // Draw lines from quest to each contributing pillar
        return Object.entries(quest.xpDistribution).map(([pillarId, xp]) => {
          const pillarPos = pillarPositions[pillarId];
          if (!pillarPos) return null;

          // Calculate opacity based on XP contribution percentage
          const percentage = xp / quest.totalXP;
          const opacity = Math.max(0.1, percentage * 0.5); // 10-50% opacity

          // Pillar colors for line gradient (NEW simplified system - January 2025)
          const pillarColors = {
            'stem': '#3b82f6',           // Blue
            'civics': '#a855f7',         // Purple
            'art': '#EF597B',            // Pink
            'communication': '#f59e0b',  // Orange
            'wellness': '#10b981'        // Green
          };

          const color = pillarColors[pillarId] || '#ffffff';

          return (
            <line
              key={`${quest.id}-${pillarId}`}
              x1={quest.position.x}
              y1={quest.position.y}
              x2={pillarPos.x}
              y2={pillarPos.y}
              stroke={color}
              strokeWidth={1}
              strokeOpacity={opacity}
              strokeDasharray="2,3"
              style={{
                filter: `drop-shadow(0 0 2px ${color}40)`,
              }}
            />
          );
        });
      })}
    </svg>
  );
};

export default React.memo(QuestPillarLines);
