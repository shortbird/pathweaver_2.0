# Optio Buddy — Implementation Guide

This document contains everything needed to integrate the Optio Buddy animated virtual companion into the Optio React Native / React mobile app. It is intended to be read and executed by a developer or AI coding assistant.

## Overview

Optio Buddy is an SVG-based animated character rendered entirely in React with Framer Motion. There are no external animation files, no Rive, no Lottie. The character is a blob puffball that bounces, blinks, eats, sleeps, and reacts to taps. Its appearance and behavior are driven by two numeric props (`vitality` and `bond`), a stage integer, and event callbacks.

## Architecture

The system is split into three layers:

1. **OptioBuddy** — Pure presentational component. Takes props, renders SVG. No state management, no side effects, no API calls. This is the character.
2. **OptioBuddyScreen** — Screen-level wrapper that connects the buddy to app state (Supabase, context, etc.), handles decay calculations, manages the store UI, and passes props down.
3. **App state** — The buddy record in your database. Vitality, bond, stage, name, food journal, equipped accessories, wallet balance.

This document provides the complete code for layer 1 and a skeleton for layer 2. Layer 3 depends on your existing Supabase schema.

---

## Dependencies

Add these if not already in your project:

```bash
npm install framer-motion
```

Framer Motion works in React Native via `framer-motion` for web-based React Native (Expo web) or you may need `moti` + `react-native-reanimated` for pure native. If your app uses React Native with a WebView or Expo web target, Framer Motion works directly. If you need pure native animations, the SVG structure stays the same but the animation layer would swap to `react-native-reanimated` — the component API is nearly identical.

For SVG rendering in React Native, you need:

```bash
npm install react-native-svg
```

If targeting web (React, Next.js, Expo web), native SVG elements work directly with no extra dependency.

---

## File Structure

Create these files in your project:

```
src/
  components/
    buddy/
      OptioBuddy.jsx          — The character component (provided below, complete)
      OptioBuddyScreen.jsx    — Screen wrapper (skeleton provided below)
      buddyConstants.js        — Palettes, scales, food catalog
      useBuddyState.js         — Hook for decay, feeding, tapping logic
```

---

## File 1: buddyConstants.js

