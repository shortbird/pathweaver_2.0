/**
 * OptioBuddy - Animated SVG companion character.
 *
 * Pure presentational component. Takes props, renders SVG with
 * React Native Animated API + react-native-svg. No state management,
 * no side effects, no API calls.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, TouchableOpacity } from 'react-native';
import Svg, {
  G,
  Ellipse,
  Circle,
  Path,
  Line,
} from 'react-native-svg';
import { STAGE_PALETTES, STAGE_SCALES, type FoodReactionType } from './buddyConstants';

const AnimatedG = Animated.createAnimatedComponent(G);

// ── Types ──

interface OptioBuddyProps {
  vitality?: number;
  bond?: number;
  stage?: number;
  onTap?: () => void;
  feedReaction?: FoodReactionType | null;
  tapBurst?: number;
  width?: number;
  height?: number;
}

// ── Mouth sub-component ──

function BuddyMouth({
  cx,
  cy,
  isSleeping,
  isTired,
  isHappy,
  feedReaction,
  scale,
  bond,
}: {
  cx: number;
  cy: number;
  isSleeping: boolean;
  isTired: boolean;
  isHappy: boolean;
  feedReaction: FoodReactionType | null;
  scale: number;
  bond: number;
}) {
  const w = 20 * scale;
  const bondMult = 0.6 + bond * 0.4;

  if (isSleeping) {
    return (
      <Ellipse cx={cx} cy={cy + 2} rx={4 * scale} ry={3 * scale} fill="#2A1A2E" />
    );
  }

  if (feedReaction) {
    return (
      <G>
        <Ellipse cx={cx} cy={cy + 1} rx={10 * scale} ry={8 * scale} fill="#2A1A2E" />
        <Ellipse cx={cx} cy={cy + 5} rx={6 * scale} ry={3 * scale} fill="#FF8FAA" />
      </G>
    );
  }

  if (isHappy) {
    const mouthW = w * 0.7 * bondMult;
    const mouthH = w * 0.4 * bondMult;
    return (
      <G>
        <Path
          d={`M${cx - mouthW} ${cy} L${cx + mouthW} ${cy} Q${cx + mouthW} ${cy + mouthH * 1.4} ${cx} ${cy + mouthH * 1.5} Q${cx - mouthW} ${cy + mouthH * 1.4} ${cx - mouthW} ${cy} Z`}
          fill="#2A1A2E"
        />
        {bond > 0.4 && (
          <Ellipse
            cx={cx}
            cy={cy + mouthH * 1.1}
            rx={mouthW * 0.55}
            ry={mouthH * 0.45}
            fill="#FF8FAA"
          />
        )}
        <Path
          d={`M${cx - mouthW - 1} ${cy} Q${cx} ${cy - 2} ${cx + mouthW + 1} ${cy}`}
          fill="none"
          stroke="#1A1A2E"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </G>
    );
  }

  if (!isTired) {
    const smileDepth = w * 0.2 * bondMult + w * 0.05;
    return (
      <Path
        d={`M${cx - w * 0.45 * bondMult} ${cy} Q${cx} ${cy + smileDepth} ${cx + w * 0.45 * bondMult} ${cy}`}
        fill="none"
        stroke="#1A1A2E"
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    );
  }

  return (
    <Path
      d={`M${cx - w * 0.3} ${cy} Q${cx} ${cy + 1.5} ${cx + w * 0.3} ${cy}`}
      fill="none"
      stroke="#1A1A2E"
      strokeWidth={2}
      strokeLinecap="round"
    />
  );
}

// ── Main character component ──

export default function OptioBuddy({
  vitality = 0.75,
  bond = 0.4,
  stage = 3,
  onTap,
  feedReaction = null,
  tapBurst = 0,
  width = 300,
  height = 260,
}: OptioBuddyProps) {
  const palette = STAGE_PALETTES[stage] || STAGE_PALETTES[1];
  const scale = STAGE_SCALES[stage] || 0.7;
  const isEgg = stage === 0;

  // Derived mood state
  const isSleeping = vitality < 0.15;
  const isTired = vitality < 0.4;
  const isHappy = vitality > 0.6;
  const eyeOpenness = isSleeping ? 0.05 : isTired ? 0.5 : 1;
  const browOffset = isSleeping ? 3 : isTired ? 2 : isHappy ? -2 - bond * 2 : 0;
  const bounceAmplitude = isSleeping ? 1 : isTired ? 2 : 4 + bond * 8;
  const bounceDur = isTired ? 3000 : (2.2 - bond * 0.8) * 1000;
  const armSwingDeg = isSleeping ? 0 : isTired ? 3 : 6 + bond * 12;
  const showCheeks = isHappy && bond > 0.25;
  const cheekOpacity = 0.2 + bond * 0.3;

  // Animated values
  const bounceVal = useRef(new Animated.Value(0)).current;
  const armVal = useRef(new Animated.Value(0)).current;
  const tapScaleVal = useRef(new Animated.Value(1)).current;
  const eggSwayVal = useRef(new Animated.Value(0)).current;

  // Blink state
  const [isBlinking, setIsBlinking] = useState(false);

  // ── Idle bounce loop ──
  useEffect(() => {
    if (isEgg) return;
    bounceVal.setValue(0);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceVal, {
          toValue: 1,
          duration: bounceDur / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(bounceVal, {
          toValue: 0,
          duration: bounceDur / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [bounceDur, isEgg]);

  // ── Arm swing loop ──
  useEffect(() => {
    if (isEgg || armSwingDeg === 0) return;
    armVal.setValue(0);
    const half = bounceDur / 2;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(armVal, {
          toValue: 1,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(armVal, {
          toValue: -1,
          duration: bounceDur,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(armVal, {
          toValue: 0,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [bounceDur, armSwingDeg, isEgg]);

  // ── Egg sway loop ──
  useEffect(() => {
    if (!isEgg) return;
    eggSwayVal.setValue(0);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(eggSwayVal, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(eggSwayVal, {
          toValue: -1,
          duration: 3000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(eggSwayVal, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [isEgg]);

  // ── Blink timer ──
  useEffect(() => {
    if (isSleeping || isEgg) return;
    const interval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
    }, 2500 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, [isSleeping, isEgg]);

  // ── Tap reaction ──
  useEffect(() => {
    if (!tapBurst) return;
    const peak = bond > 0.6 ? 1.15 : bond > 0.3 ? 1.08 : 1.03;
    Animated.sequence([
      Animated.spring(tapScaleVal, {
        toValue: peak,
        friction: 3,
        tension: 200,
        useNativeDriver: false,
      }),
      Animated.spring(tapScaleVal, {
        toValue: 1,
        friction: 5,
        tension: 100,
        useNativeDriver: false,
      }),
    ]).start();
  }, [tapBurst]);

  // ── Feed reaction ──
  useEffect(() => {
    if (!feedReaction) return;
    Animated.sequence([
      Animated.timing(tapScaleVal, {
        toValue: 1.12,
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(tapScaleVal, {
        toValue: 0.9,
        duration: 150,
        useNativeDriver: false,
      }),
      Animated.timing(tapScaleVal, {
        toValue: 1.05,
        duration: 150,
        useNativeDriver: false,
      }),
      Animated.timing(tapScaleVal, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  }, [feedReaction]);

  // ── Interpolations ──
  const bounceY = bounceVal.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -bounceAmplitude],
  });

  const armRotL = armVal.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-armSwingDeg, 0, armSwingDeg],
  });

  const armRotR = armVal.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [armSwingDeg, 0, -armSwingDeg],
  });

  const eggRotation = eggSwayVal.interpolate({
    inputRange: [-1, 1],
    outputRange: [-1.5, 1.5],
  });

  const eggY = eggSwayVal.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [0, -3, 0],
  });

  const currentEyeRy = isBlinking ? 13 * scale * 0.05 : 13 * scale * eyeOpenness;

  // Body geometry
  const bodyRx = 65 * scale;
  const bodyRy = 60 * scale;
  const bodyCy = 258;
  const armRxSize = 11 * scale;
  const armRySize = 13 * scale;
  const armLx = 200 - bodyRx + armRxSize * 0.3;
  const armRxPos = 200 + bodyRx - armRxSize * 0.3;
  const armCy = bodyCy + 8;

  // ── Egg render ──
  if (isEgg) {
    return (
      <TouchableOpacity onPress={onTap} activeOpacity={0.8}>
        <Svg viewBox="0 185 400 150" width={width} height={height}>
          {/* Shadow */}
          <Ellipse cx={200} cy={310} rx={40} ry={8} fill="black" opacity={0.08} />
          {/* Egg group with sway */}
          <AnimatedG rotation={eggRotation} originX={200} originY={270} y={eggY}>
            <Ellipse cx={200} cy={255} rx={48} ry={58} fill="#F1EFE8" />
            <Ellipse
              cx={200}
              cy={255}
              rx={48}
              ry={58}
              fill="none"
              stroke="#D3D1C7"
              strokeWidth={2}
            />
            {/* Inner glow */}
            <Ellipse cx={200} cy={260} rx={25} ry={30} fill={palette.glow} opacity={0.1} />
            {/* Crack hint */}
            <Path
              d="M188 240 L192 248 L186 254"
              fill="none"
              stroke="#C8C6BD"
              strokeWidth={1.5}
              strokeLinecap="round"
              opacity={0.4}
            />
          </AnimatedG>
        </Svg>
      </TouchableOpacity>
    );
  }

  // ── Buddy render ──
  return (
    <TouchableOpacity onPress={onTap} activeOpacity={0.9}>
      <Svg viewBox="0 185 400 150" width={width} height={height}>
        {/* Shadow */}
        <Ellipse cx={200} cy={320} rx={50 * scale} ry={10} fill="black" opacity={0.1} />

        {/* Bounce group */}
        <AnimatedG y={bounceY}>
          {/* Scale group for tap/feed reactions */}
          <AnimatedG scale={tapScaleVal} originX={200} originY={bodyCy}>
            {/* Back arm */}
            <AnimatedG rotation={armRotL} originX={armLx} originY={armCy}>
              <Ellipse
                cx={armLx}
                cy={armCy}
                rx={armRxSize}
                ry={armRySize}
                fill={palette.body}
                opacity={0.85}
              />
            </AnimatedG>

            {/* Body */}
            <Ellipse cx={200} cy={bodyCy} rx={bodyRx} ry={bodyRy} fill={palette.body} />
            {/* Belly */}
            <Ellipse
              cx={200}
              cy={268}
              rx={40 * scale}
              ry={35 * scale}
              fill={palette.belly}
              opacity={0.6}
            />
            {/* Body highlight */}
            <Ellipse
              cx={183}
              cy={235}
              rx={18 * scale}
              ry={12 * scale}
              fill="white"
              opacity={0.15}
            />

            {/* Front arm */}
            <AnimatedG rotation={armRotR} originX={armRxPos} originY={armCy}>
              <Ellipse
                cx={armRxPos}
                cy={armCy}
                rx={armRxSize}
                ry={armRySize}
                fill={palette.body}
                opacity={0.85}
              />
            </AnimatedG>

            {/* Cheeks */}
            {showCheeks && (
              <G>
                <Ellipse
                  cx={172}
                  cy={256}
                  rx={9 * scale}
                  ry={6 * scale}
                  fill={palette.cheek}
                  opacity={cheekOpacity}
                />
                <Ellipse
                  cx={228}
                  cy={256}
                  rx={9 * scale}
                  ry={6 * scale}
                  fill={palette.cheek}
                  opacity={cheekOpacity}
                />
              </G>
            )}

            {/* ── Face ── */}

            {/* Eyebrows */}
            <Line
              x1={178}
              y1={233 + browOffset}
              x2={188}
              y2={231 + browOffset}
              stroke={palette.body}
              strokeWidth={2.5}
              strokeLinecap="round"
              opacity={0.65}
            />
            <Line
              x1={212}
              y1={231 + browOffset}
              x2={222}
              y2={233 + browOffset}
              stroke={palette.body}
              strokeWidth={2.5}
              strokeLinecap="round"
              opacity={0.65}
            />

            {/* Left eye */}
            <Ellipse cx={184} cy={245} rx={11 * scale} ry={currentEyeRy} fill="white" />
            {currentEyeRy > 13 * scale * 0.2 && (
              <G>
                <Ellipse
                  cx={185}
                  cy={246}
                  rx={6 * scale}
                  ry={Math.min(6 * scale, currentEyeRy * 0.5)}
                  fill="#1A1A2E"
                />
                {currentEyeRy > 13 * scale * 0.4 && (
                  <Circle cx={187} cy={242} r={2.5 * scale} fill="white" />
                )}
              </G>
            )}

            {/* Right eye */}
            <Ellipse cx={216} cy={245} rx={11 * scale} ry={currentEyeRy} fill="white" />
            {currentEyeRy > 13 * scale * 0.2 && (
              <G>
                <Ellipse
                  cx={217}
                  cy={246}
                  rx={6 * scale}
                  ry={Math.min(6 * scale, currentEyeRy * 0.5)}
                  fill="#1A1A2E"
                />
                {currentEyeRy > 13 * scale * 0.4 && (
                  <Circle cx={219} cy={242} r={2.5 * scale} fill="white" />
                )}
              </G>
            )}

            {/* Mouth */}
            <BuddyMouth
              cx={200}
              cy={262}
              isSleeping={isSleeping}
              isTired={isTired}
              isHappy={isHappy}
              feedReaction={feedReaction}
              scale={scale}
              bond={bond}
            />

            {/* Stage 5+ sparkles (static for now) */}
            {stage >= 5 && (
              <G>
                <G opacity={0.6}>
                  <Line x1={157} y1={220} x2={163} y2={220} stroke="#FFF" strokeWidth={1.5} strokeLinecap="round" />
                  <Line x1={160} y1={217} x2={160} y2={223} stroke="#FFF" strokeWidth={1.5} strokeLinecap="round" />
                </G>
                <G opacity={0.4}>
                  <Line x1={237} y1={225} x2={243} y2={225} stroke="#FFF" strokeWidth={1.5} strokeLinecap="round" />
                  <Line x1={240} y1={222} x2={240} y2={228} stroke="#FFF" strokeWidth={1.5} strokeLinecap="round" />
                </G>
              </G>
            )}

            {/* Legend glow */}
            {stage >= 6 && (
              <Ellipse
                cx={200}
                cy={255}
                rx={75 * scale}
                ry={70 * scale}
                fill={palette.glow}
                opacity={0.08}
              />
            )}
          </AnimatedG>
        </AnimatedG>
      </Svg>
    </TouchableOpacity>
  );
}
