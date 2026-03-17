# Liquid Glass Implementation Plan

**Last Updated**: March 17, 2026
**Reference**: [DESIGN_PHILOSOPHY.md](./DESIGN_PHILOSOPHY.md)

---

## Current State

The app already has a glass-inspired foundation:
- `GlassBackground` -- SVG radial gradient blobs behind content
- `GlassCard` -- BlurView + specular highlight + semi-transparent fill
- `GlassButton` -- Three variants (primary gradient, outline, ghost)
- Token system in `tokens.ts` with glass colors, blur values, shadows
- Light/dark theme support via `themeStore.ts`
- Spring animations configured (damping: 15, stiffness: 150)

**Gap**: The current design uses glass materials in the **content layer** (cards, forms, lists), which contradicts Apple's Liquid Glass philosophy. Glass should be reserved for the **navigation/controls layer** while content uses opaque surfaces.

---

## Phase 1: Layer Separation (Foundation)

**Goal**: Establish the three-layer architecture. Separate glass from content.

### 1.1 Create `SurfaceCard` Component

Replace `GlassCard` in all content contexts with a new opaque surface card.

**New file**: `src/components/common/SurfaceCard.tsx`

```
Props: children, style, accent?, noPadding?
Light: rgba(255,255,255,0.45) background, md shadow, lg radius
Dark: rgba(255,255,255,0.06) background, sm shadow, 0.5px border
No blur. No specular highlight.
```

**Screens to migrate** (GlassCard in content context):
- `HomeScreen.tsx` -- Buddy card, stats cards
- `FeedScreen.tsx` -- Feed item cards
- `FeedDetailScreen.tsx` -- Detail content card
- `JournalScreen.tsx` -- Journal entry cards
- `JournalDetailScreen.tsx` -- Detail content
- `BountyBoardScreen.tsx` -- Bounty cards
- `BountyDetailScreen.tsx` -- Detail content
- `CaptureScreen.tsx` -- Capture result card
- `ProfileScreen.tsx` -- Profile info cards
- `OverviewScreen.tsx` -- Stats cards
- `ShopScreen.tsx` -- Item cards

### 1.2 Restrict `GlassCard` to Navigation Layer

After migration, `GlassCard` should only be used for:
- Floating action overlays
- Toolbar containers
- Modal chrome (the frame around a modal, not its content)
- Navigation-adjacent elements

Rename `GlassCard` to `GlassContainer` to clarify intent.

### 1.3 Update `GlassBackground`

No changes needed -- it already serves as the background layer correctly.

**Estimated effort**: 2-3 sessions

---

## Phase 2: Glass Navigation System

**Goal**: Build a proper glass navigation layer that floats above content.

### 2.1 Glass Tab Bar

**File**: `src/navigation/AppNavigator.tsx`

Current tab bar uses a custom SVG shape with opaque fills. Replace with:

- `BlurView` background (intensity: 40, tint: adaptive)
- Specular highlight along top edge
- Content-aware tinting (absorb color from content below)
- Dissolve edge where content scrolls under the bar
- Remove the hard SVG notch shape -- use a simple rounded glass surface
- Center logo sits elevated on the glass bar, not punching through it

### 2.2 Glass Nav Bar (Stack Headers)

**File**: New `src/components/common/GlassNavBar.tsx`

For stack navigation screens (detail views, modals):
- Replace default `headerStyle` with glass material
- BlurView + specular highlight + adaptive shadow
- Back button and title sit on glass surface
- Scroll content dissolves under the nav bar edge

### 2.3 Floating Glass Controls

**File**: Update `src/components/common/GlassButton.tsx`

Refine the button to behave as a proper glass element:
- Touch response: scale 0.97x + light bloom from touch point
- Primary variant: purple-to-pink tinted glass (not solid gradient)
- Outline variant: thin glass material
- Ghost variant: stays as-is (text only, no glass)

**Estimated effort**: 2-3 sessions

---

## Phase 3: Light & Interaction Physics

**Goal**: Add the dynamic light behaviors that make glass feel alive.

### 3.1 Touch Light Bloom