```javascript
// ── Stage color palettes ──
// Each stage has a unique color scheme. body is the main fill,
// belly is the lighter highlight, cheek is the blush color.
export const STAGE_PALETTES = [
  { body: "#B4B2A9", belly: "#D3D1C7", cheek: "#C8C6BD", name: "Egg",       glow: "#B4B2A9" },
  { body: "#5DCAA5", belly: "#9FE1CB", cheek: "#FF9EBA", name: "Hatchling", glow: "#5DCAA5" },
  { body: "#85B7EB", belly: "#B5D4F4", cheek: "#FF9EBA", name: "Sprout",    glow: "#85B7EB" },
  { body: "#AFA9EC", belly: "#CECBF6", cheek: "#FF9EBA", name: "Buddy",     glow: "#AFA9EC" },
  { body: "#ED93B1", belly: "#F4C0D1", cheek: "#FFBD5A", name: "Pal",       glow: "#ED93B1" },
  { body: "#EF9F27", belly: "#FAC775", cheek: "#FF6B8A", name: "Champion",  glow: "#EF9F27" },
  { body: "#E24B4A", belly: "#F09595", cheek: "#FFBD5A", name: "Legend",    glow: "#E24B4A" },
];

// ── Size multiplier per stage ──
// The buddy's body dimensions are multiplied by this value.
// Egg is smallest, Legend is largest.
export const STAGE_SCALES = [0.5, 0.55, 0.65, 0.8, 0.92, 1.0, 1.1];

// ── Food reaction types ──
// Each food item maps to a reaction type that determines the eating animation.
// type must be one of: "crunch", "sweet", "spicy", "soupy", "chewy", "novel"
export const FOOD_CATALOG = [
  // Permanent staples (always available)
  { id: "apple",       name: "Apple",       emoji: "\u{1F34E}", type: "crunch", xpCost: 5,  stageUnlock: 1, rotation: "permanent" },
  { id: "bread",       name: "Bread",       emoji: "\u{1F35E}", type: "chewy",  xpCost: 5,  stageUnlock: 1, rotation: "permanent" },
  { id: "milk",        name: "Milk",        emoji: "\u{1F95B}", type: "soupy",  xpCost: 5,  stageUnlock: 1, rotation: "permanent" },

  // Rotating items (examples — driven by content calendar)
  { id: "onigiri",     name: "Onigiri",     emoji: "\u{1F359}", type: "chewy",  xpCost: 10, stageUnlock: 2, rotation: "rotating" },
  { id: "ramen",       name: "Ramen",       emoji: "\u{1F35C}", type: "soupy",  xpCost: 15, stageUnlock: 2, rotation: "rotating" },
  { id: "mochi",       name: "Mochi",       emoji: "\u{1F361}", type: "sweet",  xpCost: 10, stageUnlock: 2, rotation: "rotating" },
  { id: "tamales",     name: "Tamales",     emoji: "\u{1FAD4}", type: "spicy",  xpCost: 12, stageUnlock: 2, rotation: "rotating" },
  { id: "taco",        name: "Taco",        emoji: "\u{1F32E}", type: "spicy",  xpCost: 12, stageUnlock: 3, rotation: "rotating" },
  { id: "pad_thai",    name: "Pad Thai",    emoji: "\u{1F35D}", type: "chewy",  xpCost: 12, stageUnlock: 3, rotation: "rotating" },
  { id: "pierogi",     name: "Pierogi",     emoji: "\u{1F95F}", type: "chewy",  xpCost: 10, stageUnlock: 3, rotation: "rotating" },
  { id: "pho",         name: "Pho",         emoji: "\u{1F372}", type: "soupy",  xpCost: 15, stageUnlock: 4, rotation: "rotating" },
  { id: "jollof",      name: "Jollof Rice", emoji: "\u{1F35B}", type: "spicy",  xpCost: 12, stageUnlock: 4, rotation: "rotating" },
  { id: "sushi",       name: "Sushi",       emoji: "\u{1F363}", type: "novel",  xpCost: 20, stageUnlock: 5, rotation: "rotating" },

  // Legendary
  { id: "golden_apple", name: "Golden Apple", emoji: "\u{1F34F}", type: "novel", xpCost: 30, stageUnlock: 6, rotation: "permanent" },
];

// ── Vitality decay rate ──
// 8% per 24 hours of inactivity.
// Calculate on login: newVitality = oldVitality * (DECAY_RATE ^ (elapsedHours / 24))
export const VITALITY_DECAY_RATE = 0.92;

// ── Bond decay rate ──
// 2% per 24 hours of inactivity.
export const BOND_DECAY_RATE = 0.98;

// ── Interaction increments ──
export const BOND_INCREMENT_FEED = 0.03;
export const BOND_INCREMENT_TAP = 0.005;
export const BOND_INCREMENT_EQUIP = 0.02;
export const BOND_INCREMENT_OPEN = 0.01;

// ── Vitality boost per XP spent ──
// All food gives the same vitality per XP. A 5 XP apple and a 15 XP ramen
// both restore (xpCost * VITALITY_PER_XP) vitality.
export const VITALITY_PER_XP = 0.015;

// ── Stage thresholds ──
// Stage transitions require sustained vitality above the threshold
// for the specified number of days. Egg-to-Hatchling is event-driven (first quest).
export const STAGE_THRESHOLDS = [
  { stage: 0, threshold: 0,    days: 0 },  // Egg: event-driven
  { stage: 1, threshold: 0,    days: 0 },  // Hatchling: default after hatch
  { stage: 2, threshold: 0.5,  days: 3 },  // Sprout
  { stage: 3, threshold: 0.55, days: 7 },  // Buddy
  { stage: 4, threshold: 0.6,  days: 14 }, // Pal
  { stage: 5, threshold: 0.65, days: 30 }, // Champion
  { stage: 6, threshold: 0.7,  days: 60 }, // Legend
];
```

---

## File 2: OptioBuddy.jsx — The Character Component

This is the complete, production-ready character. It is a pure presentational component with no side effects. Copy this file as-is.

### Props API

| Prop | Type | Description |
|------|------|-------------|
| `vitality` | number (0-1) | Controls size, color saturation, energy level, facial expression, sleep state |
| `bond` | number (0-1) | Controls bounce energy, arm swing, eye tracking, expression intensity, tap reaction |
| `stage` | number (0-6) | Selects color palette and size. 0=Egg, 1=Hatchling, ... 6=Legend |
| `onTap` | function | Called when the buddy is tapped |
| `feedReaction` | string or null | Set to a food type ("crunch","sweet","spicy","soupy","chewy","novel") to trigger eating animation. Set back to null after ~2s. |
| `tapBurst` | number | Increment to trigger tap reaction animation. The component watches for changes. |
| `width` | number (optional) | SVG container width. Defaults to 400. |
| `height` | number (optional) | SVG container height. Defaults to 340. |

### Component Code

