# Optio Mobile -- Design Philosophy

**Last Updated**: March 17, 2026

---

## Vision

Optio Mobile uses a **liquid glass** visual language inspired by Apple's Materials system and the Liquid Glass meta-material introduced in iOS 26. The interface should feel like holding a living lens -- light bends through translucent surfaces, content breathes underneath navigation, and every interaction produces a responsive shimmer of energy. The design reinforces Optio's core philosophy: **the process is the goal**. The UI never obscures the student's work; it frames it, celebrates it, and stays out of the way.

---

## Foundational Principles

### 1. Content Is Sacred

The content layer (journal entries, feed posts, bounty details, buddy interactions) is the student's world. Glass elements exist to **serve** content, not compete with it.

- Navigation and controls float above content on the **glass layer**
- The glass layer uses lensing (blur + refraction) to communicate separation without hiding what's underneath
- Content containers (cards, lists, detail views) live in the **content layer** and must never themselves become glass -- they use subtle surface fills and soft shadows instead
- When scrolling, content dissolves gently under the glass navigation rather than hard-clipping

### 2. Light as Language

Light is the primary communicator of state, depth, and interaction:

- **Lensing** -- Glass surfaces bend and concentrate background light to show their presence without blocking content
- **Specular highlights** -- A subtle white gradient along the top edge of glass elements simulates a light source, grounding the material in physical space
- **Interaction glow** -- When a student taps a glass element, light blooms outward from the touch point, spreading warmth through the surface
- **Shadow adaptation** -- Shadows deepen over text-heavy backgrounds (for separation) and soften over solid/light backgrounds (to avoid heaviness)
- **Materialization** -- Elements appear by gradually modulating light bending, not by fading opacity. They come into focus like a lens adjusting

### 3. Adaptive, Not Static

The interface continuously adjusts to its context:

- **Content-aware tinting** -- Glass surfaces subtly absorb color from whatever content sits beneath them, creating visual harmony rather than a flat overlay
- **Light/dark independence** -- Individual glass elements can shift between light and dark appearance based on the brightness of the content directly below them, independent of the system theme
- **Size-aware weight** -- Larger glass surfaces (sheets, expanded menus) simulate thicker material with deeper shadows and more pronounced lensing. Smaller elements (buttons, pills) stay lightweight
- **Accessibility response** -- When Reduce Transparency is enabled, glass becomes frostier. When Increased Contrast is enabled, glass becomes solid with high-contrast borders. When Reduce Motion is enabled, elastic animations and light effects are suppressed

### 4. Motion as Meaning

Movement communicates function, not decoration:

- **Gel-like flexibility** -- Glass elements flex and stretch during transitions, communicating that they are malleable and transient
- **Morphing continuity** -- When navigating between states (e.g., a bounty card expanding to detail view), elements morph rather than jump-cut. The glass surface stretches and reshapes, maintaining spatial continuity
- **Spring physics** -- All animations use spring dynamics (damping: 15, stiffness: 150) for organic, physical movement that avoids robotic easing curves
- **Purposeful restraint** -- Animation exists to communicate spatial relationships and state changes. If movement doesn't teach the user something about the interface, it doesn't happen

### 5. Selective Vibrancy

Color is a signal, not wallpaper:

- **Tinting is earned** -- Only primary actions and key navigation elements receive colored glass tinting (Optio Purple for navigation, Optio Pink for primary CTAs). Everything else uses neutral glass
- **Pillar colors as identity** -- The five learning pillar colors (STEM blue, Art purple, Communication green, Civics orange, Wellness red) appear in content badges and accents, never in glass tinting -- they belong to the content layer
- **No solid fills on glass** -- Solid color fills break the translucent character of glass. Use tinted transparency instead
- **Background color fields** -- Soft, radial color blobs (purple, pink, teal) wash across screen backgrounds behind the blur, creating ambient warmth without competing with foreground content

---

## Layer Architecture

The UI is organized into three distinct depth layers. Mixing materials across layers creates visual clutter and breaks hierarchy.

```
+--------------------------------------------------+
|  GLASS LAYER (Navigation + Controls)             |  <- Liquid glass material
|  Tab bar, nav bar, toolbar, floating buttons     |     Blur + lensing + highlights
+--------------------------------------------------+
|                                                    |
|  CONTENT LAYER (Student's World)                  |  <- Opaque/semi-opaque surfaces
|  Cards, lists, detail views, media, text          |     Surface fills + soft shadows
|                                                    |
+--------------------------------------------------+
|  BACKGROUND LAYER (Ambient Environment)           |  <- Color fields + decorations
|  Gradient blobs, SVG shapes, theme colors         |     Sets mood, never interactive
+--------------------------------------------------+
```

### Glass Layer Rules
- Only for navigation and floating controls
- Uses `expo-blur` BlurView with specular highlight overlay
- Never stack glass on glass (no glass cards inside glass sheets)
- Tint selectively (primary actions only)
- When placing elements ON TOP of glass, use fills with transparency and vibrancy -- not more glass

### Content Layer Rules
- Cards use `surface` color (semi-opaque white/dark) -- not glass blur
- Shadows provide depth separation between content items
- Text uses high-contrast foreground colors against surface backgrounds
- Pillar colors and reaction colors live here
- Media (photos, videos) display at full fidelity without glass overlay

