# Color Migration Guide

**Last Updated**: 2025-01-22
**Status**: Documentation Phase
**Total Inline Colors Found**: 828 instances across 200+ files

## Summary

This document provides guidelines for migrating from inline hex colors to Tailwind CSS utility classes throughout the Optio frontend codebase.

## Current State

### Inline Hex Color Usage (828 instances)

**Most Common Colors:**
- `#6d469b` (lowercase purple): 497 instances - **PRIMARY BRAND COLOR**
- `#ef597b` (lowercase pink): 365 instances - **SECONDARY BRAND COLOR**
- `#6D469B` (uppercase purple): 50 instances - **DUPLICATE**
- `#EF597B` (uppercase pink): 29 instances - **DUPLICATE**
- `#003f5c` (dark blue): 55 instances - Text color
- `#2469D1` (STEM blue): 17 instances - Pillar color
- `#3DA24A` (Communication green): 15 instances - Pillar color
- `#FF9028` (Civics orange): 13 instances - Pillar color
- `#E65C5C` (Wellness red): 13 instances - Pillar color
- `#AF56E5` (Art purple): 13 instances - Pillar color

**Top Offending Files:**
1. DiplomaPage.jsx - 54 instances
2. ProfilePage.jsx - 24 instances
3. PromoLandingPage.jsx - 22 instances
4. HomePage.jsx - 22 instances
5. AdvisorBadgeForm.jsx - 21 instances

## Tailwind Configuration (Single Source of Truth)

Our Tailwind config defines all brand colors at [frontend/tailwind.config.js](../tailwind.config.js):

### Brand Colors
```javascript
colors: {
  // Legacy colors (backward compatibility)
  primary: '#6d469b',        // Use optio-purple instead
  'primary-dark': '#5a3a82',
  'primary-light': '#8058ac',
  coral: '#ef597b',          // Use optio-pink instead
  'coral-dark': '#e73862',

  // Design System: Brand colors
  'optio-purple': '#6D469B',  // PRIMARY BRAND COLOR
  'optio-pink': '#EF597B',    // SECONDARY BRAND COLOR

  // Design System: Pillar colors
  'pillar': {
    'stem': '#2469D1',
    'art': '#AF56E5',
    'communication': '#3DA24A',
    'wellness': '#E65C5C',
    'civics': '#FF9028',
  },

  // Design System: Neutral palette
  'neutral': {
    50: '#F3EFF4',
    100: '#EEEBEF',
    300: '#BAB4BB',
    400: '#908B92',
    500: '#605C61',
    700: '#3B383C',
    900: '#1B191B',
  },
}
```

### Gradients
```javascript
backgroundImage: {
  'gradient-primary': 'linear-gradient(135deg, #6d469b 0%, #ef597b 100%)',
}
```

## Migration Patterns

### Pattern 1: Brand Gradient (Most Common - 862 instances)

**BEFORE:**
```jsx
className="bg-gradient-to-r from-[#ef597b] to-[#6d469b]"
```

**AFTER:**
```jsx
className="bg-gradient-primary"
```

**Note:** The `bg-gradient-primary` utility is already defined in Tailwind config.

### Pattern 2: Purple Brand Color (547 instances total)

**BEFORE:**
```jsx
// Lowercase (497 instances)
className="text-[#6d469b]"
className="bg-[#6d469b]"
className="border-[#6d469b]"

// Uppercase (50 instances)
className="text-[#6D469B]"
```

**AFTER:**
```jsx
className="text-optio-purple"
className="bg-optio-purple"
className="border-optio-purple"
```

### Pattern 3: Pink Brand Color (394 instances total)

**BEFORE:**
```jsx
// Lowercase (365 instances)
className="text-[#ef597b]"
className="bg-[#ef597b]"
className="border-[#ef597b]"

// Uppercase (29 instances)
className="text-[#EF597B]"
```

**AFTER:**
```jsx
className="text-optio-pink"
className="bg-optio-pink"
className="border-optio-pink"
```

### Pattern 4: Pillar Colors (71 instances total)

**BEFORE:**
```jsx
className="text-[#2469D1]"  // STEM
className="text-[#3DA24A]"  // Communication
className="text-[#FF9028]"  // Civics
className="text-[#E65C5C]"  // Wellness
className="text-[#AF56E5]"  // Art
```

**AFTER:**
```jsx
className="text-pillar-stem"
className="text-pillar-communication"
className="text-pillar-civics"
className="text-pillar-wellness"
className="text-pillar-art"
```

### Pattern 5: Neutral Colors (Conditional Migration)