```jsx
import { useState, useEffect } from "react";
import { motion, useAnimation } from "framer-motion";
import { STAGE_PALETTES, STAGE_SCALES } from "./buddyConstants";

// ── Sub-components ──

function Particle({ x, y, color, delay }) {
  return (
    <motion.circle cx={x} cy={y} r={4} fill={color}
      initial={{ opacity: 1 }}
      animate={{ opacity: 0, cy: y - 80 - Math.random() * 60, cx: x + (Math.random() - 0.5) * 120, r: 0 }}
      transition={{ duration: 1.2, delay, ease: "easeOut" }}
    />
  );
}

function Sparkle({ x, y, delay, size = 3 }) {
  return (
    <motion.g initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0] }}
      transition={{ duration: 0.8, delay, repeat: Infinity, repeatDelay: 2 + Math.random() * 3 }}>
      <line x1={x - size} y1={y} x2={x + size} y2={y} stroke="#FFF" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={x} y1={y - size} x2={x} y2={y + size} stroke="#FFF" strokeWidth={1.5} strokeLinecap="round" />
    </motion.g>
  );
}

function SleepZs({ x, y, active }) {
  if (!active) return null;
  const zs = [
    { size: 16, dx: 0, dy: 0, delay: 0 },
    { size: 13, dx: 14, dy: -8, delay: 0.7 },
    { size: 10, dx: 26, dy: -18, delay: 1.4 },
  ];
  return (
    <g>
      {zs.map((z, i) => (
        <motion.text key={i} x={x + z.dx} y={y + z.dy} fontSize={z.size}
          fill="#7BA4D4" fontWeight="800" fontFamily="system-ui, sans-serif"
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 0.9, 0.9, 0],
            x: [x + z.dx, x + z.dx + 8, x + z.dx + 18, x + z.dx + 28],
            y: [y + z.dy, y + z.dy - 15, y + z.dy - 35, y + z.dy - 55],
          }}
          transition={{ duration: 2.8, delay: z.delay, repeat: Infinity, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}>
          Z
        </motion.text>
      ))}
    </g>
  );
}

function Eye({ cx, cy, rx, ry, pupilR, highlightR, openness, blinkDur, bond }) {
  const whiteRy = ry * openness;
  const showInner = openness > 0.2;
  const pupilRy = showInner ? pupilR * Math.min(1, openness / 0.5) : 0;
  const trackRange = bond * 2.5;

  return (
    <g>
      <motion.ellipse cx={cx} cy={cy} rx={rx}
        animate={{ ry: whiteRy }} transition={{ duration: blinkDur }} fill="white" />
      {showInner && (
        <motion.ellipse
          cx={cx + 1} cy={cy + 1} rx={pupilR}
          animate={{
            ry: pupilRy,
            cx: bond > 0.3 ? [cx + 1, cx + 1 + trackRange, cx + 1, cx + 1 - trackRange, cx + 1] : cx + 1,
            cy: bond > 0.3 ? [cy + 1, cy + 1 - trackRange * 0.5, cy + 1, cy + 1 + trackRange * 0.3, cy + 1] : cy + 1,
          }}
          transition={{
            ry: { duration: blinkDur },
            cx: { duration: 4 + (1 - bond) * 4, repeat: Infinity, ease: "easeInOut" },
            cy: { duration: 5 + (1 - bond) * 3, repeat: Infinity, ease: "easeInOut" },
          }}
          fill="#1A1A2E"
        />
      )}
      {showInner && openness > 0.4 && (
        <circle cx={cx + 3} cy={cy - 3} r={highlightR} fill="white" />
      )}
    </g>
  );
}

function Mouth({ cx, cy, isSleeping, isTired, isHappy, feedReaction, scale, bond }) {
  const w = 20 * scale;
  const bondMult = 0.6 + bond * 0.4;

  if (isSleeping) {
    return (
      <motion.ellipse cx={cx} cy={cy + 2} rx={4 * scale} fill="#2A1A2E"
        animate={{ ry: [2.5 * scale, 3.5 * scale, 2.5 * scale] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
    );
  }

  if (feedReaction) {
    return (
      <g>
        <motion.ellipse cx={cx} cy={cy + 1} rx={10 * scale} fill="#2A1A2E"
          initial={{ ry: 0 }}
          animate={{ ry: [0, 9 * scale, 7 * scale, 8 * scale, 0] }}
          transition={{ duration: 1.6, times: [0, 0.15, 0.4, 0.7, 1] }}
        />
        <motion.ellipse cx={cx} cy={cy + 5} rx={6 * scale} fill="#FF8FAA"
          initial={{ ry: 0 }}
          animate={{ ry: [0, 4 * scale, 3 * scale, 2.5 * scale, 0] }}
          transition={{ duration: 1.6, times: [0, 0.2, 0.45, 0.75, 1] }}
        />
      </g>
    );
  }

  if (isHappy) {
    const mouthW = w * 0.7 * bondMult;
    const mouthH = w * 0.4 * bondMult;
    return (
      <g>
        <path
          d={`M${cx - mouthW} ${cy} L${cx + mouthW} ${cy} Q${cx + mouthW} ${cy + mouthH * 1.4} ${cx} ${cy + mouthH * 1.5} Q${cx - mouthW} ${cy + mouthH * 1.4} ${cx - mouthW} ${cy} Z`}
          fill="#2A1A2E"
        />
        {bond > 0.4 && (
          <ellipse cx={cx} cy={cy + mouthH * 1.1} rx={mouthW * 0.55} ry={mouthH * 0.45} fill="#FF8FAA" />
        )}
        <path
          d={`M${cx - mouthW - 1} ${cy} Q${cx} ${cy - 2} ${cx + mouthW + 1} ${cy}`}
          fill="none" stroke="#1A1A2E" strokeWidth={1.5} strokeLinecap="round"
        />
      </g>
    );
  }

  if (!isTired) {
    const smileDepth = w * 0.2 * bondMult + w * 0.05;
    return (
      <path
        d={`M${cx - w * 0.45 * bondMult} ${cy} Q${cx} ${cy + smileDepth} ${cx + w * 0.45 * bondMult} ${cy}`}
        fill="none" stroke="#1A1A2E" strokeWidth={2.2} strokeLinecap="round"
      />
    );
  }

  return (
    <path
      d={`M${cx - w * 0.3} ${cy} Q${cx} ${cy + 1.5} ${cx + w * 0.3} ${cy}`}
      fill="none" stroke="#1A1A2E" strokeWidth={2} strokeLinecap="round"
    />
  );
}

// ── Main character component ──

export default function OptioBuddy({
  vitality = 0.75,
  bond = 0.4,
  stage = 3,
  onTap = () => {},
  feedReaction = null,
  tapBurst = 0,
  width = 400,
  height = 340,
}) {
  const palette = STAGE_PALETTES[stage] || STAGE_PALETTES[1];
  const scale = STAGE_SCALES[stage] || 0.7;
  const bodyControls = useAnimation();
  const [blinking, setBlinking] = useState(false);
  const [particles, setParticles] = useState([]);

  const isSleeping = vitality < 0.15;
  const isTired = vitality < 0.4;
  const isHappy = vitality > 0.6;
  const eyeOpenness = isSleeping ? 0.05 : isTired ? 0.5 : 1;
  const browOffset = isSleeping ? 3 : isTired ? 2 : isHappy ? (-2 - bond * 2) : 0;
  const saturation = 0.3 + vitality * 0.7;
  const isEgg = stage === 0;

  // Blink loop
  useEffect(() => {
    if (isSleeping) return;
    const interval = setInterval(() => {
      setBlinking(true);
      setTimeout(() => setBlinking(false), 150);
    }, 2500 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, [isSleeping]);

  // Tap reaction (bond-scaled)
  useEffect(() => {
    if (!tapBurst) return;
    const intensity = 0.5 + bond * 0.5;
    if (bond > 0.6) {
      bodyControls.start({
        y: [0, -18 * intensity, 0], scaleX: [1, 0.85, 1.1, 1], scaleY: [1, 1.15, 0.9, 1],
        rotate: [0, -6 * intensity, 6 * intensity, 0], transition: { duration: 0.6 },
      });
    } else if (bond > 0.3) {
      bodyControls.start({
        y: [0, -8, 0], scaleY: [1, 1.06, 0.96, 1], scaleX: [1, 0.95, 1.04, 1],
        transition: { duration: 0.4 },
      });
    } else {
      bodyControls.start({
        scaleX: [1, 0.97, 1], scaleY: [1, 1.03, 1], transition: { duration: 0.25 },
      });
    }
    // Spawn tap particles
    const count = bond > 0.6 ? 8 : bond > 0.3 ? 5 : 2;
    const np = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i, x: 180 + Math.random() * 40, y: 220 + Math.random() * 30,
      color: ["#FFD700", "#FF69B4", "#87CEEB", "#98FB98", "#DDA0DD", "#FFA07A", "#B0E0E6", "#FFB6C1"][i % 8],
      delay: i * 0.04,
    }));
    setParticles(prev => [...prev, ...np]);
    setTimeout(() => setParticles(prev => prev.filter(p => !np.includes(p))), 2000);
  }, [tapBurst, bond, bodyControls]);

  // Feed reaction
  useEffect(() => {
    if (!feedReaction) return;
    const reactions = {
      crunch: async () => {
        await bodyControls.start({ scaleX: [1, 1.15, 0.9, 1.05, 1], scaleY: [1, 0.85, 1.1, 0.95, 1], transition: { duration: 0.5, times: [0, 0.2, 0.4, 0.7, 1] } });
        await bodyControls.start({ rotate: [-3, 3, -2, 1, 0], transition: { duration: 0.4 } });
      },
      sweet: async () => {
        await bodyControls.start({ scaleY: [1, 1.08, 1], scaleX: [1, 0.94, 1], transition: { duration: 0.6 } });
        await bodyControls.start({ rotate: [0, -5, 5, -3, 3, 0], transition: { duration: 0.8 } });
      },
      spicy: async () => {
        await bodyControls.start({ y: [0, -15, 0], transition: { duration: 0.3 } });
        await bodyControls.start({ scaleX: [1, 1.2, 1], scaleY: [1, 0.8, 1], transition: { duration: 0.3 } });
        await bodyControls.start({ rotate: [0, -8, 8, -5, 5, 0], transition: { duration: 0.5 } });
      },
      soupy: async () => {
        await bodyControls.start({ scaleY: [1, 1.05, 0.98, 1.02, 1], transition: { duration: 1 } });
      },
      chewy: async () => {
        for (let i = 0; i < 3; i++) {
          await bodyControls.start({ scaleY: 0.92, scaleX: 1.08, transition: { duration: 0.12 } });
          await bodyControls.start({ scaleY: 1.04, scaleX: 0.97, transition: { duration: 0.12 } });
        }
        await bodyControls.start({ scaleY: 1, scaleX: 1, transition: { duration: 0.2 } });
      },
      novel: async () => {
        await bodyControls.start({ scaleX: 0.95, scaleY: 0.95, transition: { duration: 0.5 } });
        await new Promise(r => setTimeout(r, 400));
        await bodyControls.start({ scaleX: [0.95, 1.12, 1], scaleY: [0.95, 0.88, 1], y: [0, -20, 0], transition: { duration: 0.6 } });
      },
    };
    (reactions[feedReaction] || reactions.crunch)();
    // Spawn feed particles
    const np = Array.from({ length: 8 }, (_, i) => ({
      id: Date.now() + i + 100, x: 185 + Math.random() * 30, y: 240 + Math.random() * 20,
      color: ["#FFD700", "#FF69B4", palette.body, "#98FB98"][i % 4], delay: i * 0.04,
    }));
    setParticles(prev => [...prev, ...np]);
    setTimeout(() => setParticles(prev => prev.filter(p => !np.includes(p))), 2000);
  }, [feedReaction, bodyControls, palette]);

  // Bond-driven animation parameters
  const bounceAmplitude = isSleeping ? 0 : isTired ? 2 : 4 + bond * 8;
  const bounceSpeed = isTired ? 3 : 2.2 - bond * 0.8;
  const armSwing = isSleeping ? 0 : isTired ? 3 : 6 + bond * 12;
  const bodyTilt = isSleeping ? 0 : bond * 3;
  const currentEyeOpen = blinking ? 0.05 : eyeOpenness;
  const blinkDur = blinking ? 0.07 : 0.3;

  // Body geometry
  const bodyRx = 65 * scale;
  const bodyCy = 258;
  const armRx = 11 * scale;
  const armRy = 13 * scale;
  const armLx = 200 - bodyRx + armRx * 0.3;
  const armRxPos = 200 + bodyRx - armRx * 0.3;
  const armCy = bodyCy + 8;
  const showCheeks = isHappy && bond > 0.25;
  const cheekOpacity = 0.2 + bond * 0.3;

  // ── Egg render ──
  if (isEgg) {
    return (
      <svg viewBox="0 0 400 340" width={width} height={height}>
        <motion.g onClick={onTap} style={{ cursor: "pointer" }}
          whileTap={{ rotate: [0, -8, 8, -5, 5, 0], transition: { duration: 0.5 } }}>
          <motion.ellipse cx={200} cy={310} rx={40} ry={8} fill="black" opacity={0.08}
            animate={{ rx: [40, 38, 40] }} transition={{ duration: 2, repeat: Infinity }} />
          <motion.g animate={{ rotate: [-1.5, 1.5, -1.5], y: [0, -3, 0] }}
            transition={{ duration: 3, repeat: Infinity }} style={{ originX: "200px", originY: "270px" }}>
            <ellipse cx={200} cy={255} rx={48} ry={58} fill="#F1EFE8" />
            <ellipse cx={200} cy={255} rx={48} ry={58} fill="none" stroke="#D3D1C7" strokeWidth={2} />
            <motion.ellipse cx={200} cy={260} rx={25} ry={30} fill={palette.glow}
              animate={{ opacity: [0.05, 0.15, 0.05] }} transition={{ duration: 2.5, repeat: Infinity }} />
            <motion.path d="M188 240 L192 248 L186 254" fill="none" stroke="#C8C6BD"
              strokeWidth={1.5} strokeLinecap="round"
              animate={{ opacity: [0.3, 0.5, 0.3] }} transition={{ duration: 3, repeat: Infinity }} />
          </motion.g>
        </motion.g>
        {particles.map(p => <Particle key={p.id} x={p.x} y={p.y} color={p.color} delay={p.delay} />)}
      </svg>
    );
  }

  // ── Buddy render ──
  return (
    <svg viewBox="0 0 400 340" width={width} height={height}>
      <motion.g onClick={onTap} style={{ cursor: "pointer", filter: `saturate(${saturation})` }} animate={bodyControls}>
        {/* Shadow */}
        <motion.ellipse cx={200} cy={320} fill="black" opacity={0.1}
          animate={{ rx: [50 * scale, (46 - bond * 4) * scale, 50 * scale], ry: [10, 8, 10] }}
          transition={{ duration: bounceSpeed, repeat: Infinity }} />

        {/* Bounce group */}
        <motion.g
          animate={{
            y: isSleeping ? [0, 1, 0] : [0, -bounceAmplitude, 0],
            scaleX: isSleeping ? [1, 1.02, 1] : [1, 0.96, 1.03, 0.98, 1],
            scaleY: isSleeping ? [1, 0.98, 1] : [1, 1.04, 0.97, 1.02, 1],
            rotate: isSleeping ? 0 : [-bodyTilt, bodyTilt, -bodyTilt],
          }}
          transition={{ duration: bounceSpeed, repeat: Infinity, ease: "easeInOut" }}
          style={{ originX: "200px", originY: "280px" }}>

          {/* Back arm */}
          <motion.ellipse cx={armLx} cy={armCy} rx={armRx} ry={armRy}
            fill={palette.body} style={{ filter: "brightness(0.92)" }}
            animate={isSleeping ? {} : { rotate: [-armSwing, armSwing, -armSwing] }}
            transition={{ duration: bounceSpeed, repeat: Infinity }} />

          {/* Body */}
          <ellipse cx={200} cy={bodyCy} rx={bodyRx} ry={60 * scale} fill={palette.body} />
          <ellipse cx={200} cy={268} rx={40 * scale} ry={35 * scale} fill={palette.belly} opacity={0.6} />
          <ellipse cx={183} cy={235} rx={18 * scale} ry={12 * scale} fill="white" opacity={0.15} />

          {/* Front arm */}
          <motion.ellipse cx={armRxPos} cy={armCy} rx={armRx} ry={armRy}
            fill={palette.body} style={{ filter: "brightness(0.92)" }}
            animate={isSleeping ? {} : { rotate: [armSwing, -armSwing, armSwing] }}
            transition={{ duration: bounceSpeed, repeat: Infinity, delay: 0.1 }} />

          {/* Cheeks */}
          {showCheeks && <>
            <motion.ellipse cx={172} cy={256} rx={9 * scale} ry={6 * scale} fill={palette.cheek}
              animate={{ opacity: [cheekOpacity - 0.1, cheekOpacity + 0.05, cheekOpacity - 0.1] }}
              transition={{ duration: 2, repeat: Infinity }} />
            <motion.ellipse cx={228} cy={256} rx={9 * scale} ry={6 * scale} fill={palette.cheek}
              animate={{ opacity: [cheekOpacity - 0.1, cheekOpacity + 0.05, cheekOpacity - 0.1] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.3 }} />
          </>}

          {/* Stage 5+ sparkles */}
          {stage >= 5 && <>
            <Sparkle x={160} y={220} delay={0} />
            <Sparkle x={240} y={225} delay={0.8} size={2.5} />
            <Sparkle x={200} y={200} delay={1.6} size={3.5} />
            {stage >= 6 && <>
              <Sparkle x={150} y={240} delay={0.4} size={2} />
              <Sparkle x={250} y={210} delay={1.2} />
            </>}
          </>}

          {/* Legend glow */}
          {stage >= 6 && <motion.ellipse cx={200} cy={255} rx={75 * scale} ry={70 * scale} fill={palette.glow}
            animate={{ opacity: [0.05, 0.12, 0.05] }} transition={{ duration: 3, repeat: Infinity }} />}

          {/* Face */}
          <g>
            {/* Eyebrows */}
            <line x1={178} y1={233 + browOffset} x2={188} y2={231 + browOffset}
              stroke={palette.body} strokeWidth={2.5} strokeLinecap="round" style={{ filter: "brightness(0.65)" }} />
            <line x1={212} y1={231 + browOffset} x2={222} y2={233 + browOffset}
              stroke={palette.body} strokeWidth={2.5} strokeLinecap="round" style={{ filter: "brightness(0.65)" }} />

            {/* Eyes */}
            <Eye cx={184} cy={245} rx={11 * scale} ry={13 * scale}
              pupilR={6 * scale} highlightR={2.5 * scale}
              openness={currentEyeOpen} blinkDur={blinkDur} bond={bond} />
            <Eye cx={216} cy={245} rx={11 * scale} ry={13 * scale}
              pupilR={6 * scale} highlightR={2.5 * scale}
              openness={currentEyeOpen} blinkDur={blinkDur} bond={bond} />

            {/* Mouth */}
            <Mouth cx={200} cy={262} isSleeping={isSleeping} isTired={isTired} isHappy={isHappy}
              feedReaction={feedReaction} scale={scale} bond={bond} />
          </g>

          {/* Sleep Z's */}
          <SleepZs x={232} y={222} active={isSleeping} />
        </motion.g>
      </motion.g>

      {/* Particles (tap and feed) */}
      {particles.map(p => <Particle key={p.id} x={p.x} y={p.y} color={p.color} delay={p.delay} />)}
    </svg>
  );
}
```

