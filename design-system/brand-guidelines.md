# Optio Brand Guidelines

## Brand Identity

### Mission
Optio helps students create self-validated diplomas through completing quests, building impressive portfolios with public evidence of their learning journey.

### Core Philosophy
**"The Process Is The Goal"**

- Learning is about who you become through the journey
- Celebrate growth happening RIGHT NOW, not future potential
- Focus on how learning FEELS, not how it LOOKS
- Every step, attempt, and mistake is valuable

See [core_philosophy.md](../core_philosophy.md) for full messaging guidelines.

## Color System

### Primary Brand Colors

**Optio Gradient** (PRIMARY)
```css
/* Gradient */
bg-gradient-to-r from-[#ef597b] to-[#6d469b]

/* Individual Colors */
Pink: #ef597b
Purple: #6d469b
```

**CRITICAL**: Always pink on LEFT, purple on RIGHT. Never swap.

### Secondary Colors

**Light Tints** (for backgrounds, hover states)
```css
Light Pink: #f8b3c5
Light Purple: #b794d6
```

**Accent Colors**
```css
Success/Green: #22c55e (green-500) - Used for "ACCREDITED" badges
Info/Blue: #3b82f6 (blue-500)
Warning/Red: #ef4444 (red-500)
```

### Neutral Colors (Tailwind Defaults)
```css
Gray Scale: gray-50 through gray-900
Text Primary: gray-900
Text Secondary: gray-600
Background: white, gray-50, gray-100
```

### Colors to AVOID
- Yellow (clashes with pink-purple gradient)
- Orange (clashes with pink-purple gradient)
- Emojis (use proper icons/SVGs instead)

## Typography

### Font Family
```css
font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
             'Helvetica Neue', Arial, sans-serif;
```

### Font Sizes (Tailwind Scale)
```css
/* Headings */
h1: text-4xl (36px) or text-5xl (48px)
h2: text-3xl (30px)
h3: text-2xl (24px)
h4: text-xl (20px)

/* Body */
Base: text-base (16px)
Small: text-sm (14px)
Tiny: text-xs (12px)

/* Large */
Display: text-6xl (60px) - text-8xl (96px)
```

### Font Weights
```css
Normal: font-normal (400)
Medium: font-medium (500)
Semibold: font-semibold (600)
Bold: font-bold (700)
```

## Spacing System

### Standard Spacing (Tailwind Scale)
```css
/* Use Tailwind spacing: 4px increments */
xs: 0.5 (2px)
sm: 1 (4px), 2 (8px), 3 (12px)
md: 4 (16px), 5 (20px), 6 (24px)
lg: 8 (32px), 10 (40px), 12 (48px)
xl: 16 (64px), 20 (80px), 24 (96px)
```

### Component Spacing
```css
/* Cards */
Padding: p-6 (24px) or p-8 (32px)
Gap between cards: gap-6 (24px)

/* Buttons */
Padding: px-6 py-3 (24px horizontal, 12px vertical)
Small buttons: px-4 py-2

/* Page margins */
Container: max-w-7xl mx-auto px-4 sm:px-6 lg:px-8
```

## Border Radius

```css
/* Standard Rounds */
Small: rounded-sm (2px)
Default: rounded-md (6px)
Large: rounded-lg (8px)
XL: rounded-xl (12px)
Full: rounded-full (9999px) - for circles/pills

/* Recommended Usage */
Cards: rounded-lg
Buttons: rounded-lg
Images: rounded-lg
Badges: rounded-full
```

## Shadows

```css
/* Tailwind Shadow Scale */
Small: shadow-sm
Default: shadow-md
Large: shadow-lg
XL: shadow-xl

/* Recommended Usage */
Cards: shadow-md hover:shadow-lg
Buttons: shadow-sm hover:shadow-md
Modals: shadow-xl
```

## Icons

### Guidelines
- Use SVG icons (not emojis)
- Heroicons recommended (matches Tailwind ecosystem)
- Size: w-5 h-5 (20px) for inline, w-6 h-6 (24px) for prominent
- Color: Match text color or use gradient

### Brand Assets
```
Favicon: https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/logos/icon.jpg
```

## Gradient Usage

### Text Gradients
```css
className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent"
```

### Background Gradients
```css
className="bg-gradient-to-r from-[#ef597b] to-[#6d469b]"
```

### Button Gradients
```css
className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white
           hover:from-[#d84567] hover:to-[#5a3a82] transition-all"
```

## Accessibility

### Contrast Requirements
- Text on gradient backgrounds: Use white text (meets WCAG AA)
- Text on white backgrounds: Use gray-900 or gray-600
- Interactive elements: Minimum 3:1 contrast ratio
- Text content: Minimum 4.5:1 contrast ratio

### Focus States
```css
focus:outline-none focus:ring-2 focus:ring-[#ef597b] focus:ring-offset-2
```

### Hover States
- Buttons: Slight darken or shadow increase
- Links: Underline or color change
- Cards: Shadow lift (shadow-md to shadow-lg)

## Responsive Design

### Breakpoints (Tailwind Defaults)
```css
sm: 640px   /* Small devices */
md: 768px   /* Tablets */
lg: 1024px  /* Laptops */
xl: 1280px  /* Desktops */
2xl: 1536px /* Large desktops */
```

### Mobile-First Approach
- Design for mobile first
- Progressive enhancement for larger screens
- Test all breakpoints
- Touch targets minimum 44x44px

## Animation & Transitions

### Standard Transitions
```css
transition-all duration-200 ease-in-out  /* Quick interactions */
transition-all duration-300 ease-in-out  /* Standard */
transition-all duration-500 ease-in-out  /* Slow/dramatic */
```

### Common Animations
```css
/* Hover lift */
hover:transform hover:-translate-y-1 hover:shadow-lg transition-all

/* Fade in */
animate-fade-in

/* Loading states */
animate-pulse
```

## Do's and Don'ts

### DO
- Use the pink-to-purple gradient consistently
- Keep pink on the left, purple on the right
- Use proper icons and SVGs
- Follow mobile-first design
- Maintain consistent spacing
- Test accessibility
- Follow core philosophy messaging

### DON'T
- Use emojis in UI
- Use yellow or orange colors
- Swap gradient direction
- Use inconsistent spacing
- Create tiny touch targets
- Skip responsive testing
- Ignore accessibility

## Brand Voice

### Tone
- Encouraging and supportive
- Process-focused (not outcome-focused)
- Present-tense celebration
- Authentic and honest

### Example Messaging
- "You're learning right now" (not "You'll be successful")
- "Every attempt teaches you something" (not "Keep trying until you succeed")
- "This is your journey" (not "Achieve your goals")

See [core_philosophy.md](../core_philosophy.md) for comprehensive messaging guidelines.

## Resources

- Tailwind CSS Documentation: https://tailwindcss.com/docs
- Heroicons: https://heroicons.com
- WCAG Guidelines: https://www.w3.org/WAI/WCAG21/quickref/
