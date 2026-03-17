/**
 * MountainChevron - SVG chevron/mountain shape inspired by the Optio logo.
 *
 * Renders an upward-pointing chevron with a purple-to-pink gradient fill.
 * Multiple instances at different sizes/rotations create branded depth.
 */

import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Path } from 'react-native-svg';

interface MountainChevronProps {
  size: number;
  colors: [string, string];
  rotation?: number;
  opacity?: number;
  x?: number;
  y?: number;
}

export function MountainChevron({
  size,
  colors,
  rotation = 0,
  opacity = 1,
  x = 0,
  y = 0,
}: MountainChevronProps) {
  // Chevron path: an upward-pointing open chevron (mountain peak silhouette)
  // Drawn in a 100x100 viewBox, scaled by `size`
  const chevronPath =
    'M5,85 L50,15 L95,85 L80,85 L50,30 L20,85 Z';

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        opacity,
        transform: [{ rotate: `${rotation}deg` }],
      }}
    >
      <Defs>
        <LinearGradient id={`chevGrad-${rotation}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors[0]} />
          <Stop offset="1" stopColor={colors[1]} />
        </LinearGradient>
      </Defs>
      <Path d={chevronPath} fill={`url(#chevGrad-${rotation})`} />
    </Svg>
  );
}