---

## File 3: useBuddyState.js — State Management Hook

This hook manages the buddy's runtime state. It handles decay calculation on mount, feeding, tapping, and stage evolution checks. Connect it to your Supabase buddy record.

```javascript
import { useState, useCallback, useRef, useEffect } from "react";
import {
  VITALITY_DECAY_RATE,
  BOND_DECAY_RATE,
  BOND_INCREMENT_FEED,
  BOND_INCREMENT_TAP,
  BOND_INCREMENT_OPEN,
  VITALITY_PER_XP,
  STAGE_THRESHOLDS,
  FOOD_CATALOG,
} from "./buddyConstants";

export default function useBuddyState(initialRecord) {
  // initialRecord comes from Supabase: { name, vitality, bond, stage,
  //   highest_stage, last_interaction, food_journal, equipped, wallet }

  const [vitality, setVitality] = useState(() => {
    // Calculate decay since last interaction
    const elapsed = (Date.now() - new Date(initialRecord.last_interaction).getTime()) / (1000 * 60 * 60);
    const decayed = initialRecord.vitality * Math.pow(VITALITY_DECAY_RATE, elapsed / 24);
    // Floor at one stage below highest achieved, minimum Hatchling (stage 1)
    const floorStage = Math.max(1, initialRecord.highest_stage - 1);
    const floorVitality = STAGE_THRESHOLDS[floorStage]?.threshold || 0;
    return Math.max(floorVitality, decayed);
  });

  const [bond, setBond] = useState(() => {
    const elapsed = (Date.now() - new Date(initialRecord.last_interaction).getTime()) / (1000 * 60 * 60);
    const decayed = initialRecord.bond * Math.pow(BOND_DECAY_RATE, elapsed / 24);
    // Bond never drops below 50% of peak
    return Math.max(initialRecord.bond * 0.5, decayed);
  });

  const [stage, setStage] = useState(initialRecord.stage);
  const [feedReaction, setFeedReaction] = useState(null);
  const [tapBurst, setTapBurst] = useState(0);
  const feedTimeout = useRef(null);

  // Record screen open as bond interaction
  useEffect(() => {
    setBond(b => Math.min(1, b + BOND_INCREMENT_OPEN));
  }, []);

  const feed = useCallback((foodItem) => {
    if (feedReaction) return; // Debounce during animation

    const food = FOOD_CATALOG.find(f => f.id === foodItem.id) || foodItem;
    const boost = food.xpCost * VITALITY_PER_XP;

    setFeedReaction(food.type);
    setVitality(v => Math.min(1, v + boost));
    setBond(b => Math.min(1, b + BOND_INCREMENT_FEED));

    clearTimeout(feedTimeout.current);
    feedTimeout.current = setTimeout(() => setFeedReaction(null), 2000);

    // Return data for the caller to persist:
    // - deduct xpCost from wallet
    // - add food.id to food_journal if not present (first taste)
    // - update vitality and bond in DB
    // - update last_interaction timestamp
    return {
      xpCost: food.xpCost,
      foodId: food.id,
      isFirstTaste: !initialRecord.food_journal?.includes(food.id),
      newVitality: Math.min(1, vitality + boost),
      newBond: Math.min(1, bond + BOND_INCREMENT_FEED),
    };
  }, [feedReaction, vitality, bond, initialRecord]);

  const tap = useCallback(() => {
    if (feedReaction) return;
    setTapBurst(t => t + 1);
    setBond(b => Math.min(1, b + BOND_INCREMENT_TAP));
    return { newBond: Math.min(1, bond + BOND_INCREMENT_TAP) };
  }, [feedReaction, bond]);

  // Check for stage evolution
  // This should be called after feeding. In production, you'd also check
  // the "sustained for N days" requirement against your DB records.
  const checkEvolution = useCallback(() => {
    const nextStage = stage + 1;
    if (nextStage > 6) return null;
    const threshold = STAGE_THRESHOLDS[nextStage];
    if (vitality >= threshold.threshold) {
      // In production: also verify sustained duration from DB
      setStage(nextStage);
      return { newStage: nextStage };
    }
    return null;
  }, [stage, vitality]);

  return {
    vitality,
    bond,
    stage,
    feedReaction,
    tapBurst,
    feed,
    tap,
    checkEvolution,
    setVitality,
    setBond,
    setStage,
  };
}
```

