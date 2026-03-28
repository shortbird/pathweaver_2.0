/**
 * PillarRadar - SVG radar chart for 5 pillars.
 * Shows XP distribution across STEM, Art, Communication, Civics, Wellness.
 */

import React from 'react';
import { View } from 'react-native';
import Svg, { Polygon, Line, Circle, Text as SvgText } from 'react-native-svg';

const PILLARS = [
  { key: 'stem', label: 'STEM', color: '#2469D1' },
  { key: 'art', label: 'Art', color: '#AF56E5' },
  { key: 'communication', label: 'Comm', color: '#3DA24A' },
  { key: 'civics', label: 'Civics', color: '#FF9028' },
  { key: 'wellness', label: 'Well', color: '#E65C5C' },
];

const LEVELS = 4; // number of concentric rings

interface PillarRadarProps {
  data: Array<{ pillar: string; xp: number }>;
  size?: number;
}

function polarToCartesian(angle: number, radius: number, cx: number, cy: number) {
  // Start from top (subtract 90 degrees)
  const rad = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

export function PillarRadar({ data, size = 240 }: PillarRadarProps) {
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size / 2 - 30; // leave room for labels

  // Find max XP for normalization
  const xpMap: Record<string, number> = {};
  for (const d of data) {
    xpMap[d.pillar] = d.xp;
  }
  const maxXP = Math.max(...Object.values(xpMap), 1);

  // Reorder pillars so non-zero values are adjacent, preventing disconnected spikes
  const orderedPillars = (() => {
    const withXP = PILLARS.filter((p) => (xpMap[p.key] || 0) > 0);
    const withoutXP = PILLARS.filter((p) => (xpMap[p.key] || 0) === 0);
    return [...withXP, ...withoutXP];
  })();
  const orderedAngleStep = 360 / orderedPillars.length;

  // Build data polygon points
  const dataPoints = orderedPillars.map((p, i) => {
    const angle = i * orderedAngleStep;
    const value = xpMap[p.key] || 0;
    const normalizedRadius = (value / maxXP) * maxRadius;
    return polarToCartesian(angle, normalizedRadius, cx, cy);
  });
  const dataPolygonPoints = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  // Build grid rings
  const rings = Array.from({ length: LEVELS }, (_, i) => {
    const r = ((i + 1) / LEVELS) * maxRadius;
    const points = orderedPillars.map((_, j) => {
      const angle = j * orderedAngleStep;
      return polarToCartesian(angle, r, cx, cy);
    });
    return points.map((p) => `${p.x},${p.y}`).join(' ');
  });

  // Axis endpoints + labels
  const axes = orderedPillars.map((p, i) => {
    const angle = i * orderedAngleStep;
    const end = polarToCartesian(angle, maxRadius, cx, cy);
    const labelPos = polarToCartesian(angle, maxRadius + 18, cx, cy);
    return { ...p, end, labelPos };
  });

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {/* Grid rings */}
        {rings.map((points, i) => (
          <Polygon
            key={`ring-${i}`}
            points={points}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth={1}
          />
        ))}

        {/* Axis lines */}
        {axes.map((a) => (
          <Line
            key={`axis-${a.key}`}
            x1={cx}
            y1={cy}
            x2={a.end.x}
            y2={a.end.y}
            stroke="#E5E7EB"
            strokeWidth={1}
          />
        ))}

        {/* Data polygon */}
        <Polygon
          points={dataPolygonPoints}
          fill="rgba(109, 70, 155, 0.15)"
          stroke="#6D469B"
          strokeWidth={2}
        />

        {/* Data points */}
        {dataPoints.map((p, i) => (
          <Circle
            key={`point-${i}`}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={orderedPillars[i].color}
            stroke="white"
            strokeWidth={2}
          />
        ))}

        {/* Labels */}
        {axes.map((a) => (
          <SvgText
            key={`label-${a.key}`}
            x={a.labelPos.x}
            y={a.labelPos.y}
            fontSize={11}
            fontFamily="Poppins_500Medium"
            fill="#6B7280"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            {a.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}
