/**
 * GrowthRings - Concentric ring outlines representing growth and progress.
 *
 * Renders 3 concentric circles with gradient strokes and decreasing opacity.
 * Positioned partially offscreen to create an organic, cropped effect.
 */

import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';

interface GrowthRingsProps {
  size: number;
  colors: [string, string];
  opacity?: number;
  x?: number;
  y?: number;
}

export function GrowthRings({
  size,
  colors,
  opacity = 1,
  x = 0,
  y = 0,
}: GrowthRingsProps) {
  const center = size / 2;
  const rings = [
    { radius: size * 0.2, strokeWidth: size * 0.018, ringOpacity: 1 },
    { radius: size * 0.32, strokeWidth: size * 0.012, ringOpacity: 0.6 },
    { radius: size * 0.44, strokeWidth: size * 0.008, ringOpacity: 0.3 },
  ];

  return (
    <Svg
      width={size}
      height={size}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        opacity,
      }}
    >
      <Defs>
        <LinearGradient id="ringsGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors[0]} />
          <Stop offset="1" stopColor={colors[1]} />
        </LinearGradient>
      </Defs>
      {rings.map((ring, i) => (
        <Circle
          key={i}
          cx={center}
          cy={center}
          r={ring.radius}
          stroke="url(#ringsGrad)"
          strokeWidth={ring.strokeWidth}
          fill="none"
          opacity={ring.ringOpacity}
        />
      ))}
    </Svg>
  );
}
