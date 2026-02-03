# Optio Platform - Color Reference

This document contains all base color values used throughout the Optio platform styling system.

## Brand Colors

### Primary Brand Colors
| Color Name | Hex Value | Usage |
|------------|-----------|-------|
| Optio Purple | `#6D469B` | Primary brand color, buttons, headers |
| Optio Pink | `#EF597B` | Accent color, gradients, highlights |

### Legacy Brand Colors (Backward Compatibility)
| Color Name | Hex Value | Usage |
|------------|-----------|-------|
| Primary | `#6d469b` | Same as Optio Purple |
| Primary Dark | `#5a3a82` | Hover states, darker variants |
| Primary Light | `#8058ac` | Lighter purple accents |
| Coral | `#ef597b` | Same as Optio Pink |
| Coral Dark | `#e73862` | Darker pink for hover states |

## Gradients

### Primary Gradient
```css
background: linear-gradient(135deg, #6d469b 0%, #ef597b 100%);
```
**Usage**: Primary buttons, hero sections, brand elements

### Text Shimmer Gradient
```css
background: linear-gradient(
  90deg,
  #6d469b 0%,
  #b794d6 20%,
  #ffffff 50%,
  #b794d6 80%,
  #6d469b 100%
);
```
**Usage**: Animated text effects

## Pillar Colors

The five skill pillars each have their own distinct color:

| Pillar | Hex Value | Description |
|--------|-----------|-------------|
| STEM & Logic | `#2469D1` | Blue - Science, Technology, Engineering, Math |
| Arts & Creativity | `#AF56E5` | Purple - Creative expression, visual arts |
| Language & Communication | `#3DA24A` | Green - Writing, speaking, communication skills |
| Life & Wellness | `#E65C5C` | Red - Health, self-care, personal development |
| Society & Culture | `#FF9028` | Orange - Social studies, cultural awareness |

## Neutral Palette

### Gray Scale
| Shade | Hex Value | Usage |
|-------|-----------|-------|
| Neutral 50 | `#F3EFF4` | Lightest background, subtle accents |
| Neutral 100 | `#EEEBEF` | Light background, card backgrounds |
| Neutral 300 | `#BAB4BB` | Borders, dividers |
| Neutral 400 | `#908B92` | Disabled states, muted text |
| Neutral 500 | `#605C61` | Secondary text |
| Neutral 700 | `#3B383C` | Primary text (dark) |
| Neutral 900 | `#1B191B` | Darkest text, headers |

## Text Colors

| Color Name | Hex Value | Usage |
|------------|-----------|-------|
| Text Primary | `#003f5c` | Main body text |
| Text Secondary | `#4a5568` | Secondary information |
| Text Muted | `#718096` | Muted, less important text |
| Text (Legacy) | `#212529` | Dark text |

## UI Colors

| Color Name | Hex Value | Usage |
|------------|-----------|-------|
| Secondary | `#FFCA3A` | Yellow accent, warnings |
| Background | `#F8F9FA` | Page backgrounds |
| Border | `#DEE2E6` | Border color, dividers |

## Tailwind Class Examples

### Using Brand Colors
```jsx
// Purple
className="bg-optio-purple text-white"
className="bg-primary hover:bg-primary-dark"

// Pink
className="bg-optio-pink text-white"
className="bg-coral hover:bg-coral-dark"

// Gradient
className="bg-gradient-primary"
```

### Using Pillar Colors
```jsx
className="text-pillar-stem"        // Blue
className="bg-pillar-arts"          // Purple
className="border-pillar-communication"  // Green
className="text-pillar-life"        // Red
className="bg-pillar-society"       // Orange
```

### Using Neutral Colors
```jsx
className="bg-neutral-50"   // Lightest
className="text-neutral-700"  // Dark text
className="border-neutral-300"  // Borders
```

## Shadow Values

### Card Shadows
```css
/* Default card shadow */
box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);

/* Card hover shadow */
box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
```

### Button Shadows
```css
/* Primary button shadow */
box-shadow: 0 4px 20px rgba(239, 89, 123, 0.15);

/* Primary button hover shadow */
box-shadow: 0 6px 25px rgba(239, 89, 123, 0.25);

/* Secondary button shadow */
box-shadow: 0 2px 10px rgba(109, 70, 155, 0.15);
```

## Color Opacity Variants

When you need transparency, use Tailwind's opacity modifiers:

```jsx
// Examples
className="bg-optio-purple/10"  // 10% opacity
className="bg-optio-purple/20"  // 20% opacity
className="bg-optio-pink/50"    // 50% opacity
className="text-pillar-stem/80"  // 80% opacity
```

## Accessibility Notes

- All text colors meet WCAG 2.1 AA contrast requirements when used on appropriate backgrounds
- Primary purple (#6D469B) on white has a contrast ratio of 6.2:1
- Neutral-700 (#3B383C) on white has a contrast ratio of 10.8:1
- Always test color combinations for sufficient contrast
- Pillar colors should primarily be used for accents, not large text blocks

## Design System Principles

1. **Primary Brand Identity**: Always use the purple (#6D469B) → pink (#EF597B) gradient for hero elements
2. **Pillar Consistency**: Each skill pillar maintains its assigned color across all components
3. **Neutral Foundation**: Use neutral palette for text and backgrounds to let brand colors pop
4. **Accessible Contrast**: Always maintain minimum 4.5:1 contrast ratio for body text
5. **Purposeful Color**: Every color choice should communicate meaning or hierarchy

---

**Last Updated**: January 2025
**Typography**: All components use Poppins font (Bold 700, Semi-Bold 600, Medium 500)
**Design Philosophy**: "The Process Is The Goal" - colors celebrate growth and learning journey