---

## File 4: OptioBuddyScreen.jsx — Screen Wrapper Skeleton

This is a starting point. Adapt it to your navigation, state management, and UI patterns.

```jsx
import React, { useEffect } from "react";
import OptioBuddy from "./OptioBuddy";
import useBuddyState from "./useBuddyState";
import { FOOD_CATALOG, STAGE_PALETTES } from "./buddyConstants";

export default function OptioBuddyScreen({ buddyRecord, onUpdateRecord }) {
  const {
    vitality, bond, stage, feedReaction, tapBurst,
    feed, tap, checkEvolution,
  } = useBuddyState(buddyRecord);

  const palette = STAGE_PALETTES[stage];

  // Available food based on current stage and active rotation
  const availableFood = FOOD_CATALOG.filter(f => f.stageUnlock <= stage);
  // TODO: filter by active weekly rotation from your content calendar

  const handleFeed = (food) => {
    const result = feed(food);
    if (!result) return;

    // Persist to Supabase
    onUpdateRecord({
      vitality: result.newVitality,
      bond: result.newBond,
      wallet: buddyRecord.wallet - result.xpCost,
      food_journal: result.isFirstTaste
        ? [...(buddyRecord.food_journal || []), result.foodId]
        : buddyRecord.food_journal,
      last_interaction: new Date().toISOString(),
    });

    // Check evolution after a delay (let the eat animation finish)
    setTimeout(() => {
      const evolution = checkEvolution();
      if (evolution) {
        onUpdateRecord({
          stage: evolution.newStage,
          highest_stage: Math.max(buddyRecord.highest_stage, evolution.newStage),
        });
        // TODO: show celebration UI (confetti overlay, stage label)
      }
    }, 2200);
  };

  const handleTap = () => {
    const result = tap();
    if (!result) return;
    onUpdateRecord({
      bond: result.newBond,
      last_interaction: new Date().toISOString(),
    });
  };

  return (
    <div>
      {/* Buddy character */}
      <OptioBuddy
        vitality={vitality}
        bond={bond}
        stage={stage}
        onTap={handleTap}
        feedReaction={feedReaction}
        tapBurst={tapBurst}
      />

      {/* Food store */}
      <div>
        {availableFood.map(food => (
          <button
            key={food.id}
            onClick={() => handleFeed(food)}
            disabled={!!feedReaction || buddyRecord.wallet < food.xpCost}
          >
            <span>{food.emoji}</span>
            <span>{food.name}</span>
            <span>{food.xpCost} XP</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

---

## Database Schema

Add these columns to your student/buddy table (or create a separate `buddy` table with a foreign key to the student):

```sql
-- Buddy record per student
ALTER TABLE students ADD COLUMN buddy_name TEXT DEFAULT NULL;
ALTER TABLE students ADD COLUMN buddy_vitality REAL DEFAULT 0.8;
ALTER TABLE students ADD COLUMN buddy_bond REAL DEFAULT 0.0;
ALTER TABLE students ADD COLUMN buddy_stage INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN buddy_highest_stage INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN buddy_last_interaction TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE students ADD COLUMN buddy_food_journal TEXT[] DEFAULT '{}';
ALTER TABLE students ADD COLUMN buddy_equipped JSONB DEFAULT '{}';