**New file**: `src/components/common/TouchGlow.tsx`

A wrapper component that:
- Captures touch coordinates via `onPressIn`
- Renders a radial gradient glow at the touch point
- Animates the glow expanding outward (Reanimated shared value)
- Fades on release over 200ms
- Used as a HOC around all glass-layer interactive elements

### 3.2 Materialization Transitions

**New file**: `src/utils/glassAnimations.ts`

Shared animation presets:
- `materialize`: Element appears by modulating blur (blurry to sharp), not opacity
- `dematerialize`: Reverse -- element defocuses and dissolves
- `morphTransition`: Shared element transition where a card stretches into a detail view
- `springConfig`: Centralized spring physics (already in tokens, but standardize usage)

### 3.3 Scroll Edge Effects

**New file**: `src/components/common/ScrollEdgeEffect.tsx`

A `ScrollView` wrapper that:
- Applies a vertical gradient mask at the top edge (content fades into glass nav)
- Detects scroll offset and adjusts glass nav shadow depth
- Optionally adapts glass tint based on content brightness at the scroll edge

### 3.4 Adaptive Shadow

Update `tokens.ts` shadow system:
- Shadows on glass elements deepen over text content
- Shadows soften over solid/light backgrounds
- Implement as a utility that samples the background brightness (or use a simpler heuristic based on screen position)

**Estimated effort**: 3-4 sessions

---

## Phase 4: Adaptive Theming

**Goal**: Make glass respond intelligently to its context.

### 4.1 Content-Aware Glass Tinting

**File**: Update `src/stores/themeStore.ts`

Add a `glassTint` state that can be set per-screen:
- Default: neutral (no tint)
- Navigation screens: subtle Optio Purple tint
- Media screens: darker glass for contrast over photos/video
- Per-element override for CTAs (purple-pink tint)

### 4.2 Independent Light/Dark Sections

Allow individual glass elements to override the global theme:
- A glass nav bar over bright content stays light even in dark mode
- A glass overlay over a dark photo switches to dark variant
- Implement via a `colorScheme` prop on `GlassContainer`

### 4.3 Size-Aware Material Weight

When glass elements change size (e.g., a sheet expanding):
- Blur intensity scales with size (larger = heavier blur)
- Shadow depth increases
- Specular highlight becomes more pronounced
- Implement via Reanimated interpolation keyed to element dimensions

**Estimated effort**: 2-3 sessions

---

## Phase 5: Accessibility Integration

**Goal**: Ensure glass degrades gracefully under all accessibility settings.

### 5.1 Detect System Settings

**New file**: `src/hooks/useAccessibilitySettings.ts`

Hook that reads:
- `AccessibilityInfo.isReduceTransparencyEnabled` (or Expo equivalent)
- `AccessibilityInfo.isReduceMotionEnabled`
- `AccessibilityInfo.isBoldTextEnabled`
- Contrast preferences (where available)

### 5.2 Conditional Rendering

Based on detected settings:

| Setting | Glass Layer Change | Content Layer Change |
|---------|-------------------|---------------------|
| Reduce Transparency | Blur 80+, near-opaque bg | Fully opaque surfaces |
| Reduce Motion | No springs, no glow, no materialization. Simple 200ms ease + opacity fade | Same |
| Increased Contrast | Solid bg + 2px border, no blur | Higher contrast borders |
| Bold Text | No visual change | System handles font weight |

### 5.3 Apply to All Components

- `GlassContainer`: reads accessibility state, switches rendering mode
- `SurfaceCard`: reads reduce transparency, becomes fully opaque
- `TouchGlow`: disabled entirely under reduce motion
- `ScrollEdgeEffect`: simplified to hard clip under reduce motion
- All animation utilities: check reduce motion before applying springs

**Estimated effort**: 1-2 sessions

---

## Phase 6: Polish & Refinement

**Goal**: Final details that elevate the experience.

### 6.1 Haptic Feedback

Add `expo-haptics` for:
- Light tap on glass button press
- Medium impact on tab switch
- Selection feedback on segmented controls

