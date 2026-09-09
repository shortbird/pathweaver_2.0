/**
 * PillarRadar - SVG radar chart for 5 pillars.
 * Shows XP distribution across STEM, Art, Communication, Civics, Wellness.
 */

import React from 'react';
import { View } from 'react-native';
import Svg, { Polygon, Line, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { pillars as pillarConfig } from '@/src/config/pillars';

// Derived from src/config/pillars, not re-declared (QF-01). The five colours
// were hardcoded here as hex and had already drifted into being reported as
// "off-palette" -- they are the pillar colours, which is exactly what happens
// when a shared list gets a second copy.
//
// Only the LABELS are local, and deliberately: this is a radar chart, so
// "Comm" and "Well" have to fit under a spoke where the config's
// "Communication" and "Wellness" would overlap their neighbours. An
// abbreviation for a cramped axis is a property of this chart, not of the
// pillar.
const RADAR_LABELS: Record<string, string> = {
  communication: 'Comm',
  wellness: 'Well',
};

const PILLARS = ['stem', 'art', 'communication', 'civics', 'wellness'].map((key) => ({
  key,
  label: RADAR_LABELS[key] ?? pillarConfig[key].label,
  color: pillarConfig[key].color,
}));

const LEVELS = 4; // number of concentric rings

interface PillarRadarProps {
  data: { pillar: string; xp: number }[];
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
  const c = useThemeColors();
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
    <View style={{ width: size, height: size, alignSelf: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Grid rings */}
        {rings.map((points, i) => (
          <Polygon
            key={`ring-${i}`}
            points={points}
            fill="none"
            stroke={c.border}
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
            stroke={c.border}
            strokeWidth={1}
          />
        ))}

        {/* Data polygon */}
        <Polygon
          points={dataPolygonPoints}
          fill={`${c.brand}26`}
          stroke={c.brand}
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

      </Svg>

      {/* Axis labels as pillar ICONS (not words) overlaid on the chart
          (bug #22: "use the icons instead of the words for the chart"). SVG
          can't embed an icon font cleanly, so absolutely-position them. */}
      {axes.map((a) => (
        <View
          key={`icon-${a.key}`}
          style={{
            position: 'absolute',
            left: a.labelPos.x - 10,
            top: a.labelPos.y - 10,
            width: 20,
            height: 20,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name={pillarConfig[a.key]?.iconFilled || 'ellipse'}
            size={16}
            color={a.color}
          />
        </View>
      ))}
    </View>
  );
}