-- Or as a separate table:
CREATE TABLE buddy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  vitality REAL DEFAULT 0.8 CHECK (vitality >= 0 AND vitality <= 1),
  bond REAL DEFAULT 0.0 CHECK (bond >= 0 AND bond <= 1),
  stage INTEGER DEFAULT 0 CHECK (stage >= 0 AND stage <= 6),
  highest_stage INTEGER DEFAULT 0,
  last_interaction TIMESTAMPTZ DEFAULT NOW(),
  food_journal TEXT[] DEFAULT '{}',
  equipped JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id)
);

-- RLS policy (students can only read/write their own buddy)
ALTER TABLE buddy ENABLE ROW LEVEL SECURITY;
CREATE POLICY buddy_owner ON buddy
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());
```

---

## Integration Checklist

1. Install `framer-motion` (and `react-native-svg` if React Native)
2. Create the four files above in `src/components/buddy/`
3. Add the database columns or table
4. Wire `OptioBuddyScreen` into your navigation (buddy tab or screen)
5. Connect `buddyRecord` to your Supabase query for the current student
6. Connect `onUpdateRecord` to your Supabase update mutation
7. On the quest completion flow, after awarding XP, also add the same amount to the buddy wallet
8. On first quest completion (onboarding), set buddy_stage from 0 to 1 and show the hatching sequence
9. On app open, the `useBuddyState` hook auto-calculates decay — just pass the raw DB record

## Future Additions (not needed for launch)

- **Accessories**: Add SVG groups inside the bounce group, positioned relative to body. Toggle visibility with equipped prop. Each accessory is a few SVG shapes.
- **First-taste animation**: Check `isFirstTaste` from the feed result. If true, extend the feedReaction timeout and add a celebration particle burst.
- **Trick animations**: At Pal+ stage with high bond, occasionally interrupt the idle with a trick sequence using `bodyControls.start()` on a random timer.
- **Stage transition celebration**: When `checkEvolution` returns a new stage, overlay a confetti component and play the evolve animation before updating the stage prop.
- **Food rotation**: Add a `food_rotations` table with weekly themes. Filter `FOOD_CATALOG` by the current week's active rotation IDs.
- **Parent dashboard**: Query the buddy table for the parent's child and render a static snapshot (stage name, last interaction timestamp, food journal count).