### 6.2 Background Blob Animation

Animate the GlassBackground blobs with very slow drift:
- Blobs move 5-10px over 10-20 seconds
- Creates a subtle living quality to the background
- Disabled under reduce motion
- Uses Reanimated `withRepeat` + `withTiming`

### 6.3 Buddy Layer Integration

Ensure the Optio Buddy:
- Renders in the content layer, above surfaces but below glass
- Never has glass applied to it (should feel present, not behind a surface)
- Reacts to glass navigation state changes (e.g., perks up when user switches tabs)

### 6.4 Dark Mode Refinement

Audit all glass values in dark mode:
- Glass should feel like dark crystal, not just a dim version of light glass
- Background blobs shift to deeper, richer tones (less pastel)
- Specular highlights become moonlight-cool rather than warm

**Estimated effort**: 2-3 sessions

---

## Token Updates Required

### New/Updated Tokens in `tokens.ts`

```
glass.thin.background      -- lighter than current glass.background
glass.thin.blur            -- 20
glass.regular.background   -- current glass.background (rename)
glass.regular.blur         -- 40
glass.clear.dimming        -- rgba(0,0,0,0.35)
glass.clear.blur           -- 20

surface.background         -- current surface color (explicit)
surface.border             -- dark mode only border
surface.shadow             -- md shadow reference

scroll.edgeFade.height     -- 24px gradient mask height
scroll.liftShadow          -- additional shadow when scrolled

touch.glow.color           -- rgba(255,255,255,0.3)
touch.glow.radius          -- 60px
touch.glow.duration        -- 200ms
touch.scale.pressed        -- 0.97
touch.scale.spring         -- { damping: 20, stiffness: 300 }

materialization.blur.from  -- 20
materialization.blur.to    -- 0
materialization.duration   -- 250ms
```

---

## File Inventory

### New Files
| File | Phase | Purpose |
|------|-------|---------|
| `src/components/common/SurfaceCard.tsx` | 1 | Opaque content card |
| `src/components/common/GlassNavBar.tsx` | 2 | Glass stack header |
| `src/components/common/TouchGlow.tsx` | 3 | Touch-point light bloom |
| `src/components/common/ScrollEdgeEffect.tsx` | 3 | Scroll dissolve under glass |
| `src/utils/glassAnimations.ts` | 3 | Shared animation presets |
| `src/hooks/useAccessibilitySettings.ts` | 5 | Read system a11y state |

### Modified Files
| File | Phase | Change |
|------|-------|--------|
| `src/components/common/GlassCard.tsx` | 1 | Rename to GlassContainer, restrict usage |
| `src/components/common/GlassButton.tsx` | 2 | Add touch glow, tinted glass variant |
| `src/navigation/AppNavigator.tsx` | 2 | Glass tab bar |
| `src/theme/tokens.ts` | 1-6 | New token categories |
| `src/stores/themeStore.ts` | 4 | Per-screen glass tint state |
| All 13 screen files | 1 | Migrate GlassCard to SurfaceCard |

### Dependencies to Add
| Package | Phase | Purpose |
|---------|-------|---------|
| `expo-haptics` | 6 | Touch feedback |

No new major dependencies required -- the existing stack (`expo-blur`, `expo-linear-gradient`, `react-native-reanimated`, `react-native-svg`) covers all needs.

---

## Sequencing Summary

```
Phase 1 (Foundation)     ████████░░░░  Layer separation, SurfaceCard
Phase 2 (Navigation)     ░░░████████░  Glass tab/nav bar, button refinement
Phase 3 (Light Physics)  ░░░░░░████░░  Touch glow, materialization, scroll edge
Phase 4 (Adaptive)       ░░░░░░░░██░░  Content-aware tinting, size scaling
Phase 5 (Accessibility)  ░░░░░░░░░██░  System setting detection, conditional rendering
Phase 6 (Polish)         ░░░░░░░░░░██  Haptics, blob animation, dark mode audit
```

Phases 1 and 2 can partially overlap. Phases 3-6 are sequential but each is self-contained enough to ship incrementally.