### Background Layer Rules
- Radial gradient blobs set ambient mood
- SVG decorations (waves, rings, chevrons) add branded texture
- `pointerEvents="none"` -- never interactive
- Shifts with theme (warm lavender in light mode, deep navy in dark mode)
- Content and glass blur this layer, creating the frosted depth effect

---

## Material Specifications

### Glass (Regular) -- Primary Navigation Material

The default glass material for navigation bars, tab bars, toolbars, and floating action buttons.

| Property | Light Mode | Dark Mode |
|----------|-----------|-----------|
| Background | `rgba(255, 255, 255, 0.18)` | `rgba(255, 255, 255, 0.05)` |
| Blur intensity | 40 (medium) | 40 (medium) |
| Border | `0.5px rgba(255, 255, 255, 0.4)` | `0.5px rgba(255, 255, 255, 0.15)` |
| Specular highlight | Top-edge white gradient, 50% opacity | Top-edge white gradient, 20% opacity |
| Shadow | 4px offset, 10% opacity | 4px offset, 5% opacity |
| Blur tint | `light` | `dark` |

### Glass (Thin) -- Secondary Interactive Elements

For smaller interactive elements like segmented controls, chips, and toggles within the glass layer.

| Property | Light Mode | Dark Mode |
|----------|-----------|-----------|
| Background | `rgba(255, 255, 255, 0.12)` | `rgba(255, 255, 255, 0.03)` |
| Blur intensity | 20 (light) | 20 (light) |
| Border | `0.5px rgba(255, 255, 255, 0.2)` | `0.5px rgba(255, 255, 255, 0.1)` |
| Specular highlight | None | None |
| Shadow | None | None |

### Glass (Clear) -- Media Overlay Only

For controls floating directly over rich media (photo viewer, video player). Requires a dimming layer beneath for legibility.

| Property | Value |
|----------|-------|
| Background | `rgba(0, 0, 0, 0.35)` (dimming) |
| Blur intensity | 20 (light) |
| Border | None |
| Use only when | Over media-rich content AND foreground content is bold/bright |

### Surface -- Content Cards

Not glass. Opaque/semi-opaque fills for the content layer.

| Property | Light Mode | Dark Mode |
|----------|-----------|-----------|
| Background | `rgba(255, 255, 255, 0.45)` | `rgba(255, 255, 255, 0.06)` |
| Border | None (shadow provides separation) | `0.5px rgba(255, 255, 255, 0.08)` |
| Shadow | `md` (elevation 3) | `sm` (elevation 1) |
| Border radius | `lg` (16px) | `lg` (16px) |

---

## Interaction Design

### Touch Response

When a student touches a glass element:

1. **Immediate** (0ms): Element scales down slightly (0.97x) with spring physics
2. **50ms**: Light begins to bloom from the touch point outward
3. **Release**: Element springs back to 1.0x scale; light fades over 200ms
4. **Haptic**: Light tap feedback on iOS for primary actions

### Transitions

| Transition | Animation | Duration |
|------------|-----------|----------|
| Screen push | Content slides + glass nav morphs | 300ms spring |
| Modal present | Content scales down, modal rises with glass flex | 350ms spring |
| Card expand | Card morphs to detail view (shared element) | 300ms spring |
| Tab switch | Content crossfade, no glass movement | 200ms timing |
| Element appear | Light-bending materialization | 250ms spring |
| Element dismiss | Reverse materialization (defocus) | 200ms timing |

### Scroll Behavior

- Content scrolling under the glass nav bar triggers a **dissolve edge** -- content fades out as it approaches the glass boundary
- When scroll begins, the glass nav bar subtly lifts (shadow deepens by 1px)
- When scrolled content is dark, glass adapts by switching to its dark variant for contrast

---

## Accessibility Commitments

The glass aesthetic must never compromise usability.

| Setting | Response |
|---------|----------|
| **Reduce Transparency** | Glass becomes heavily frosted (blur intensity 80+), backgrounds mostly obscured. Content layer cards become fully opaque |
| **Increased Contrast** | Glass elements become solid (opaque black or white) with 2px high-contrast borders. All vibrancy disabled |
| **Reduce Motion** | Spring animations replaced with simple 200ms ease. No elastic overshoot. No interaction glow. No materialization effect -- use simple opacity fade |
| **Dynamic Type** | All text respects system font size. Glass elements expand to accommodate larger text |
| **VoiceOver** | All glass elements have clear accessibility labels. Decorative layers are hidden from accessibility tree |
| **Color Blind** | Pillar identification never relies solely on color -- always paired with icons and labels |

---

## Brand Integration

### Optio Identity in Glass

- **Tab bar center logo**: The Optio chevron rendered as a glass-tinted element, slightly elevated above the tab bar
- **Background blobs**: Always include Optio Purple (`#6D469B`) and Optio Pink (`#EF597B`) in the ambient gradient wash
- **Primary action tinting**: CTA buttons use a purple-to-pink gradient applied as glass tint, maintaining translucency
- **Buddy integration**: The Optio Buddy character exists in the content layer, never behind glass -- it should feel present and alive, not trapped behind a surface

### What NOT to Do

- Do not apply glass blur to content cards (GlassCard used for content should migrate to Surface)
- Do not tint every glass element -- selective tinting only
- Do not use solid `optio-purple` or `optio-pink` fills on glass surfaces
- Do not stack glass on glass (e.g., a glass button inside a glass sheet)
- Do not animate decorative elements purely for visual flair
- Do not let glass effects override accessibility settings
