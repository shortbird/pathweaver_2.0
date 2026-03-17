/**
 * FlowWaves - Gentle sine-curve wave lines crossing the screen diagonally.
 *
 * Renders 3 wave paths with varying stroke width and opacity, representing
 * the flow and momentum of the learning journey.
 */

import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Path } from 'react-native-svg';

interface FlowWavesProps {
  width: number;
  height: number;
  waveColors: [string, string][];
  opacity?: number;
  x?: number;
  y?: number;
}

function buildWavePath(
  width: number,
  height: number,
  yOffset: number,
  amplitude: number,
): string {
  // Diagonal sine wave from left to right with gentle curves
  const midY = height * yOffset;
  const cp1x = width * 0.25;
  const cp1y = midY - amplitude;
  const cp2x = width * 0.75;
  const cp2y = midY + amplitude;

  return `M0,${midY} C${cp1x},${cp1y} ${cp2x},${cp2y} ${width},${midY}`;
}

export function FlowWaves({
  width,
  height,
  waveColors,
  opacity = 1,
  x = 0,
  y = 0,
}: FlowWavesProps) {
  const waves = [
    { yOffset: 0.35, amplitude: height * 0.12, strokeWidth: 3, waveOpacity: 0.5 },
    { yOffset: 0.5, amplitude: height * 0.15, strokeWidth: 4.5, waveOpacity: 0.8 },
    { yOffset: 0.65, amplitude: height * 0.1, strokeWidth: 2.5, waveOpacity: 0.4 },
  ];

  return (
    <Svg
      width={width}
      height={height}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        opacity,
      }}
    >
      <Defs>
        {waveColors.map((colors, i) => (
          <LinearGradient key={i} id={`waveGrad-${i}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors[0]} />
            <Stop offset="1" stopColor={colors[1]} />
          </LinearGradient>
        ))}
      </Defs>
      {waves.map((wave, i) => (
        <Path
          key={i}
          d={buildWavePath(width, height, wave.yOffset, wave.amplitude)}
          stroke={`url(#waveGrad-${i})`}
          strokeWidth={wave.strokeWidth}
          fill="none"
          opacity={wave.waveOpacity}
          strokeLinecap="round"
        />
      ))}
    </Svg>
  );
}