**BEFORE:**
```jsx
className="text-[#003f5c]"  // Dark blue text (55 instances)
className="bg-[#F3EFF4]"    // Light purple bg (16 instances)
className="text-[#3B383C]"  // Dark gray (20 instances)
```

**AFTER:**
```jsx
className="text-text-primary"    // Already in config
className="bg-neutral-50"
className="text-neutral-700"
```

## Migration Strategy

### Phase 1: Documentation (CURRENT)
- ✅ Audit all inline hex colors
- ✅ Document migration patterns
- ✅ Create this guide

### Phase 2: High-Priority Files (Future)
Migrate files with highest color usage:
1. DiplomaPage.jsx (54 instances)
2. ProfilePage.jsx (24 instances)
3. PromoLandingPage.jsx (22 instances)
4. HomePage.jsx (22 instances)
5. AdvisorBadgeForm.jsx (21 instances)

**Estimated effort**: 3-4 hours

### Phase 3: Admin Components (Future)
Migrate all admin/* components (200+ instances):
- AdminDashboard.jsx
- AdminQuests.jsx
- AdminQuestSuggestions.jsx
- AIPerformanceAnalytics.jsx
- BadgeEditorModal.jsx
- etc.

**Estimated effort**: 4-6 hours

### Phase 4: Remaining Components (Future)
Migrate demo/, connections/, diploma/, tutor/ components

**Estimated effort**: 6-8 hours

### Phase 5: Enforce with ESLint (Future)
Once all components migrated, add ESLint rule:

```javascript
// frontend/package.json or .eslintrc.cjs
{
  "rules": {
    "no-restricted-syntax": [
      "error",
      {
        "selector": "Literal[value=/#[0-9A-Fa-f]{6}/]",
        "message": "Do not use inline hex colors. Use Tailwind classes instead. See COLOR_MIGRATION_GUIDE.md"
      }
    ]
  }
}
```

## Benefits of Migration

1. **Single Source of Truth**: All colors defined in one place (tailwind.config.js)
2. **Easier Updates**: Change brand colors globally by updating config
3. **Consistency**: No more mixed uppercase/lowercase hex values
4. **Better DX**: Autocomplete for color classes in IDEs
5. **Smaller Bundle**: Tailwind purges unused classes, inline colors can't be purged
6. **Maintainability**: Clear semantic color names (optio-purple vs #6d469b)

## Quick Reference

| Inline Color | Tailwind Class | Usage |
|--------------|----------------|-------|
| `#6d469b` or `#6D469B` | `optio-purple` | Primary brand color |
| `#ef597b` or `#EF597B` | `optio-pink` | Secondary brand color |
| `from-[#ef597b] to-[#6d469b]` | `bg-gradient-primary` | Brand gradient |
| `#2469D1` | `pillar-stem` | STEM pillar color |
| `#3DA24A` | `pillar-communication` | Communication pillar |
| `#FF9028` | `pillar-civics` | Civics pillar |
| `#E65C5C` | `pillar-wellness` | Wellness pillar |
| `#AF56E5` | `pillar-art` | Art pillar |
| `#003f5c` | `text-primary` | Primary text color |
| `#F3EFF4` | `neutral-50` | Light background |
| `#3B383C` | `neutral-700` | Dark text |

## Migration Script (Future)

For bulk replacements, this sed script can help:

```bash
# Purple brand color
find frontend/src -name "*.jsx" -o -name "*.js" | xargs sed -i 's/\[#6d469b\]/optio-purple/g'
find frontend/src -name "*.jsx" -o -name "*.js" | xargs sed -i 's/\[#6D469B\]/optio-purple/g'

# Pink brand color
find frontend/src -name "*.jsx" -o -name "*.js" | xargs sed -i 's/\[#ef597b\]/optio-pink/g'
find frontend/src -name "*.jsx" -o -name "*.js" | xargs sed -i 's/\[#EF597B\]/optio-pink/g'

# Gradients (more complex - manual review recommended)
# from-[#ef597b] to-[#6d469b] → bg-gradient-primary
```

**WARNING**: Always test after bulk replacements. Some colors may have opacity modifiers or other complexities.

## Notes

- **DO NOT** enforce ESLint rule until migration is complete
- **DO** migrate files incrementally during feature work
- **DO** use Tailwind classes for all new code
- **DO** update this guide if new color patterns emerge
- **DO NOT** mix Tailwind classes with inline hex in the same file (pick one approach per file)

## Questions?

See [COLOR_REFERENCE.md](../../docs/COLOR_REFERENCE.md) for complete brand color documentation.
